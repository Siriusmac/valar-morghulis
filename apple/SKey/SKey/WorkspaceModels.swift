import Foundation

nonisolated struct UserProfile: Codable, Equatable, Sendable {
    let id: UUID
    let firstName: String?
    let lastName: String?
    let fullName: String
    let email: String

    enum CodingKeys: String, CodingKey {
        case id
        case firstName = "first_name"
        case lastName = "last_name"
        case fullName = "full_name"
        case email
    }

    var displayName: String {
        let composedName = [firstName, lastName]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")

        return composedName.isEmpty ? fullName : composedName
    }
}

nonisolated struct FamilySummary: Identifiable, Equatable, Sendable {
    enum Role: String, Codable, Equatable, Sendable {
        case admin
        case member

        var label: String {
            switch self {
            case .admin: "Amministratore"
            case .member: "Membro"
            }
        }
    }

    let id: UUID
    let name: String
    let role: Role
    let memberCount: Int
}

nonisolated struct FamilyWorkspace: Equatable, Sendable {
    let profile: UserProfile
    let families: [FamilySummary]
    let members: [FamilyMemberSummary]
    let invitations: [FamilyInvitationSummary]
    let reimbursementAccounts: [ReimbursementAccountReference]
    let contacts: [ContactSummary]
    let contactInvitations: [ContactInvitationSummary]
    let commissionedPurchases: [CommissionedPurchaseSummary]
    let personalAccounts: [AccountSummary]
    let sharedAccounts: [AccountSummary]

    init(
        profile: UserProfile,
        families: [FamilySummary],
        members: [FamilyMemberSummary],
        invitations: [FamilyInvitationSummary],
        reimbursementAccounts: [ReimbursementAccountReference],
        contacts: [ContactSummary] = [],
        contactInvitations: [ContactInvitationSummary] = [],
        commissionedPurchases: [CommissionedPurchaseSummary] = [],
        personalAccounts: [AccountSummary],
        sharedAccounts: [AccountSummary]
    ) {
        self.profile = profile
        self.families = families
        self.members = members
        self.invitations = invitations
        self.reimbursementAccounts = reimbursementAccounts
        self.contacts = contacts
        self.contactInvitations = contactInvitations
        self.commissionedPurchases = commissionedPurchases
        self.personalAccounts = personalAccounts
        self.sharedAccounts = sharedAccounts
    }

    func accounts(for familyID: UUID?) -> [AccountSummary] {
        guard let familyID else { return personalAccounts }
        return sharedAccounts.filter { $0.familyID == familyID }
    }

    func members(for familyID: UUID?) -> [FamilyMemberSummary] {
        guard let familyID else {
            return [
                FamilyMemberSummary(
                    id: profile.id,
                    familyID: nil,
                    displayName: profile.displayName
                )
            ]
        }
        return members.filter { $0.familyID == familyID }
    }
}

nonisolated struct ContactSummary: Identifiable, Equatable, Sendable {
    enum Source: Equatable, Sendable { case family, friend }
    let id: UUID
    let displayName: String
    let email: String?
    let source: Source
    let familyNames: [String]
}

nonisolated struct ContactInvitationSummary: Identifiable, Equatable, Sendable {
    let id: UUID
    let email: String
    let expiresAt: Date
}

nonisolated struct CommissionedPurchaseSummary: Identifiable, Equatable, Sendable {
    enum Status: String, Codable, Equatable, Sendable { case pending, confirmed, rejected }
    let id: String
    let payerID: UUID
    let recipientID: UUID?
    let invitationID: UUID?
    let familyID: UUID?
    let reimbursementID: String?
    let payerMovementID: String
    let amount: Money
    let purchaseDate: String
    let description: String
    let status: Status
    let recipientMovementID: String?
}

nonisolated struct CommissionedPurchaseDraft: Equatable, Sendable {
    let id: String
    let recipientID: UUID?
    let invitationID: UUID?
    let familyID: UUID?
    let reimbursementID: String?
    let payerMovementID: String
    let amount: Decimal
    let purchaseDate: String
    let description: String
}

nonisolated struct CommissionedPurchaseResponse: Equatable, Sendable {
    let id: String
    let accepted: Bool
    let movementID: String?
    let categoryID: String?
    let accountID: String?
}

nonisolated struct ContactLinkRow: Codable, Sendable {
    let userIDA: UUID
    let userIDB: UUID
    enum CodingKeys: String, CodingKey { case userIDA = "user_id_a"; case userIDB = "user_id_b" }
}

nonisolated struct ContactInvitationRow: Codable, Sendable {
    let id: UUID
    let email: String
    let expiresAt: Date
    let acceptedAt: Date?
    let declinedAt: Date?
    enum CodingKeys: String, CodingKey {
        case id, email
        case expiresAt = "expires_at"
        case acceptedAt = "accepted_at"
        case declinedAt = "declined_at"
    }
}

