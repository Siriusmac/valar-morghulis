import Auth
import Foundation
import Functions
import Supabase

nonisolated struct CreateFamilyDraft: Equatable, Sendable {
    let name: String
    let createsSharedAccount: Bool
    let accountName: String
    let institution: String
    let openingBalance: Decimal
}

protocol AccountRepository: Sendable {
    func updateProfile(userID: UUID, firstName: String, lastName: String) async throws
    func updateEmail(_ email: String) async throws
    func updatePassword(_ password: String) async throws
    func createFamily(_ draft: CreateFamilyDraft) async throws -> UUID
    func renameFamily(_ familyID: UUID, name: String) async throws
    func inviteMember(familyID: UUID, email: String) async throws
    func deleteInvitation(_ invitationID: UUID) async throws
    func deleteFamily(_ familyID: UUID, preservingAuthoredData: Bool) async throws
    func exportAccountData(userID: UUID, profile: UserProfile, families: [FamilySummary]) async throws -> Data
    func deleteAccount() async throws
}

struct SupabaseAccountRepository: AccountRepository {
    let client: SupabaseClient

    func updateProfile(userID: UUID, firstName: String, lastName: String) async throws {
        let firstName = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        let lastName = lastName.trimmingCharacters(in: .whitespacesAndNewlines)
        let fullName = "\(firstName) \(lastName)".trimmingCharacters(in: .whitespacesAndNewlines)
        guard !firstName.isEmpty, !lastName.isEmpty else { throw AccountRepositoryError.nameRequired }
        guard fullName.count <= 80 else { throw AccountRepositoryError.nameTooLong }

        try await client
            .from("profiles")
            .update(ProfileNameUpdate(firstName: firstName, lastName: lastName, fullName: fullName))
            .eq("id", value: userID)
            .execute()
    }

