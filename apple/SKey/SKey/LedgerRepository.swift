import Foundation
import Supabase

protocol LedgerRepository: Sendable {
    func loadMovementOptions(userID: UUID, familyID: UUID?) async throws -> MovementOptions
    func createMovement(
        _ draft: MovementDraft,
        userID: UUID,
        userDisplayName: String,
        familyID: UUID?
    ) async throws
}

struct SupabaseLedgerRepository: LedgerRepository {
    let client: SupabaseClient

    func loadMovementOptions(userID: UUID, familyID: UUID?) async throws -> MovementOptions {
        async let personalRowRequest: RawAppDataRow? = client
            .from("user_app_data")
            .select("data")
            .eq("user_id", value: userID)
            .maybeSingle()
            .execute()
            .value

        let sharedAccounts: [SharedAccountRow]
        let sharedDirectories: [SharedRecordRow]

        if let familyID {
            async let accountsRequest: [SharedAccountRow] = client
                .from("accounts")
                .select("id, family_id, name, institution, account_type, opening_balance, opening_balance_date")
                .eq("family_id", value: familyID)
                .eq("scope", value: "family")
                .execute()
                .value

            async let directoriesRequest: [SharedRecordRow] = client
                .from("family_shared_records")
                .select("record_type, record_id, data, created_by")
                .eq("family_id", value: familyID)
                .in("record_type", values: ["category", "beneficiary", "sender"])
                .execute()
                .value

            (sharedAccounts, sharedDirectories) = try await (accountsRequest, directoriesRequest)
        } else {
            sharedAccounts = []
            sharedDirectories = []
        }

        let personalRoot = try await personalRowRequest?.data?.objectValue ?? [:]
        let personalAccounts = decodeArray(PersonalAccountRow.self, key: "accounts", from: personalRoot)
            .filter { $0.scope == "personal" }
            .map {
                AccountSummary(
                    id: $0.id,
                    familyID: nil,
                    name: $0.name,
                    institution: $0.institution,
                    kind: $0.type,
                    openingBalance: $0.openingBalance,
                    openingBalanceDate: $0.openingBalanceDate
                )
            }

        let familyAccounts = sharedAccounts.map {
            AccountSummary(
                id: $0.id.uuidString,
                familyID: $0.familyID,
                name: $0.name,
                institution: $0.institution,
                kind: $0.accountType,
                openingBalance: $0.openingBalance,
                openingBalanceDate: $0.openingBalanceDate
            )
        }

        let sharedItems = sharedDirectories.compactMap { row -> (String, LedgerDirectoryItem)? in
            guard let item = try? row.data.decode(LedgerDirectoryItem.self) else { return nil }
            return (row.recordType, item)
        }

        return MovementOptions(
            accounts: (personalAccounts + familyAccounts).sorted(by: sortByName),
            categories: mergedDirectories(
                personal: decodeArray(LedgerDirectoryItem.self, key: "categories", from: personalRoot),
                shared: sharedItems.filter { $0.0 == "category" }.map(\.1)
            ),
            beneficiaries: mergedDirectories(
                personal: decodeArray(LedgerDirectoryItem.self, key: "beneficiaries", from: personalRoot),
                shared: sharedItems.filter { $0.0 == "beneficiary" }.map(\.1)
            ),
            senders: mergedDirectories(
                personal: decodeArray(LedgerDirectoryItem.self, key: "senders", from: personalRoot),
                shared: sharedItems.filter { $0.0 == "sender" }.map(\.1)
            )
        )
    }

    func createMovement(
        _ draft: MovementDraft,
        userID: UUID,
        userDisplayName: String,
        familyID: UUID?
    ) async throws {
        let effectivelyShared = draft.isShared || draft.account.familyID != nil

        if effectivelyShared {
            guard let familyID else { throw LedgerRepositoryError.familyRequired }
            try await createSharedMovement(
                draft,
                userID: userID,
                userDisplayName: userDisplayName,
                familyID: familyID
            )
        } else {
            try await createPersonalMovement(
                draft,
                userID: userID,
                userDisplayName: userDisplayName
            )
        }
    }

    private func createPersonalMovement(
        _ draft: MovementDraft,
        userID: UUID,
        userDisplayName: String
    ) async throws {
        let existingRow: RawAppDataRow? = try await client
            .from("user_app_data")
            .select("data")
            .eq("user_id", value: userID)
            .maybeSingle()
            .execute()
            .value

        var root = appDataRoot(from: existingRow?.data)
        let category = personalCopy(draft.category, userID: userID, movementType: draft.type)
        upsert(category, in: "categories", root: &root)

        let beneficiary: LedgerDirectoryItem?
        let sender: LedgerDirectoryItem?

        if draft.type == .expense {
            beneficiary = personalCopy(draft.counterparty, userID: userID)
            sender = nil
            upsert(beneficiary!, in: "beneficiaries", root: &root)
        } else {
            beneficiary = userBeneficiary(userID: userID, name: userDisplayName, scope: .personal)
            sender = personalCopy(draft.counterparty, userID: userID)
            upsert(beneficiary!, in: "beneficiaries", root: &root)
            upsert(sender!, in: "senders", root: &root)
        }

        let movement = movementJSON(
            draft,
            userID: userID,
            category: category,
            beneficiary: beneficiary,
            sender: sender,
            shared: false
        )
        upsertJSON(movement, id: draft.id, in: "movements", root: &root)

        try await client
            .from("user_app_data")
            .upsert(UserAppDataUpsert(userID: userID, data: .object(root)), onConflict: "user_id")
            .execute()
    }

