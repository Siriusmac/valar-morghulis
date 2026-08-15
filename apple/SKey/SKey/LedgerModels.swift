import Foundation

nonisolated struct Money: Codable, Equatable, Comparable, Hashable, Sendable {
    let cents: Int64

    init(cents: Int64) {
        self.cents = cents
    }

    init(decimal: Decimal) {
        var source = decimal * 100
        var rounded = Decimal()
        NSDecimalRound(&rounded, &source, 0, .plain)
        cents = NSDecimalNumber(decimal: rounded).int64Value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        self.init(decimal: try container.decode(Decimal.self))
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(decimal)
    }

    var decimal: Decimal {
        Decimal(cents) / 100
    }

    var euroFormatted: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "EUR"
        formatter.locale = Locale(identifier: "it_IT")
        return formatter.string(from: NSDecimalNumber(decimal: decimal)) ?? "\(decimal) €"
    }

    static let zero = Money(cents: 0)

    static func < (lhs: Money, rhs: Money) -> Bool {
        lhs.cents < rhs.cents
    }

    static func + (lhs: Money, rhs: Money) -> Money {
        Money(cents: lhs.cents + rhs.cents)
    }

    static func - (lhs: Money, rhs: Money) -> Money {
        Money(cents: lhs.cents - rhs.cents)
    }
}

nonisolated struct LedgerMovementSplit: Identifiable, Codable, Equatable, Sendable {
    let id: String
    let amount: Money
    let categoryID: String
    let beneficiaryID: String?
    let shared: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case amount
        case categoryID = "categoryId"
        case beneficiaryID = "beneficiaryId"
        case shared
    }
}

nonisolated struct LedgerMovement: Identifiable, Codable, Equatable, Sendable {
    let id: String
    let type: MovementKind
    let authorID: String
    let memberID: String
    let amount: Money
    let date: String
    let description: String
    let categoryID: String
    let beneficiaryID: String?
    let senderID: String?
    let accountID: String
    let tagID: String?
    let comments: String?
    let shared: Bool
    let splits: [LedgerMovementSplit]?
    let installmentPlanID: String?
    let installmentProvider: String?
    let installmentNumber: Int?
    let installmentCount: Int?
    let sharedSettlementAmount: Money?
    let affectsAccountBalance: Bool?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case type
        case authorID = "authorId"
        case memberID = "memberId"
        case amount
        case date
        case description
        case categoryID = "categoryId"
        case beneficiaryID = "beneficiaryId"
        case senderID = "senderId"
        case accountID = "accountId"
        case tagID = "tagId"
        case comments
        case shared
        case splits
        case installmentPlanID = "installmentPlanId"
        case installmentProvider
        case installmentNumber
        case installmentCount
        case sharedSettlementAmount
        case affectsAccountBalance
        case createdAt
    }

    init(
        id: String,
        type: MovementKind,
        authorID: String,
        memberID: String,
        amount: Money,
        date: String,
        description: String,
        categoryID: String,
        beneficiaryID: String?,
        senderID: String?,
        accountID: String,
        tagID: String?,
        comments: String?,
        shared: Bool,
        splits: [LedgerMovementSplit]?,
        installmentPlanID: String? = nil,
        installmentProvider: String? = nil,
        installmentNumber: Int? = nil,
        installmentCount: Int? = nil,
        sharedSettlementAmount: Money?,
        affectsAccountBalance: Bool?,
        createdAt: String
    ) {
        self.id = id
        self.type = type
        self.authorID = authorID
        self.memberID = memberID
        self.amount = amount
        self.date = date
        self.description = description
        self.categoryID = categoryID
        self.beneficiaryID = beneficiaryID
        self.senderID = senderID
        self.accountID = accountID
        self.tagID = tagID
        self.comments = comments
        self.shared = shared
        self.splits = splits
        self.installmentPlanID = installmentPlanID
        self.installmentProvider = installmentProvider
        self.installmentNumber = installmentNumber
        self.installmentCount = installmentCount
        self.sharedSettlementAmount = sharedSettlementAmount
        self.affectsAccountBalance = affectsAccountBalance
        self.createdAt = createdAt
    }
}

nonisolated struct LedgerScheduledPayment: Identifiable, Codable, Equatable, Sendable {
    enum Status: String, Codable, Equatable, Sendable { case scheduled, paid }

    let id: String
    let planID: String
    let authorID: String
    let memberID: String
    let amount: Money
    let dueDate: String
    let description: String
    let categoryID: String
    let beneficiaryID: String?
    let accountID: String
    let tagID: String?
    let comments: String?
    let shared: Bool
    let splits: [LedgerMovementSplit]?
    let provider: String?
    let installmentNumber: Int
    let installmentCount: Int
    let status: Status
    let paidMovementID: String?
    let affectsAccountBalance: Bool?

    enum CodingKeys: String, CodingKey {
        case id
        case planID = "planId"
        case authorID = "authorId"
        case memberID = "memberId"
        case amount
        case dueDate
        case description
        case categoryID = "categoryId"
        case beneficiaryID = "beneficiaryId"
        case accountID = "accountId"
        case tagID = "tagId"
        case comments, shared, splits, provider, installmentNumber, installmentCount, status
        case paidMovementID = "paidMovementId"
        case affectsAccountBalance
    }
}