    func updateEmail(_ email: String) async throws {
        try await client.auth.update(
            user: UserAttributes(email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
        )
    }

    func updatePassword(_ password: String) async throws {
        guard password.count >= 8 else { throw AccountRepositoryError.passwordTooShort }
        try await client.auth.update(user: UserAttributes(password: password))
    }

    func createFamily(_ draft: CreateFamilyDraft) async throws -> UUID {
        let name = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard name.count >= 2 else { throw AccountRepositoryError.familyNameTooShort }
        let parameters = CreateFamilyParameters(
            familyName: name,
            sharedAccountName: draft.createsSharedAccount ? draft.accountName.trimmingCharacters(in: .whitespacesAndNewlines) : nil,
            sharedAccountInstitution: draft.createsSharedAccount ? draft.institution.trimmingCharacters(in: .whitespacesAndNewlines) : nil,
            sharedAccountType: "bank",
            sharedAccountOpeningBalance: draft.createsSharedAccount ? draft.openingBalance : 0
        )
        let response: UUID = try await client
            .rpc("create_family_with_optional_account", params: parameters)
            .execute()
            .value
        return response
    }

    func renameFamily(_ familyID: UUID, name: String) async throws {
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard name.count >= 2 else { throw AccountRepositoryError.familyNameTooShort }
        try await client.from("families")
            .update(FamilyNameUpdate(name: name))
            .eq("id", value: familyID)
            .execute()
    }

    func inviteMember(familyID: UUID, email: String) async throws {
        let request = InvitationRequest(
            familyID: familyID,
            email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        )
        try await client.functions.invoke(
            "invite-family-member",
            options: FunctionInvokeOptions(body: request)
        )
    }

    func deleteInvitation(_ invitationID: UUID) async throws {
        try await client.rpc(
            "delete_declined_family_invitation",
            params: DeleteInvitationParameters(invitationID: invitationID)
        ).execute()
    }

    func deleteFamily(_ familyID: UUID, preservingAuthoredData: Bool) async throws {
        try await client.rpc(
            "delete_family",
            params: DeleteFamilyParameters(
                familyID: familyID,
                preservingAuthoredData: preservingAuthoredData
            )
        ).execute()
    }

    func exportAccountData(userID: UUID, profile: UserProfile, families: [FamilySummary]) async throws -> Data {
        async let personalRequest: ExportDataRow? = client.from("user_app_data")
            .select("data").eq("user_id", value: userID).maybeSingle().execute().value
        let familyIDs = families.map(\.id)
        let privateRows: [ExportFamilyDataRow]
        let sharedRows: [ExportSharedRecordRow]
        let accountRows: [SharedAccountRow]
        if familyIDs.isEmpty {
            privateRows = []
            sharedRows = []
            accountRows = []
        } else {
            async let privateRequest: [ExportFamilyDataRow] = client.from("family_user_app_data")
                .select("family_id, data").eq("user_id", value: userID).in("family_id", values: familyIDs).execute().value
            async let sharedRequest: [ExportSharedRecordRow] = client.from("family_shared_records")
                .select("family_id, record_type, record_id, data").in("family_id", values: familyIDs).execute().value
            async let accountsRequest: [SharedAccountRow] = client.from("accounts")
                .select("id, family_id, name, institution, account_type, opening_balance, opening_balance_date")
                .in("family_id", values: familyIDs).eq("scope", value: "family").execute().value
            (privateRows, sharedRows, accountRows) = try await (privateRequest, sharedRequest, accountsRequest)
        }
        let payload = AccountExportPayload(
            exportedAt: Date(),
            profile: profile,
            personalData: try await personalRequest?.data,
            families: families.map { family in
                ExportFamily(
                    id: family.id,
                    name: family.name,
                    role: family.role,
                    privateData: privateRows.first { $0.familyID == family.id }?.data,
                    accounts: accountRows.filter { $0.familyID == family.id },
                    sharedRecords: sharedRows.filter { $0.familyID == family.id }
                )
            }
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(payload)
    }

    func deleteAccount() async throws {
        try await client.rpc("delete_my_account").execute()
        try await client.auth.signOut()
    }
}

private struct ProfileNameUpdate: Encodable, Sendable {
    let firstName: String
    let lastName: String
    let fullName: String

    enum CodingKeys: String, CodingKey {
        case firstName = "first_name"
        case lastName = "last_name"
        case fullName = "full_name"
    }
}

private struct FamilyNameUpdate: Encodable, Sendable { let name: String }

private struct CreateFamilyParameters: Encodable, Sendable {
    let familyName: String
    let sharedAccountName: String?
    let sharedAccountInstitution: String?
    let sharedAccountType: String
    let sharedAccountOpeningBalance: Decimal

    enum CodingKeys: String, CodingKey {
        case familyName = "family_name"
        case sharedAccountName = "shared_account_name"
        case sharedAccountInstitution = "shared_account_institution"
        case sharedAccountType = "shared_account_type"
        case sharedAccountOpeningBalance = "shared_account_opening_balance"
    }
}

private struct InvitationRequest: Encodable, Sendable {
    let familyID: UUID
    let email: String
    enum CodingKeys: String, CodingKey { case familyID = "familyId"; case email }
}

private struct DeleteInvitationParameters: Encodable, Sendable {
    let invitationID: UUID
    enum CodingKeys: String, CodingKey { case invitationID = "target_invitation_id" }
}

private struct DeleteFamilyParameters: Encodable, Sendable {
    let familyID: UUID
    let preservingAuthoredData: Bool
    enum CodingKeys: String, CodingKey {
        case familyID = "target_family_id"
        case preservingAuthoredData = "preserve_authored_data"
    }
}

private struct ExportDataRow: Decodable, Sendable { let data: JSONValue? }

private struct ExportFamilyDataRow: Decodable, Sendable {
    let familyID: UUID
    let data: JSONValue?
    enum CodingKeys: String, CodingKey { case familyID = "family_id"; case data }
}

private struct ExportSharedRecordRow: Codable, Sendable {
    let familyID: UUID
    let recordType: String
    let recordID: String
    let data: JSONValue
    enum CodingKeys: String, CodingKey {
        case familyID = "family_id"
        case recordType = "record_type"
        case recordID = "record_id"
        case data
    }
}

private struct AccountExportPayload: Encodable, Sendable {
    let exportedAt: Date
    let profile: UserProfile
    let personalData: JSONValue?
    let families: [ExportFamily]
}

private struct ExportFamily: Encodable, Sendable {
    let id: UUID
    let name: String
    let role: FamilySummary.Role
    let privateData: JSONValue?
    let accounts: [SharedAccountRow]
    let sharedRecords: [ExportSharedRecordRow]
}

enum AccountRepositoryError: LocalizedError {
    case nameRequired, nameTooLong, passwordTooShort, familyNameTooShort

    var errorDescription: String? {
        switch self {
        case .nameRequired: "Inserisci nome e cognome."
        case .nameTooLong: "Nome e cognome non possono superare 80 caratteri."
        case .passwordTooShort: "La password deve contenere almeno 8 caratteri."
        case .familyNameTooShort: "Il nome della famiglia deve contenere almeno 2 caratteri."
        }
    }
}