    private func createSharedMovement(
        _ draft: MovementDraft,
        userID: UUID,
        userDisplayName: String,
        familyID: UUID
    ) async throws {
        async let privateRowRequest: RawAppDataRow? = client
            .from("family_user_app_data")
            .select("data")
            .eq("family_id", value: familyID)
            .eq("user_id", value: userID)
            .maybeSingle()
            .execute()
            .value

        async let existingKeysRequest: [OwnedSharedRecordRow] = client
            .from("family_shared_records")
            .select("record_type, record_id")
            .eq("family_id", value: familyID)
            .eq("created_by", value: userID)
            .in("record_type", values: Self.transactionRecordTypes)
            .execute()
            .value

        let (privateRow, existingKeys) = try await (privateRowRequest, existingKeysRequest)
        var familyRoot = appDataRoot(from: privateRow?.data)
        let category = draft.category.familyCopyWith(movementType: draft.type)

        let beneficiary: LedgerDirectoryItem?
        let sender: LedgerDirectoryItem?

        if draft.type == .expense {
            beneficiary = draft.counterparty.familyCopy()
            sender = nil
        } else {
            beneficiary = userBeneficiary(userID: userID, name: userDisplayName, scope: .family)
            sender = draft.counterparty.familyCopy()
        }

        let movement = movementJSON(
            draft,
            userID: userID,
            category: category,
            beneficiary: beneficiary,
            sender: sender,
            shared: true
        )
        upsertJSON(movement, id: draft.id, in: "movements", root: &familyRoot)

        // The RPC treats owned_keys as the complete set. Include both server
        // state and the local family snapshot so an incremental native save can
        // never remove unrelated records created by the same member.
        var ownedKeys = Set(existingKeys.map { SharedRecordKey(type: $0.recordType, id: $0.recordID) })
        ownedKeys.formUnion(transactionKeys(in: familyRoot))
        ownedKeys.insert(SharedRecordKey(type: "movement", id: draft.id))

        var records = [
            SharedRecordPayload(type: "movement", id: draft.id, data: movement),
            SharedRecordPayload(type: "category", id: category.id, data: try JSONValue.encode(category))
        ]
        if let beneficiary {
            records.append(
                SharedRecordPayload(
                    type: "beneficiary",
                    id: beneficiary.id,
                    data: try JSONValue.encode(beneficiary)
                )
            )
        }
        if let sender {
            records.append(
                SharedRecordPayload(type: "sender", id: sender.id, data: try JSONValue.encode(sender))
            )
        }

        try await client
            .from("family_user_app_data")
            .upsert(
                FamilyAppDataUpsert(familyID: familyID, userID: userID, data: .object(familyRoot)),
                onConflict: "family_id,user_id"
            )
            .execute()

        try await client
            .rpc(
                "sync_family_shared_records",
                params: SyncSharedRecordsParameters(
                    familyID: familyID,
                    records: records,
                    ownedKeys: ownedKeys.sorted {
                        $0.type == $1.type ? $0.id < $1.id : $0.type < $1.type
                    }
                )
            )
            .execute()
    }

    private func movementJSON(
        _ draft: MovementDraft,
        userID: UUID,
        category: LedgerDirectoryItem,
        beneficiary: LedgerDirectoryItem?,
        sender: LedgerDirectoryItem?,
        shared: Bool
    ) -> JSONValue {
        var object: [String: JSONValue] = [
            "id": .string(draft.id),
            "type": .string(draft.type.rawValue),
            "authorId": .string(userID.uuidString.lowercased()),
            "memberId": .string(userID.uuidString.lowercased()),
            "amount": .number(draft.amount),
            "date": .string(Self.dayFormatter.string(from: draft.date)),
            "description": .string(draft.description),
            "categoryId": .string(category.id),
            "accountId": .string(draft.account.id),
            "shared": .bool(shared),
            "createdAt": .string(Self.timestampFormatter.string(from: Date()))
        ]

        if let beneficiary { object["beneficiaryId"] = .string(beneficiary.id) }
        if let sender { object["senderId"] = .string(sender.id) }
        if let comments = draft.comments { object["comments"] = .string(comments) }
        if let affectsAccountBalance = draft.affectsAccountBalance {
            object["affectsAccountBalance"] = .bool(affectsAccountBalance)
        }
        return .object(object)
    }

    private func appDataRoot(from value: JSONValue?) -> [String: JSONValue] {
        var root = value?.objectValue ?? [:]
        root["version"] = .number(3)
        for key in Self.appDataArrayKeys where root[key]?.arrayValue == nil {
            root[key] = .array([])
        }
        return root
    }