nonisolated struct LedgerTransfer: Identifiable, Codable, Equatable, Sendable {
    let id: String
    let authorID: String
    let fromAccountID: String
    let toAccountID: String
    let amount: Money
    let date: String
    let description: String

    enum CodingKeys: String, CodingKey {
        case id
        case authorID = "authorId"
        case fromAccountID = "fromAccountId"
        case toAccountID = "toAccountId"
        case amount
        case date
        case description
    }
}

nonisolated struct LedgerReimbursement: Identifiable, Codable, Equatable, Sendable {
    enum Status: String, Codable, Equatable, Sendable {
        case pending
        case confirmed
        case rejected
    }

    let id: String
    let groupID: String?
    let fromID: String
    let toID: String
    let amount: Money
    let date: String
    let authorID: String
    let fromAccountID: String?
    let toAccountID: String?
    let status: Status?

    init(
        id: String,
        groupID: String? = nil,
        fromID: String,
        toID: String,
        amount: Money,
        date: String,
        authorID: String,
        fromAccountID: String?,
        toAccountID: String?,
        status: Status?
    ) {
        self.id = id
        self.groupID = groupID
        self.fromID = fromID
        self.toID = toID
        self.amount = amount
        self.date = date
        self.authorID = authorID
        self.fromAccountID = fromAccountID
        self.toAccountID = toAccountID
        self.status = status
    }

    enum CodingKeys: String, CodingKey {
        case id
        case groupID = "groupId"
        case fromID = "fromId"
        case toID = "toId"
        case amount
        case date
        case authorID = "authorId"
        case fromAccountID = "fromAccountId"
        case toAccountID = "toAccountId"
        case status
    }
}

nonisolated struct ReimbursementDraft: Equatable, Sendable {
    let id: String
    let groupID: String?
    let amount: Decimal
    let counterpartID: UUID
    let fromID: UUID
    let toID: UUID
    let fromAccountID: String?
    let toAccountID: String?
    let date: Date
}

nonisolated struct ReimbursementPlanItem: Identifiable, Equatable, Sendable {
    let memberID: String
    let availableCredit: Money
    let suggestedAmount: Money

    var id: String { memberID }
}

nonisolated struct LedgerSnapshot: Equatable, Sendable {
    let currentUserID: String
    let memberCount: Int
    let accounts: [AccountSummary]
    let categories: [LedgerDirectoryItem]
    let beneficiaries: [LedgerDirectoryItem]
    let senders: [LedgerDirectoryItem]
    let tags: [LedgerDirectoryItem]
    let movements: [LedgerMovement]
    let scheduledPayments: [LedgerScheduledPayment]
    let transfers: [LedgerTransfer]
    let reimbursements: [LedgerReimbursement]

    init(
        currentUserID: String,
        memberCount: Int,
        accounts: [AccountSummary],
        categories: [LedgerDirectoryItem],
        beneficiaries: [LedgerDirectoryItem],
        senders: [LedgerDirectoryItem],
        tags: [LedgerDirectoryItem] = [],
        movements: [LedgerMovement],
        scheduledPayments: [LedgerScheduledPayment] = [],
        transfers: [LedgerTransfer],
        reimbursements: [LedgerReimbursement]
    ) {
        self.currentUserID = currentUserID
        self.memberCount = memberCount
        self.accounts = accounts
        self.categories = categories
        self.beneficiaries = beneficiaries
        self.senders = senders
        self.tags = tags
        self.movements = movements
        self.scheduledPayments = scheduledPayments
        self.transfers = transfers
        self.reimbursements = reimbursements
    }

    func account(named id: String) -> AccountSummary? {
        accounts.first { $0.id.caseInsensitiveCompare(id) == .orderedSame }
    }

    func directoryName(for movement: LedgerMovement) -> String {
        if movement.type == .expense {
            return beneficiaries.first { $0.id == movement.beneficiaryID }?.name
                ?? "Nessun beneficiario"
        }
        return senders.first { $0.id == movement.senderID }?.name ?? "Nessun mittente"
    }

    func categoryName(for movement: LedgerMovement) -> String {
        categories.first { $0.id == movement.categoryID }?.name ?? "Senza categoria"
    }
}

nonisolated struct LedgerAllocation: Equatable, Sendable {
    let categoryID: String
    let beneficiaryID: String?
    let amount: Money
    let shared: Bool
}

nonisolated struct LedgerCategoryTotal: Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let color: String?
    let amount: Money
}

nonisolated struct LedgerDailyTotal: Identifiable, Equatable, Sendable {
    let day: Int
    let amount: Money

    var id: Int { day }
}

nonisolated struct LedgerMemberTotal: Identifiable, Equatable, Sendable {
    let memberID: String
    let amount: Money

    var id: String { memberID }
}
