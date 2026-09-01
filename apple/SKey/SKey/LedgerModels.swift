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
    let tagID: String?
    let shared: Bool
    let commissionedPurchaseID: String?
    let excludeFromReports: Bool?

    init(
        id: String, amount: Money, categoryID: String, beneficiaryID: String?,
        tagID: String? = nil, shared: Bool, commissionedPurchaseID: String? = nil,
        excludeFromReports: Bool? = nil
    ) {
        self.id = id
        self.amount = amount
        self.categoryID = categoryID
        self.beneficiaryID = beneficiaryID
        self.tagID = tagID
        self.shared = shared
        self.commissionedPurchaseID = commissionedPurchaseID
        self.excludeFromReports = excludeFromReports
    }

    enum CodingKeys: String, CodingKey {
        case id
        case amount
        case categoryID = "categoryId"
        case beneficiaryID = "beneficiaryId"
        case tagID = "tagId"
        case shared
        case commissionedPurchaseID = "commissionedPurchaseId"
        case excludeFromReports
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
    let commissionedPurchaseID: String?
    let paidByUserID: String?
    let excludeFromReports: Bool?
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
        case commissionedPurchaseID = "commissionedPurchaseId"
        case paidByUserID = "paidByUserId"
        case excludeFromReports
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
        commissionedPurchaseID: String? = nil,
        paidByUserID: String? = nil,
        excludeFromReports: Bool? = nil,
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
        self.commissionedPurchaseID = commissionedPurchaseID
        self.paidByUserID = paidByUserID
        self.excludeFromReports = excludeFromReports
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
    enum SettlementMethod: String, Codable, Equatable, Sendable { case money, purchase }
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
    let settlementMethod: SettlementMethod?
    let commissionedPurchaseID: String?

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
        status: Status?,
        settlementMethod: SettlementMethod? = nil,
        commissionedPurchaseID: String? = nil
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
        self.settlementMethod = settlementMethod
        self.commissionedPurchaseID = commissionedPurchaseID
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
        case settlementMethod
        case commissionedPurchaseID = "commissionedPurchaseId"
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
    let settlementMethod: LedgerReimbursement.SettlementMethod
    let purchaseDescription: String?
    let commissionedPurchaseID: String?
    let payerMovementID: String?

    init(
        id: String, groupID: String?, amount: Decimal, counterpartID: UUID,
        fromID: UUID, toID: UUID, fromAccountID: String?, toAccountID: String?, date: Date,
        settlementMethod: LedgerReimbursement.SettlementMethod = .money,
        purchaseDescription: String? = nil,
        commissionedPurchaseID: String? = nil,
        payerMovementID: String? = nil
    ) {
        self.id = id; self.groupID = groupID; self.amount = amount; self.counterpartID = counterpartID
        self.fromID = fromID; self.toID = toID; self.fromAccountID = fromAccountID; self.toAccountID = toAccountID; self.date = date
        self.settlementMethod = settlementMethod; self.purchaseDescription = purchaseDescription
        self.commissionedPurchaseID = commissionedPurchaseID; self.payerMovementID = payerMovementID
    }
}

nonisolated struct LedgerLoan: Identifiable, Codable, Equatable, Sendable {
    enum Status: String, Codable, Sendable { case pending, confirmed, rejected }
    let id: String
    let lenderID: String
    let borrowerID: String
    let amount: Money
    let date: String
    let description: String
    let authorID: String
    let lenderAccountID: String
    let borrowerAccountID: String?
    let status: Status

    enum CodingKeys: String, CodingKey {
        case id, amount, date, description, status
        case lenderID = "lenderId"
        case borrowerID = "borrowerId"
        case authorID = "authorId"
        case lenderAccountID = "lenderAccountId"
        case borrowerAccountID = "borrowerAccountId"
    }
}

nonisolated struct LedgerLoanRepayment: Identifiable, Codable, Equatable, Sendable {
    enum Method: String, Codable, Sendable { case money, purchase, familyCredit = "family_credit" }
    let id: String
    let loanID: String
    let lenderID: String
    let borrowerID: String
    let amount: Money
    let date: String
    let description: String
    let authorID: String
    let method: Method
    let fromAccountID: String?
    let toAccountID: String?
    let categoryID: String?
    let payerMovementID: String?
    let recipientMovementID: String?
    let status: LedgerLoan.Status

    enum CodingKeys: String, CodingKey {
        case id, amount, date, description, method, status
        case loanID = "loanId"
        case lenderID = "lenderId"
        case borrowerID = "borrowerId"
        case authorID = "authorId"
        case fromAccountID = "fromAccountId"
        case toAccountID = "toAccountId"
        case categoryID = "categoryId"
        case payerMovementID = "payerMovementId"
        case recipientMovementID = "recipientMovementId"
    }
}

nonisolated struct LoanDraft: Equatable, Sendable {
    let id: String
    let borrowerID: UUID
    let amount: Decimal
    let date: Date
    let description: String
    let lenderAccountID: String
}

nonisolated struct LoanRepaymentDraft: Equatable, Sendable {
    let id: String
    let loanID: String
    let amount: Decimal
    let date: Date
    let description: String
    let method: LedgerLoanRepayment.Method
    let fromAccountID: String?
    let payerMovementID: String?
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
    let loans: [LedgerLoan]
    let loanRepayments: [LedgerLoanRepayment]

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
        reimbursements: [LedgerReimbursement],
        loans: [LedgerLoan] = [],
        loanRepayments: [LedgerLoanRepayment] = []
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
        self.loans = loans
        self.loanRepayments = loanRepayments
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
    let tagID: String?
    let amount: Money
    let shared: Bool
    let excludeFromReports: Bool
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