nonisolated struct CommissionedPurchaseRow: Codable, Sendable {
    let id: String
    let payerID: UUID
    let recipientID: UUID?
    let invitationID: UUID?
    let familyID: UUID?
    let reimbursementID: String?
    let payerMovementID: String
    let amount: Decimal
    let purchaseDate: String
    let description: String
    let status: CommissionedPurchaseSummary.Status
    let recipientMovementID: String?
    enum CodingKeys: String, CodingKey {
        case id, amount, description, status
        case payerID = "payer_id"; case recipientID = "recipient_id"; case invitationID = "invitation_id"
        case familyID = "family_id"; case reimbursementID = "reimbursement_id"; case payerMovementID = "payer_movement_id"
        case purchaseDate = "purchase_date"; case recipientMovementID = "recipient_movement_id"
    }
}

nonisolated struct FamilyMemberSummary: Identifiable, Equatable, Sendable {
    let id: UUID
    let familyID: UUID?
    let displayName: String
    let email: String?

    init(id: UUID, familyID: UUID?, displayName: String, email: String? = nil) {
        self.id = id
        self.familyID = familyID
        self.displayName = displayName
        self.email = email
    }

    var initials: String {
        let words = displayName.split(separator: " ")
        return words.prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
    }
}

nonisolated struct FamilyInvitationSummary: Identifiable, Equatable, Sendable {
    enum Status: Equatable, Sendable {
        case pending, expired, declined

        var label: String {
            switch self {
            case .pending: "In attesa"
            case .expired: "Scaduto"
            case .declined: "Rifiutato"
            }
        }
    }

    let id: UUID
    let familyID: UUID
    let email: String
    let expiresAt: Date
    let status: Status
}

nonisolated struct ReimbursementAccountReference: Identifiable, Equatable, Sendable {
    let familyID: UUID
    let ownerID: UUID
    let accountID: String
    let name: String

    var id: String { "\(familyID.uuidString):\(ownerID.uuidString):\(accountID)" }
}

nonisolated struct AccountSummary: Identifiable, Equatable, Sendable {
    enum Kind: String, Codable, Equatable, Sendable {
        case bank
        case credit
        case cash
        case paypal

        var label: String {
            switch self {
            case .bank: "Conto bancario"
            case .credit: "Carta di credito"
            case .cash: "Contanti"
            case .paypal: "PayPal"
            }
        }

        var systemImage: String {
            switch self {
            case .bank: "building.columns.fill"
            case .credit: "creditcard.fill"
            case .cash: "banknote.fill"
            case .paypal: "p.circle.fill"
            }
        }
    }

    let id: String
    let familyID: UUID?
    let name: String
    let institution: String
    let kind: Kind
    let openingBalance: Decimal
    let openingBalanceDate: String?

    var scope: DirectoryScope { familyID == nil ? .personal : .family }
}

nonisolated struct AccountDraft: Identifiable, Equatable, Sendable {
    let id: String
    let isNew: Bool
    let familyID: UUID?
    let name: String
    let institution: String
    let kind: AccountSummary.Kind
    let openingBalance: Decimal
    let openingBalanceDate: Date
    let reimbursementFamilyIDs: Set<UUID>?
}

nonisolated struct FamilyMembershipRow: Codable, Sendable {
    let familyID: UUID
    let userID: UUID
    let role: FamilySummary.Role

    enum CodingKeys: String, CodingKey {
        case familyID = "family_id"
        case userID = "user_id"
        case role
    }
}

nonisolated struct FamilyRow: Codable, Sendable {
    let id: UUID
    let name: String
}

nonisolated struct FamilyInvitationRow: Codable, Sendable {
    let id: UUID
    let familyID: UUID
    let email: String
    let expiresAt: Date
    let acceptedAt: Date?
    let declinedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case familyID = "family_id"
        case email
        case expiresAt = "expires_at"
        case acceptedAt = "accepted_at"
        case declinedAt = "declined_at"
    }
}

nonisolated struct ReimbursementAccountRow: Codable, Sendable {
    let familyID: UUID
    let ownerID: UUID
    let accountID: String
    let displayName: String

    enum CodingKeys: String, CodingKey {
        case familyID = "family_id"
        case ownerID = "owner_id"
        case accountID = "account_id"
        case displayName = "display_name"
    }
}

nonisolated struct PersonalAppDataRow: Codable, Sendable {
    let data: PersonalAppData?
}

nonisolated struct PersonalAppData: Codable, Sendable {
    let accounts: [PersonalAccountRow]?
}

nonisolated struct PersonalAccountRow: Codable, Sendable {
    let id: String
    let name: String
    let institution: String
    let type: AccountSummary.Kind
    let scope: String
    let openingBalance: Decimal
    let openingBalanceDate: String?
}

nonisolated struct SharedAccountRow: Codable, Sendable {
    let id: UUID
    let familyID: UUID
    let name: String
    let institution: String
    let accountType: AccountSummary.Kind
    let openingBalance: Decimal
    let openingBalanceDate: String?

    enum CodingKeys: String, CodingKey {
        case id
        case familyID = "family_id"
        case name
        case institution
        case accountType = "account_type"
        case openingBalance = "opening_balance"
        case openingBalanceDate = "opening_balance_date"
    }
}

