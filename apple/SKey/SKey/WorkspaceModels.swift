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
    let personalAccounts: [AccountSummary]
    let sharedAccounts: [AccountSummary]

    func accounts(for familyID: UUID?) -> [AccountSummary] {
        guard let familyID else { return personalAccounts }
        return sharedAccounts.filter { $0.familyID == familyID }
    }
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
    let isShared: Bool
    let affectsAccountBalance: Bool?

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
        isShared: Bool,
        affectsAccountBalance: Bool?
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
        self.isShared = isShared
        self.affectsAccountBalance = affectsAccountBalance
    }
}
