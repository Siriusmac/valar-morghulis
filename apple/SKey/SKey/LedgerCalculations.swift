import Foundation

nonisolated enum LedgerCalculations {
    static func installmentAmounts(total: Decimal, count: Int) -> [Money] {
        guard count > 1 else { return [Money(decimal: total)] }
        let totalCents = Money(decimal: total).cents
        let base = totalCents / Int64(count)
        let remainder = totalCents - base * Int64(count)
        return (0..<count).map { index in
            Money(cents: base + (index == count - 1 ? remainder : 0))
        }
    }

    static func splitAllocationsAcrossInstallments(
        allocations: [Money],
        installments: [Money]
    ) -> [[Money]] {
        var remaining = allocations.map(\.cents)
        return installments.enumerated().map { installmentIndex, installment in
            if installmentIndex == installments.count - 1 {
                return remaining.map(Money.init(cents:))
            }

            let remainingTotal = remaining.reduce(0, +)
            guard remainingTotal > 0 else { return remaining.map { _ in .zero } }

            let products = remaining.map { $0 * installment.cents }
            var row = products.enumerated().map { index, product in
                min(remaining[index], product / remainingTotal)
            }
            var centsToAssign = installment.cents - row.reduce(0, +)
            let priority = products.enumerated().sorted { lhs, rhs in
                let lhsRemainder = lhs.element % remainingTotal
                let rhsRemainder = rhs.element % remainingTotal
                return lhsRemainder == rhsRemainder ? lhs.offset < rhs.offset : lhsRemainder > rhsRemainder
            }
            for item in priority where centsToAssign > 0 {
                guard row[item.offset] < remaining[item.offset] else { continue }
                row[item.offset] += 1
                centsToAssign -= 1
            }
            for index in row.indices { remaining[index] -= row[index] }
            return row.map(Money.init(cents:))
        }
    }

    static func date(byAddingMonths months: Int, to date: Date, calendar: Calendar = .current) -> Date {
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        let firstOfTarget = calendar.date(
            from: DateComponents(year: components.year, month: (components.month ?? 1) + months, day: 1)
        ) ?? date
        let range = calendar.range(of: .day, in: .month, for: firstOfTarget)
        let day = min(components.day ?? 1, range?.count ?? 28)
        return calendar.date(bySetting: .day, value: day, of: firstOfTarget) ?? firstOfTarget
    }

    static func allocations(of movement: LedgerMovement) -> [LedgerAllocation] {
        let splits = (movement.splits ?? []).filter { $0.amount > .zero }
        let splitTotal = splits.reduce(Money.zero) { $0 + $1.amount }
        let remainder = Money(cents: max(0, movement.amount.cents - splitTotal.cents))

        return (remainder > .zero
            ? [LedgerAllocation(
                categoryID: movement.categoryID,
                beneficiaryID: movement.beneficiaryID,
                amount: remainder,
                shared: movement.shared
            )]
            : [])
            + splits.map {
                LedgerAllocation(
                    categoryID: $0.categoryID,
                    beneficiaryID: $0.beneficiaryID,
                    amount: $0.amount,
                    shared: $0.shared
                )
            }
    }

    static func accountBalance(_ account: AccountSummary, in snapshot: LedgerSnapshot) -> Money {
        var balance = Money(decimal: account.openingBalance)

        for movement in snapshot.movements where movement.accountID.caseInsensitiveCompare(account.id) == .orderedSame {
            guard movement.affectsAccountBalance != false else { continue }
            balance = movement.type == .income ? balance + movement.amount : balance - movement.amount
        }

        for transfer in snapshot.transfers {
            if transfer.fromAccountID.caseInsensitiveCompare(account.id) == .orderedSame {
                balance = balance - transfer.amount
            }
            if transfer.toAccountID.caseInsensitiveCompare(account.id) == .orderedSame {
                balance = balance + transfer.amount
            }
        }

        for reimbursement in snapshot.reimbursements where reimbursementIsConfirmed(reimbursement) {
            if reimbursement.settlementMethod == .purchase { continue }
            if reimbursement.fromAccountID?.caseInsensitiveCompare(account.id) == .orderedSame {
                balance = balance - reimbursement.amount
            }
            if reimbursement.toAccountID?.caseInsensitiveCompare(account.id) == .orderedSame {
                balance = balance + reimbursement.amount
            }
        }

        return balance
    }

    static func sharedAmount(of movement: LedgerMovement) -> Money {
        if let settlement = movement.sharedSettlementAmount {
            let hasSharedSplit = movement.splits?.contains { $0.shared } == true
            return movement.shared || hasSharedSplit ? settlement : .zero
        }

        let splitTotal = (movement.splits ?? []).reduce(Money.zero) { partial, split in
            partial + split.amount
        }
        let remainder = Money(cents: max(0, movement.amount.cents - splitTotal.cents))
        let sharedSplits = (movement.splits ?? [])
            .filter(\.shared)
            .reduce(Money.zero) { $0 + $1.amount }
        return sharedSplits + (movement.shared ? remainder : .zero)
    }

    static func categoryTotals(
        in snapshot: LedgerSnapshot,
        movements: [LedgerMovement],
        sharedOnly: Bool,
        maximumSlices: Int = 6
    ) -> [LedgerCategoryTotal] {
        var totals: [String: Money] = [:]
        for movement in movements {
            if movement.excludeFromReports == true { continue }
            let familyAccount = snapshot.account(named: movement.accountID)?.familyID != nil
            for allocation in allocations(of: movement) {
                if sharedOnly && !familyAccount && !allocation.shared { continue }
                totals[allocation.categoryID] = totals[allocation.categoryID, default: .zero]
                    + allocation.amount
            }
        }

        let sorted = totals.map { categoryID, amount in
            let category = snapshot.categories.first { $0.id == categoryID }
            return LedgerCategoryTotal(
                id: categoryID,
                name: category?.name ?? "Senza categoria",
                color: category?.color,
                amount: amount
            )
        }
        .sorted {
            if $0.amount != $1.amount { return $0.amount > $1.amount }
            return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }

        guard maximumSlices > 1, sorted.count > maximumSlices else { return sorted }
        let visible = Array(sorted.prefix(maximumSlices - 1))
        let otherAmount = sorted.dropFirst(maximumSlices - 1).reduce(Money.zero) {
            $0 + $1.amount
        }
        return visible + [
            LedgerCategoryTotal(id: "other", name: "Altro", color: nil, amount: otherAmount)
        ]
    }

    static func dailySharedExpenseTotals(
        in snapshot: LedgerSnapshot,
        month: String,
        days: Int
    ) -> [LedgerDailyTotal] {
        var totals = Array(repeating: Money.zero, count: max(0, days))
        for movement in snapshot.movements where movement.type == .expense && movement.date.hasPrefix(month) {
            if movement.excludeFromReports == true { continue }
            guard hasSharedPortion(movement, in: snapshot) else { continue }
            guard
                let day = Int(movement.date.suffix(2)),
                totals.indices.contains(day - 1)
            else {
                continue
            }
            let amount = snapshot.account(named: movement.accountID)?.familyID != nil
                ? movement.amount
                : sharedAmount(of: movement)
            totals[day - 1] = totals[day - 1] + amount
        }
        return totals.enumerated().map { LedgerDailyTotal(day: $0.offset + 1, amount: $0.element) }
    }

    static func sharedExpensesByMember(
        in snapshot: LedgerSnapshot,
        memberIDs: [String],
        month: String
    ) -> [LedgerMemberTotal] {
        let normalizedIDs = memberIDs.map { $0.lowercased() }
        var totals = Dictionary(uniqueKeysWithValues: normalizedIDs.map { ($0, Money.zero) })

        for movement in snapshot.movements where movement.type == .expense && movement.date.hasPrefix(month) {
            if movement.excludeFromReports == true { continue }
            if snapshot.account(named: movement.accountID)?.familyID != nil { continue }
            let memberID = movement.memberID.lowercased()
            guard totals[memberID] != nil else { continue }
            let amount = sharedAmount(of: movement)
            guard amount > .zero else { continue }
            totals[memberID] = totals[memberID, default: .zero] + amount
        }

        return normalizedIDs.map {
            LedgerMemberTotal(memberID: $0, amount: totals[$0, default: .zero])
        }
    }

    static func hasSharedPortion(_ movement: LedgerMovement, in snapshot: LedgerSnapshot) -> Bool {
        snapshot.account(named: movement.accountID)?.familyID != nil
            || sharedAmount(of: movement) > .zero
    }

    static func sharedBalance(in snapshot: LedgerSnapshot) -> Money {
        sharedBalance(in: snapshot, userID: snapshot.currentUserID)
    }

    static func sharedBalance(in snapshot: LedgerSnapshot, userID: String) -> Money {
        guard snapshot.memberCount >= 2 else { return .zero }

        let memberCount = Decimal(snapshot.memberCount)
        let otherMembers = Decimal(snapshot.memberCount - 1)
        var net = Decimal.zero

        for movement in snapshot.movements {
            if snapshot.account(named: movement.accountID)?.familyID != nil { continue }
            let amount = sharedAmount(of: movement)
            guard amount > .zero else { continue }

            let direction: Decimal = movement.type == .expense ? 1 : -1
            if movement.memberID.caseInsensitiveCompare(userID) == .orderedSame {
                net += amount.decimal * otherMembers / memberCount * direction
            } else {
                net -= amount.decimal / memberCount * direction
            }
        }

        for reimbursement in snapshot.reimbursements where reimbursementIsConfirmed(reimbursement) {
            let destinationIsFamily = reimbursement.toAccountID
                .flatMap(snapshot.account(named:))?.familyID != nil
            if destinationIsFamily {
                if reimbursement.fromID.caseInsensitiveCompare(userID) == .orderedSame {
                    net += reimbursement.amount.decimal * otherMembers / memberCount
                } else {
                    net -= reimbursement.amount.decimal / memberCount
                }
            } else {
                if reimbursement.toID.caseInsensitiveCompare(userID) == .orderedSame {
                    net -= reimbursement.amount.decimal
                }
                if reimbursement.fromID.caseInsensitiveCompare(userID) == .orderedSame {
                    net += reimbursement.amount.decimal
                }
            }
        }

        for transfer in snapshot.transfers {
            let sourceIsFamily = snapshot.account(named: transfer.fromAccountID)?.familyID != nil
            let destinationIsFamily = snapshot.account(named: transfer.toAccountID)?.familyID != nil
            guard sourceIsFamily, !destinationIsFamily else { continue }

            if transfer.authorID.caseInsensitiveCompare(userID) == .orderedSame {
                net -= transfer.amount.decimal * otherMembers / memberCount
            } else {
                net += transfer.amount.decimal / memberCount
            }
        }

        return Money(decimal: net)
    }

    static func reimbursementPlan(in snapshot: LedgerSnapshot, memberIDs: [String]) -> [ReimbursementPlanItem] {
        guard snapshot.memberCount >= 2 else { return [] }
        let pendingPersonal = snapshot.reimbursements.filter { reimbursement in
            guard reimbursement.status == .pending else { return false }
            let destinationIsFamily = reimbursement.toAccountID
                .flatMap(snapshot.account(named:))?.familyID != nil
            return !destinationIsFamily
        }
        let pendingOutbound = pendingPersonal
            .filter { $0.fromID.caseInsensitiveCompare(snapshot.currentUserID) == .orderedSame }
            .reduce(Money.zero) { $0 + $1.amount }
        var remainingDebt = Money(cents: max(
            0,
            -sharedBalance(in: snapshot).cents - pendingOutbound.cents
        ))

        var credits: [(memberID: String, availableCredit: Money)] = []
        for memberID in memberIDs where memberID.caseInsensitiveCompare(snapshot.currentUserID) != .orderedSame {
            let credit = Money(cents: max(0, sharedBalance(in: snapshot, userID: memberID).cents))
            let pendingIncoming = pendingPersonal
                .filter { $0.toID.caseInsensitiveCompare(memberID) == .orderedSame }
                .reduce(Money.zero) { $0 + $1.amount }
            let availableCredit = Money(cents: max(0, credit.cents - pendingIncoming.cents))
            if availableCredit > .zero {
                credits.append((memberID, availableCredit))
            }
        }
        credits.sort {
            if $0.availableCredit != $1.availableCredit {
                return $0.availableCredit > $1.availableCredit
            }
            return $0.memberID < $1.memberID
        }

        var plan: [ReimbursementPlanItem] = []
        for credit in credits where remainingDebt > .zero {
            let amount = Money(cents: min(remainingDebt.cents, credit.availableCredit.cents))
            remainingDebt = Money(cents: remainingDebt.cents - amount.cents)
            plan.append(ReimbursementPlanItem(
                memberID: credit.memberID,
                availableCredit: credit.availableCredit,
                suggestedAmount: amount
            ))
        }
        return plan
    }

    static func reimbursementIsConfirmed(_ reimbursement: LedgerReimbursement) -> Bool {
        reimbursement.status == nil || reimbursement.status == .confirmed
    }
}