nonisolated enum MovementKind: String, Codable, CaseIterable, Equatable, Sendable {
    case expense
    case income

    var label: String {
        switch self {
        case .expense: "Spesa"
        case .income: "Entrata"
        }
    }
}

nonisolated enum DirectoryScope: String, Codable, Equatable, Sendable {
    case personal
    case family
}

nonisolated enum LedgerDirectoryKind: String, Codable, CaseIterable, Equatable, Hashable, Sendable {
    case category
    case beneficiary
    case sender
    case tag

    var arrayKey: String {
        switch self {
        case .category: "categories"
        case .beneficiary: "beneficiaries"
        case .sender: "senders"
        case .tag: "tags"
        }
    }
}

nonisolated struct LedgerDirectoryItem: Identifiable, Codable, Equatable, Sendable {
    let id: String
    let name: String
    let scope: DirectoryScope
    let ownerID: String?
    let movementType: MovementKind?
    let color: String?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case scope
        case ownerID = "ownerId"
        case movementType
        case color
    }

    func familyCopy() -> Self {
        Self(
            id: id,
            name: name,
            scope: .family,
            ownerID: nil,
            movementType: movementType,
            color: color
        )
    }
}

nonisolated struct MovementOptions: Equatable, Sendable {
    let accounts: [AccountSummary]
    let categories: [LedgerDirectoryItem]
    let beneficiaries: [LedgerDirectoryItem]
    let senders: [LedgerDirectoryItem]
    let tags: [LedgerDirectoryItem]

    init(
        accounts: [AccountSummary],
        categories: [LedgerDirectoryItem],
        beneficiaries: [LedgerDirectoryItem],
        senders: [LedgerDirectoryItem],
        tags: [LedgerDirectoryItem] = []
    ) {
        self.accounts = accounts
        self.categories = categories
        self.beneficiaries = beneficiaries
        self.senders = senders
        self.tags = tags
    }
}

nonisolated struct MovementSplitDraft: Identifiable, Equatable, Sendable {
    let id: String
    let amount: Decimal
    let category: LedgerDirectoryItem
    let beneficiary: LedgerDirectoryItem?
    let isShared: Bool
}

nonisolated struct MovementDraft: Identifiable, Equatable, Sendable {
    let id: String
    let type: MovementKind
    let amount: Decimal
    let date: Date
    let description: String
    let comments: String?
    let account: AccountSummary
    let category: LedgerDirectoryItem
    let counterparty: LedgerDirectoryItem
    let tag: LedgerDirectoryItem?
    let isShared: Bool
    let splits: [MovementSplitDraft]?
    let affectsAccountBalance: Bool?
    let installment: InstallmentPurchaseDraft?
    let commissionedPurchaseID: String?
    let paidByUserID: UUID?
    let excludeFromReports: Bool

    init(
        id: String = UUID().uuidString.lowercased(),
        type: MovementKind,
        amount: Decimal,
        date: Date,
        description: String,
        comments: String?,
        account: AccountSummary,
        category: LedgerDirectoryItem,
        counterparty: LedgerDirectoryItem,
        tag: LedgerDirectoryItem? = nil,
        isShared: Bool,
        splits: [MovementSplitDraft]? = nil,
        affectsAccountBalance: Bool?,
        installment: InstallmentPurchaseDraft? = nil,
        commissionedPurchaseID: String? = nil,
        paidByUserID: UUID? = nil,
        excludeFromReports: Bool = false
    ) {
        self.id = id
        self.type = type
        self.amount = amount
        self.date = date
        self.description = description
        self.comments = comments
        self.account = account
        self.category = category
        self.counterparty = counterparty
        self.tag = tag
        self.isShared = isShared
        self.splits = splits
        self.affectsAccountBalance = affectsAccountBalance
        self.installment = installment
        self.commissionedPurchaseID = commissionedPurchaseID
        self.paidByUserID = paidByUserID
        self.excludeFromReports = excludeFromReports
    }
}

nonisolated struct TransferDraft: Identifiable, Equatable, Sendable {
    let id: String
    let fromAccount: AccountSummary
    let toAccount: AccountSummary
    let amount: Decimal
    let date: Date
    let description: String

    init(
        id: String = "transfer-\(UUID().uuidString.lowercased())",
        fromAccount: AccountSummary,
        toAccount: AccountSummary,
        amount: Decimal,
        date: Date,
        description: String
    ) {
        self.id = id
        self.fromAccount = fromAccount
        self.toAccount = toAccount
        self.amount = amount
        self.date = date
        self.description = description
    }
}

nonisolated struct InstallmentPurchaseDraft: Equatable, Sendable {
    let planID: String
    let provider: String
    let count: Int
    let scheduledPaymentIDs: [String]

    init(
        planID: String = "installment-plan-\(UUID().uuidString.lowercased())",
        provider: String,
        count: Int,
        scheduledPaymentIDs: [String]
    ) {
        self.planID = planID
        self.provider = provider
        self.count = count
        self.scheduledPaymentIDs = scheduledPaymentIDs
    }
}
