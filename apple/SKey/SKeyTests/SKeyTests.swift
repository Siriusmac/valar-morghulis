import Foundation
import Testing
@testable import SKey

struct SKeyTests {
    @Test
    func loadsValidSupabaseConfiguration() throws {
        let configuration = try AppConfiguration(
            infoDictionary: [
                "SUPABASE_URL": "https://example.supabase.co",
                "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_example"
            ]
        )

        #expect(configuration.supabaseURL.absoluteString == "https://example.supabase.co")
        #expect(configuration.supabasePublishableKey == "sb_publishable_example")
    }

    @Test
    func rejectsMissingPublishableKey() {
        #expect(throws: AppConfigurationError.missingValue("SUPABASE_PUBLISHABLE_KEY")) {
            try AppConfiguration(
                infoDictionary: [
                    "SUPABASE_URL": "https://example.supabase.co"
                ]
            )
        }
    }

    @Test
    func rejectsNonSecureSupabaseURL() {
        #expect(throws: AppConfigurationError.invalidSupabaseURL) {
            try AppConfiguration(
                infoDictionary: [
                    "SUPABASE_URL": "http://example.supabase.co",
                    "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_example"
                ]
            )
        }
    }

    @Test
    func decodesProfileUsingSupabaseColumnNames() throws {
        let data = Data(
            #"{"id":"22222222-2222-2222-2222-222222222222","first_name":"Simone","last_name":"Miotto","full_name":"Simone Miotto","email":"simone@example.com"}"#
                .utf8
        )

        let profile = try JSONDecoder().decode(UserProfile.self, from: data)

        #expect(profile.firstName == "Simone")
        #expect(profile.lastName == "Miotto")
        #expect(profile.displayName == "Simone Miotto")
    }

    @Test
    func fallsBackToFullNameWhenProfilePartsAreMissing() {
        let profile = UserProfile(
            id: UUID(),
            firstName: nil,
            lastName: nil,
            fullName: "Anna",
            email: "anna@example.com"
        )

        #expect(profile.displayName == "Anna")
    }

    @Test
    func decodesPersonalAccountsFromVersionThreeSnapshot() throws {
        let data = Data(
            #"{"data":{"accounts":[{"id":"cash","name":"Contanti","institution":"Portafoglio","type":"cash","scope":"personal","openingBalance":42.50,"openingBalanceDate":"2026-08-01"}]}}"#
                .utf8
        )

        let row = try JSONDecoder().decode(PersonalAppDataRow.self, from: data)
        let account = try #require(row.data?.accounts?.first)

        #expect(account.id == "cash")
        #expect(account.type == .cash)
        #expect(account.openingBalance == Decimal(string: "42.50"))
    }

    @Test
    func decodesSharedAccountDatabaseColumns() throws {
        let data = Data(
            #"{"id":"33333333-3333-3333-3333-333333333333","family_id":"11111111-1111-1111-1111-111111111111","name":"Conto di famiglia","institution":"Cointestato","account_type":"bank","opening_balance":1250,"opening_balance_date":"2026-08-01"}"#
                .utf8
        )

        let account = try JSONDecoder().decode(SharedAccountRow.self, from: data)

        #expect(account.accountType == .bank)
        #expect(account.openingBalance == 1_250)
    }

    @Test
    func decodesFamilyInvitationLifecycle() throws {
        let data = Data(
            #"{"id":"44444444-4444-4444-4444-444444444444","family_id":"11111111-1111-1111-1111-111111111111","email":"anna@example.com","expires_at":"2026-08-22T10:00:00Z","accepted_at":null,"declined_at":null}"#.utf8
        )
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let invitation = try decoder.decode(FamilyInvitationRow.self, from: data)

        #expect(invitation.email == "anna@example.com")
        #expect(invitation.acceptedAt == nil)
        #expect(invitation.declinedAt == nil)
    }

    @Test
    func decodesPrivateReimbursementAccountReference() throws {
        let data = Data(
            #"{"family_id":"11111111-1111-1111-1111-111111111111","owner_id":"22222222-2222-2222-2222-222222222222","account_id":"cash","display_name":"Contanti"}"#.utf8
        )
        let row = try JSONDecoder().decode(ReimbursementAccountRow.self, from: data)

        #expect(row.accountID == "cash")
        #expect(row.displayName == "Contanti")
    }

    @Test
    func exposesEveryNativeDestinationInOneSidebarGroup() {
        let groupedDestinations = AppDestination.Group.allCases.flatMap {
            AppDestination.destinations(in: $0)
        }

        #expect(Set(groupedDestinations) == Set(AppDestination.allCases))
        #expect(groupedDestinations.count == AppDestination.allCases.count)
    }

    @Test
    func preservesUnknownAppDataFieldsThroughJSONValue() throws {
        let original = Data(
            #"{"version":3,"movements":[],"futureFeature":{"enabled":true},"amount":12.45}"#.utf8
        )

        let value = try JSONDecoder().decode(JSONValue.self, from: original)
        let encoded = try JSONEncoder().encode(value)
        let decoded = try JSONDecoder().decode(JSONValue.self, from: encoded)

        #expect(decoded.objectValue?["futureFeature"]?.objectValue?["enabled"] == .bool(true))
        #expect(decoded.objectValue?["amount"] == .number(Decimal(string: "12.45")!))
    }

    @Test
    func createsStableMovementDraftIDForSafeRetries() {
        let account = AccountSummary(
            id: "cash",
            familyID: nil,
            name: "Contanti",
            institution: "Portafoglio",
            kind: .cash,
            openingBalance: 0,
            openingBalanceDate: nil
        )
        let category = LedgerDirectoryItem(
            id: "alimentari",
            name: "Alimentari",
            scope: .personal,
            ownerID: "user",
            movementType: .expense,
            color: "#c64e2f"
        )
        let beneficiary = LedgerDirectoryItem(
            id: "lidl",
            name: "Lidl",
            scope: .personal,
            ownerID: "user",
            movementType: nil,
            color: nil
        )
        let draft = MovementDraft(
            id: "movement-retry",
            type: .expense,
            amount: 30,
            date: Date(timeIntervalSince1970: 0),
            description: "Spesa",
            comments: nil,
            account: account,
            category: category,
            counterparty: beneficiary,
            isShared: false,
            affectsAccountBalance: nil
        )

        #expect(draft.id == "movement-retry")
    }

    @Test
    func encodesAPNsDeviceTokenAsLowercaseHexadecimal() {
        let token = PushNotificationCoordinator.hexadecimalToken(from: Data([0x00, 0x0f, 0xa5, 0xff]))

        #expect(token == "000fa5ff")
    }

    @Test
    func routesReimbursementPushToItsConfirmation() {
        let familyID = "11111111-1111-1111-1111-111111111111"
        let route = PushNotificationCoordinator.reimbursementRoute(from: [
            "type": "reimbursement",
            "familyId": familyID,
            "reimbursementId": "reimbursement-1",
        ])

        #expect(route?.familyID.uuidString.lowercased() == familyID)
        #expect(route?.reimbursementID == "reimbursement-1")
    }

    @Test
    func routesCommissionedPurchasePushToContacts() {
        let route = PushNotificationCoordinator.commissionedPurchaseRoute(from: [
            "type": "commissioned_purchase",
            "familyId": "11111111-1111-1111-1111-111111111111",
            "purchaseId": "purchase-1",
        ])

        #expect(route?.purchaseID == "purchase-1")
        #expect(route?.familyID != nil)
    }

    @Test
    func moneyRoundsAndFormatsUsingIntegerCents() {
        #expect(Money(decimal: Decimal(string: "12.345")!).cents == 1_235)
        #expect(Money(cents: -450).decimal == Decimal(string: "-4.5"))
    }

    @Test
    func splitsInstallmentTotalInCentsAssigningRemainderToLastPayment() {
        let amounts = LedgerCalculations.installmentAmounts(total: 100, count: 3)

        #expect(amounts == [Money(cents: 3_333), Money(cents: 3_333), Money(cents: 3_334)])
        #expect(amounts.reduce(Money.zero, +) == Money(cents: 10_000))
    }

    @Test
    func distributesCategorySplitsAcrossInstallmentsWithoutLosingCents() {
        let installments = LedgerCalculations.installmentAmounts(total: 100, count: 3)
        let rows = LedgerCalculations.splitAllocationsAcrossInstallments(
            allocations: [Money(cents: 7_000), Money(cents: 3_000)],
            installments: installments
        )

        #expect(rows == [
            [Money(cents: 2_333), Money(cents: 1_000)],
            [Money(cents: 2_333), Money(cents: 1_000)],
            [Money(cents: 2_334), Money(cents: 1_000)]
        ])
        #expect(rows.flatMap { $0 }.reduce(.zero, +) == Money(cents: 10_000))
    }

    @Test
    func clampsMonthlyInstallmentDateToEndOfMonth() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(secondsFromGMT: 0))
        let january31 = try #require(calendar.date(from: DateComponents(year: 2026, month: 1, day: 31)))
        let february = LedgerCalculations.date(byAddingMonths: 1, to: january31, calendar: calendar)

        #expect(calendar.dateComponents([.year, .month, .day], from: february) == DateComponents(year: 2026, month: 2, day: 28))
    }

    @Test
    func decodesInstallmentMovementAndScheduledPaymentFromWebAppData() throws {
        let movementData = Data(
            #"{"id":"movement-1","type":"expense","authorId":"user","memberId":"user","amount":33.33,"date":"2026-08-15","description":"Acquisto · rata 1/3","categoryId":"shopping","beneficiaryId":"store","accountId":"bank","shared":true,"installmentPlanId":"plan-1","installmentProvider":"Klarna","installmentNumber":1,"installmentCount":3,"sharedSettlementAmount":100,"createdAt":"2026-08-15T10:00:00Z"}"#.utf8
        )
        let paymentData = Data(
            #"{"id":"payment-2","planId":"plan-1","authorId":"user","memberId":"user","amount":33.33,"dueDate":"2026-09-15","description":"Acquisto","categoryId":"shopping","beneficiaryId":"store","accountId":"bank","shared":true,"provider":"Klarna","installmentNumber":2,"installmentCount":3,"status":"scheduled"}"#.utf8
        )

        let movement = try JSONDecoder().decode(LedgerMovement.self, from: movementData)
        let payment = try JSONDecoder().decode(LedgerScheduledPayment.self, from: paymentData)

        #expect(movement.installmentPlanID == payment.planID)
        #expect(movement.sharedSettlementAmount == Money(cents: 10_000))
        #expect(payment.status == .scheduled)
        #expect(payment.installmentNumber == 2)
    }

    @Test
    func decodesMovementFromAppDataVersionThree() throws {
        let data = Data(
            #"{"id":"movement-1","type":"expense","authorId":"user","memberId":"user","amount":30.25,"date":"2026-08-14","description":"Spesa","categoryId":"food","beneficiaryId":"market","accountId":"cash","shared":true,"createdAt":"2026-08-14T10:00:00Z"}"#.utf8
        )

        let movement = try JSONDecoder().decode(LedgerMovement.self, from: data)

        #expect(movement.amount == Money(cents: 3_025))
        #expect(movement.categoryID == "food")
        #expect(movement.shared)
    }

    @Test
    func calculatesAccountBalanceWithMovementsTransfersAndConfirmedReimbursements() {
        let account = ledgerAccount(id: "bank", openingBalance: 100)
        let snapshot = ledgerSnapshot(
            accounts: [account, ledgerAccount(id: "cash", openingBalance: 0)],
            movements: [
                ledgerMovement(id: "expense", amount: 30, accountID: account.id),
                ledgerMovement(id: "income", type: .income, amount: 50, accountID: account.id),
                ledgerMovement(
                    id: "statistics",
                    amount: 90,
                    accountID: account.id,
                    affectsAccountBalance: false
                )
            ],
            transfers: [
                LedgerTransfer(
                    id: "transfer",
                    authorID: "user",
                    fromAccountID: account.id,
                    toAccountID: "cash",
                    amount: Money(cents: 1_000),
                    date: "2026-08-14",
                    description: "Prelievo"
                )
            ],
            reimbursements: [
                LedgerReimbursement(
                    id: "confirmed",
                    fromID: "other",
                    toID: "user",
                    amount: Money(cents: 500),
                    date: "2026-08-14",
                    authorID: "other",
                    fromAccountID: nil,
                    toAccountID: account.id,
                    status: .confirmed
                ),
                LedgerReimbursement(
                    id: "pending",
                    fromID: "user",
                    toID: "other",
                    amount: Money(cents: 900),
                    date: "2026-08-14",
                    authorID: "user",
                    fromAccountID: account.id,
                    toAccountID: nil,
                    status: .pending
                )
            ]
        )

        #expect(LedgerCalculations.accountBalance(account, in: snapshot) == Money(cents: 11_500))
    }

    @Test
    func doesNotChargePurchaseReimbursementTwice() {
        let account = ledgerAccount(id: "bank", openingBalance: 100)
        let snapshot = ledgerSnapshot(
            accounts: [account],
            movements: [ledgerMovement(id: "commissioned", amount: 25, accountID: account.id, shared: false)],
            reimbursements: [LedgerReimbursement(
                id: "purchase", fromID: "user", toID: "other", amount: Money(cents: 2_500),
                date: "2026-08-16", authorID: "user", fromAccountID: account.id,
                toAccountID: nil, status: .confirmed, settlementMethod: .purchase,
                commissionedPurchaseID: "purchase-1"
            )]
        )

        #expect(LedgerCalculations.accountBalance(account, in: snapshot) == Money(cents: 7_500))
    }

    @Test
    func calculatesTwoMemberSharedBalanceAndExcludesFamilyAccount() {
        let personal = ledgerAccount(id: "personal", openingBalance: 0)
        let family = AccountSummary(
            id: "family",
            familyID: UUID(uuidString: "11111111-1111-1111-1111-111111111111"),
            name: "Famiglia",
            institution: "",
            kind: .bank,
            openingBalance: 0,
            openingBalanceDate: nil
        )
        let snapshot = ledgerSnapshot(
            memberCount: 2,
            accounts: [personal, family],
            movements: [
                ledgerMovement(id: "mine", amount: 30, accountID: personal.id, memberID: "user"),
                ledgerMovement(id: "other", amount: 50, accountID: "other-private", memberID: "other"),
                ledgerMovement(id: "family-paid", amount: 100, accountID: family.id, memberID: "user")
            ]
        )

        #expect(LedgerCalculations.sharedBalance(in: snapshot) == Money(cents: -1_000))
    }

    @Test
    func purchaseReimbursementSettlesTheFullAmountForOneCounterparty() {
        let snapshot = ledgerSnapshot(
            memberCount: 3,
            accounts: [],
            movements: [],
            reimbursements: [LedgerReimbursement(
                id: "purchase-settlement",
                fromID: "user",
                toID: "anna",
                amount: Money(cents: 5_000),
                date: "2026-08-29",
                authorID: "user",
                fromAccountID: "user-bank",
                toAccountID: nil,
                status: .confirmed,
                settlementMethod: .purchase,
                commissionedPurchaseID: "cosmetics"
            )]
        )

        #expect(LedgerCalculations.sharedBalance(in: snapshot) == Money(cents: 5_000))
        #expect(LedgerCalculations.sharedBalance(in: snapshot, userID: "anna") == Money(cents: -5_000))
    }

    @Test
    func calculatesFamilyToPersonalTransferEvenWhenDestinationAccountIsPrivate() {
        let family = AccountSummary(
            id: "family",
            familyID: UUID(uuidString: "11111111-1111-1111-1111-111111111111"),
            name: "Famiglia",
            institution: "",
            kind: .bank,
            openingBalance: 0,
            openingBalanceDate: nil
        )
        let snapshot = ledgerSnapshot(
            memberCount: 2,
            accounts: [family],
            movements: [],
            transfers: [
                LedgerTransfer(
                    id: "family-to-private",
                    authorID: "other",
                    fromAccountID: family.id,
                    toAccountID: "other-private",
                    amount: Money(cents: 10_000),
                    date: "2026-08-16",
                    description: "Prelievo dal conto famiglia"
                )
            ]
        )

        #expect(LedgerCalculations.sharedBalance(in: snapshot) == Money(cents: 5_000))
        #expect(LedgerCalculations.sharedBalance(in: snapshot, userID: "other") == Money(cents: -5_000))
    }

    @Test
    func plansMultiMemberReimbursementsAcrossCurrentCreditors() {
        let base = ledgerSnapshot(
            memberCount: 3,
            accounts: [ledgerAccount(id: "personal", openingBalance: 0)],
            movements: [
                ledgerMovement(id: "simone", amount: 90, accountID: "simone-bank", memberID: "simone"),
                ledgerMovement(id: "anna", amount: 60, accountID: "anna-bank", memberID: "anna")
            ]
        )
        let snapshot = LedgerSnapshot(
            currentUserID: "third",
            memberCount: base.memberCount,
            accounts: base.accounts,
            categories: base.categories,
            beneficiaries: base.beneficiaries,
            senders: base.senders,
            movements: base.movements,
            transfers: [],
            reimbursements: []
        )

        let plan = LedgerCalculations.reimbursementPlan(
            in: snapshot,
            memberIDs: ["simone", "anna", "third"]
        )

        #expect(plan.map(\.memberID) == ["simone", "anna"])
        #expect(plan.map(\.availableCredit) == [Money(cents: 4_000), Money(cents: 1_000)])
        #expect(plan.map(\.suggestedAmount) == [Money(cents: 4_000), Money(cents: 1_000)])
    }

    @Test
    func calculatesOnlySharedSplitAmount() {
        let movement = ledgerMovement(
            id: "split",
            amount: 100,
            accountID: "personal",
            shared: false,
            splits: [
                LedgerMovementSplit(
                    id: "shared",
                    amount: Money(cents: 3_000),
                    categoryID: "home",
                    beneficiaryID: nil,
                    shared: true
                )
            ]
        )

        #expect(LedgerCalculations.sharedAmount(of: movement) == Money(cents: 3_000))
    }

    @Test
    func aggregatesMonthlyPercentagesByCategoryUsingSplitRemainder() {
        let food = LedgerDirectoryItem(
            id: "food",
            name: "Alimentari",
            scope: .personal,
            ownerID: "user",
            movementType: .expense,
            color: "#c64e2f"
        )
        let home = LedgerDirectoryItem(
            id: "home",
            name: "Casa",
            scope: .personal,
            ownerID: "user",
            movementType: .expense,
            color: "#3f7650"
        )
        let movement = ledgerMovement(
            id: "split-categories",
            amount: 100,
            accountID: "personal",
            splits: [
                LedgerMovementSplit(
                    id: "home-split",
                    amount: Money(cents: 3_000),
                    categoryID: home.id,
                    beneficiaryID: nil,
                    shared: false
                )
            ]
        )
        let base = ledgerSnapshot(
            accounts: [ledgerAccount(id: "personal", openingBalance: 0)],
            movements: [movement]
        )
        let snapshot = LedgerSnapshot(
            currentUserID: base.currentUserID,
            memberCount: base.memberCount,
            accounts: base.accounts,
            categories: [food, home],
            beneficiaries: [],
            senders: [],
            movements: [
                LedgerMovement(
                    id: movement.id,
                    type: movement.type,
                    authorID: movement.authorID,
                    memberID: movement.memberID,
                    amount: movement.amount,
                    date: movement.date,
                    description: movement.description,
                    categoryID: food.id,
                    beneficiaryID: movement.beneficiaryID,
                    senderID: movement.senderID,
                    accountID: movement.accountID,
                    tagID: movement.tagID,
                    comments: movement.comments,
                    shared: movement.shared,
                    splits: movement.splits,
                    sharedSettlementAmount: movement.sharedSettlementAmount,
                    affectsAccountBalance: movement.affectsAccountBalance,
                    createdAt: movement.createdAt
                )
            ],
            transfers: [],
            reimbursements: []
        )

        let totals = LedgerCalculations.categoryTotals(
            in: snapshot,
            movements: snapshot.movements,
            sharedOnly: false
        )

        #expect(totals.map(\.name) == ["Alimentari", "Casa"])
        #expect(totals.map(\.amount) == [Money(cents: 7_000), Money(cents: 3_000)])
    }

    @Test
    func aggregatesSharedExpensesByDayAndMemberLikeWebDashboard() {
        let personal = ledgerAccount(id: "personal", openingBalance: 0)
        let family = AccountSummary(
            id: "family",
            familyID: UUID(uuidString: "11111111-1111-1111-1111-111111111111"),
            name: "Famiglia",
            institution: "",
            kind: .bank,
            openingBalance: 0,
            openingBalanceDate: nil
        )
        let partial = ledgerMovement(
            id: "partial",
            amount: 100,
            accountID: personal.id,
            memberID: "user",
            shared: false,
            splits: [
                LedgerMovementSplit(
                    id: "shared",
                    amount: Money(cents: 2_000),
                    categoryID: "category",
                    beneficiaryID: nil,
                    shared: true
                )
            ]
        )
        let familyPaid = ledgerMovement(
            id: "family-paid",
            amount: 90,
            accountID: family.id,
            memberID: "other",
            shared: true
        )
        let snapshot = ledgerSnapshot(
            memberCount: 2,
            accounts: [personal, family],
            movements: [partial, familyPaid]
        )

        let daily = LedgerCalculations.dailySharedExpenseTotals(
            in: snapshot,
            month: "2026-08",
            days: 31
        )
        let members = LedgerCalculations.sharedExpensesByMember(
            in: snapshot,
            memberIDs: ["user", "other"],
            month: "2026-08"
        )

        #expect(daily[13].amount == Money(cents: 11_000))
        #expect(members.map(\.amount) == [Money(cents: 2_000), .zero])
    }

    private func ledgerAccount(id: String, openingBalance: Decimal) -> AccountSummary {
        AccountSummary(
            id: id,
            familyID: nil,
            name: id,
            institution: "",
            kind: .bank,
            openingBalance: openingBalance,
            openingBalanceDate: nil
        )
    }

    private func ledgerMovement(
        id: String,
        type: MovementKind = .expense,
        amount: Decimal,
        accountID: String,
        memberID: String = "user",
        shared: Bool = true,
        splits: [LedgerMovementSplit]? = nil,
        affectsAccountBalance: Bool? = nil
    ) -> LedgerMovement {
        LedgerMovement(
            id: id,
            type: type,
            authorID: memberID,
            memberID: memberID,
            amount: Money(decimal: amount),
            date: "2026-08-14",
            description: id,
            categoryID: "category",
            beneficiaryID: "beneficiary",
            senderID: nil,
            accountID: accountID,
            tagID: nil,
            comments: nil,
            shared: shared,
            splits: splits,
            sharedSettlementAmount: nil,
            affectsAccountBalance: affectsAccountBalance,
            createdAt: "2026-08-14T10:00:00Z"
        )
    }

    private func ledgerSnapshot(
        memberCount: Int = 1,
        accounts: [AccountSummary],
        movements: [LedgerMovement],
        transfers: [LedgerTransfer] = [],
        reimbursements: [LedgerReimbursement] = []
    ) -> LedgerSnapshot {
        LedgerSnapshot(
            currentUserID: "user",
            memberCount: memberCount,
            accounts: accounts,
            categories: [],
            beneficiaries: [],
            senders: [],
            movements: movements,
            transfers: transfers,
            reimbursements: reimbursements
        )
    }
}