    private func upsert(
        _ item: LedgerDirectoryItem,
        in key: String,
        root: inout [String: JSONValue]
    ) {
        guard let value = try? JSONValue.encode(item) else { return }
        upsertJSON(value, id: item.id, in: key, root: &root)
    }

    private func upsertJSON(
        _ value: JSONValue,
        id: String,
        in key: String,
        root: inout [String: JSONValue]
    ) {
        var values = root[key]?.arrayValue ?? []
        if let index = values.firstIndex(where: { $0.objectValue?["id"]?.stringValue == id }) {
            values[index] = value
        } else {
            values.append(value)
        }
        root[key] = .array(values)
    }

    private func transactionKeys(in root: [String: JSONValue]) -> Set<SharedRecordKey> {
        let mappings = [
            ("movements", "movement"),
            ("scheduledPayments", "scheduled_payment"),
            ("reimbursements", "reimbursement"),
            ("transfers", "transfer")
        ]

        return Set(mappings.flatMap { arrayKey, recordType in
            (root[arrayKey]?.arrayValue ?? []).compactMap { value in
                value.objectValue?["id"]?.stringValue.map {
                    SharedRecordKey(type: recordType, id: $0)
                }
            }
        })
    }

    private func personalCopy(
        _ item: LedgerDirectoryItem,
        userID: UUID,
        movementType: MovementKind? = nil
    ) -> LedgerDirectoryItem {
        LedgerDirectoryItem(
            id: item.id,
            name: item.name,
            scope: .personal,
            ownerID: userID.uuidString.lowercased(),
            movementType: movementType ?? item.movementType,
            color: item.color
        )
    }

    private func userBeneficiary(
        userID: UUID,
        name: String,
        scope: DirectoryScope
    ) -> LedgerDirectoryItem {
        LedgerDirectoryItem(
            id: "beneficiary-user-\(userID.uuidString.lowercased())",
            name: name,
            scope: scope,
            ownerID: scope == .personal ? userID.uuidString.lowercased() : nil,
            movementType: nil,
            color: nil
        )
    }

    private func decodeArray<T: Decodable>(
        _ type: T.Type,
        key: String,
        from root: [String: JSONValue]
    ) -> [T] {
        (try? root[key]?.decode([T].self)) ?? []
    }

    private func mergedDirectories(
        personal: [LedgerDirectoryItem],
        shared: [LedgerDirectoryItem]
    ) -> [LedgerDirectoryItem] {
        var seen = Set<String>()
        return (personal + shared)
            .filter { seen.insert($0.id).inserted }
            .sorted(by: sortByName)
    }

    private func sortByName<T>(_ lhs: T, _ rhs: T) -> Bool where T: NamedValue {
        lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
    }

    private static let transactionRecordTypes = [
        "movement", "scheduled_payment", "reimbursement", "transfer"
    ]
    private static let appDataArrayKeys = [
        "accounts", "categories", "beneficiaries", "senders", "tags", "tagReportIds",
        "movements", "scheduledPayments", "transfers", "reimbursements"
    ]

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        // DatePicker represents the user's local calendar day. Formatting it
        // in UTC could move midnight to the previous day in Italian time.
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static let timestampFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}

private protocol NamedValue {
    var name: String { get }
}

extension AccountSummary: NamedValue {}
extension LedgerDirectoryItem: NamedValue {}

private extension LedgerDirectoryItem {
    func familyCopyWith(movementType: MovementKind) -> Self {
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

private struct RawAppDataRow: Decodable, Sendable {
    let data: JSONValue?
}

private struct SharedRecordRow: Decodable, Sendable {
    let recordType: String
    let recordID: String
    let data: JSONValue
    let createdBy: UUID?

    enum CodingKeys: String, CodingKey {
        case recordType = "record_type"
        case recordID = "record_id"
        case data
        case createdBy = "created_by"
    }
}

private struct OwnedSharedRecordRow: Decodable, Sendable {
    let recordType: String
    let recordID: String

    enum CodingKeys: String, CodingKey {
        case recordType = "record_type"
        case recordID = "record_id"
    }
}

private struct UserAppDataUpsert: Encodable, Sendable {
    let userID: UUID
    let data: JSONValue

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case data
    }
}

private struct FamilyAppDataUpsert: Encodable, Sendable {
    let familyID: UUID
    let userID: UUID
    let data: JSONValue

    enum CodingKeys: String, CodingKey {
        case familyID = "family_id"
        case userID = "user_id"
        case data
    }
}

private struct SharedRecordPayload: Encodable, Sendable {
    let type: String
    let id: String
    let data: JSONValue
}

private struct SharedRecordKey: Codable, Hashable, Sendable {
    let type: String
    let id: String
}

private struct SyncSharedRecordsParameters: Encodable, Sendable {
    let familyID: UUID
    let records: [SharedRecordPayload]
    let ownedKeys: [SharedRecordKey]

    enum CodingKeys: String, CodingKey {
        case familyID = "target_family_id"
        case records
        case ownedKeys = "owned_keys"
    }
}

enum LedgerRepositoryError: LocalizedError {
    case familyRequired

    var errorDescription: String? {
        "Seleziona una famiglia prima di registrare un movimento condiviso."
    }
}
