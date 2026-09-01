import Foundation
import Supabase

protocol LedgerRepository: Sendable {
    func loadMovementOptions(userID: UUID, familyID: UUID?) async throws -> MovementOptions
    func loadLedgerSnapshot(
        userID: UUID,
        familyID: UUID?,
        memberCount: Int
    ) async throws -> LedgerSnapshot
    func createMovement(
        _ draft: MovementDraft,
        userID: UUID,
        userDisplayName: String,
        familyID: UUID?
    ) async throws
    func createTransfer(_ draft: TransferDraft, userID: UUID, familyID: UUID?) async throws
    func deleteMovement(id: String, shared: Bool, userID: UUID, familyID: UUID?) async throws
    func saveAccount(_ draft: AccountDraft, userID: UUID, familyID: UUID?) async throws
    func deleteAccount(_ account: AccountSummary, userID: UUID, familyID: UUID?) async throws
    func saveDirectory(_ item: LedgerDirectoryItem, kind: LedgerDirectoryKind, userID: UUID, familyID: UUID?) async throws
    func deleteDirectory(kind: LedgerDirectoryKind, id: String, replacementID: String?, scope: DirectoryScope, userID: UUID, familyID: UUID?) async throws
    func createReimbursement(_ draft: ReimbursementDraft, userID: UUID, familyID: UUID) async throws -> String
    func respondToReimbursement(id: String, accepted: Bool, accountID: String?, familyID: UUID) async throws
    func createLoan(_ draft: LoanDraft, userID: UUID, familyID: UUID) async throws
    func respondToLoan(id: String, accepted: Bool, accountID: String?, familyID: UUID) async throws
    func createLoanRepayment(_ draft: LoanRepaymentDraft, familyID: UUID) async throws
    func respondToLoanRepayment(id: String, accepted: Bool, accountID: String?, categoryID: String?, recipientMovementID: String?, familyID: UUID) async throws
}

struct SupabaseLedgerRepository: LedgerRepository {
    let client: SupabaseClient

    func loadLedgerSnapshot(
        userID: UUID,
        familyID: UUID?,
        memberCount: Int
    ) async throws -> LedgerSnapshot {
        async let personalRowRequest: RawAppDataRow? = client
            .from("user_app_data")
            .select("data")
            .eq("user_id", value: userID)
            .maybeSingle()
            .execute()
            .value

        let familyRow: RawAppDataRow?
        let sharedAccounts: [SharedAccountRow]
        let sharedRecords: [SharedRecordRow]

        if let familyID {
            async let familyRowRequest: RawAppDataRow? = client
                .from("family_user_app_data")
                .select("data")
                .eq("family_id", value: familyID)
                .eq("user_id", value: userID)
                .maybeSingle()
                .execute()
                .value

            async let accountsRequest: [SharedAccountRow] = client
                .from("accounts")
                .select("id, family_id, name, institution, account_type, opening_balance, opening_balance_date")
                .eq("family_id", value: familyID)
                .eq("scope", value: "family")
                .execute()
                .value

            async let recordsRequest: [SharedRecordRow] = client
                .from("family_shared_records")
                .select("record_type, record_id, data, created_by")
                .eq("family_id", value: familyID)
                .execute()
                .value

            (familyRow, sharedAccounts, sharedRecords) = try await (
                familyRowRequest,
                accountsRequest,
                recordsRequest
            )
        } else {
            familyRow = nil
            sharedAccounts = []
            sharedRecords = []
        }

        var personalRoot = appDataRoot(from: try await personalRowRequest?.data)
        var familyRoot = appDataRoot(from: familyRow?.data)
        let resolvedSharedRecords = applyingDirectoryRedirects(
            from: sharedRecords,
            personalRoot: &personalRoot,
            familyRoot: &familyRoot
        )
        let today = Self.dayFormatter.string(from: Date())
        let personalChanged = materializeDuePayments(in: &personalRoot, through: today)
        let familyChanged = materializeDuePayments(in: &familyRoot, through: today)

        if personalChanged {
            try await client.from("user_app_data")
                .upsert(UserAppDataUpsert(userID: userID, data: .object(personalRoot)), onConflict: "user_id")
                .execute()
        }
        if familyChanged, let familyID {
            try await client.from("family_user_app_data")
                .upsert(
                    FamilyAppDataUpsert(familyID: familyID, userID: userID, data: .object(familyRoot)),
                    onConflict: "family_id,user_id"
                )
                .execute()
            let familyAccountIDs = Set(sharedAccounts.map { $0.id.uuidString.lowercased() })
            let payloads = transactionPayloads(in: familyRoot, familyAccountIDs: familyAccountIDs)
            var ownedKeys = Set(resolvedSharedRecords.compactMap { row -> SharedRecordKey? in
                guard row.createdBy == userID, Self.transactionRecordTypes.contains(row.recordType) else {
                    return nil
                }
                return SharedRecordKey(type: row.recordType, id: row.recordID)
            })
            ownedKeys.formUnion(payloads.map { SharedRecordKey(type: $0.type, id: $0.id) })
            try await client.rpc(
                "sync_family_shared_records",
                params: SyncSharedRecordsParameters(
                    familyID: familyID,
                    records: payloads,
                    ownedKeys: ownedKeys.sorted {
                        $0.type == $1.type ? $0.id < $1.id : $0.type < $1.type
                    }
                )
            ).execute()
        }
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

        let privateCategories = mergedByID(
            preferred: decodeArray(LedgerDirectoryItem.self, key: "categories", from: familyRoot),
            additional: decodeArray(LedgerDirectoryItem.self, key: "categories", from: personalRoot)
        )
        let privateBeneficiaries = mergedByID(
            preferred: decodeArray(LedgerDirectoryItem.self, key: "beneficiaries", from: familyRoot),
            additional: decodeArray(LedgerDirectoryItem.self, key: "beneficiaries", from: personalRoot)
        )
        let privateSenders = mergedByID(
            preferred: decodeArray(LedgerDirectoryItem.self, key: "senders", from: familyRoot),
            additional: decodeArray(LedgerDirectoryItem.self, key: "senders", from: personalRoot)
        )
        let privateTags = mergedByID(
            preferred: decodeArray(LedgerDirectoryItem.self, key: "tags", from: familyRoot),
            additional: decodeArray(LedgerDirectoryItem.self, key: "tags", from: personalRoot)
        )
        let currentAuthorID = userID.uuidString.lowercased()
        let privateMovements = mergedByID(
            preferred: decodeArray(LedgerMovement.self, key: "movements", from: familyRoot),
            additional: decodeArray(LedgerMovement.self, key: "movements", from: personalRoot)
        ).filter { $0.authorID.lowercased() == currentAuthorID }
        let privateScheduledPayments = mergedByID(
            preferred: decodeArray(LedgerScheduledPayment.self, key: "scheduledPayments", from: familyRoot),
            additional: decodeArray(LedgerScheduledPayment.self, key: "scheduledPayments", from: personalRoot)
        ).filter { $0.authorID.lowercased() == currentAuthorID }
        let privateTransfers = mergedByID(
            preferred: decodeArray(LedgerTransfer.self, key: "transfers", from: familyRoot),
            additional: decodeArray(LedgerTransfer.self, key: "transfers", from: personalRoot)
        ).filter { $0.authorID.lowercased() == currentAuthorID }
        let privateReimbursements = mergedByID(
            preferred: decodeArray(LedgerReimbursement.self, key: "reimbursements", from: familyRoot),
            additional: decodeArray(LedgerReimbursement.self, key: "reimbursements", from: personalRoot)
        ).filter { $0.authorID.lowercased() == currentAuthorID }

        let sharedCategories = decodeShared(LedgerDirectoryItem.self, type: "category", from: resolvedSharedRecords)
        let sharedBeneficiaries = decodeShared(LedgerDirectoryItem.self, type: "beneficiary", from: resolvedSharedRecords)
        let sharedSenders = decodeShared(LedgerDirectoryItem.self, type: "sender", from: resolvedSharedRecords)
        let sharedTags = decodeShared(LedgerDirectoryItem.self, type: "tag", from: resolvedSharedRecords)
        let sharedMovements = decodeShared(LedgerMovement.self, type: "movement", from: resolvedSharedRecords)
        let sharedScheduledPayments = decodeShared(
            LedgerScheduledPayment.self,
            type: "scheduled_payment",
            from: resolvedSharedRecords
        )
        let sharedTransfers = decodeShared(LedgerTransfer.self, type: "transfer", from: resolvedSharedRecords)
        let sharedReimbursements = decodeShared(
            LedgerReimbursement.self,
            type: "reimbursement",
            from: resolvedSharedRecords
        )
        let sharedLoans = decodeShared(LedgerLoan.self, type: "loan", from: resolvedSharedRecords)
        let sharedLoanRepayments = decodeShared(
            LedgerLoanRepayment.self, type: "loan_repayment", from: resolvedSharedRecords
        )

        return LedgerSnapshot(
            currentUserID: userID.uuidString.lowercased(),
            memberCount: max(1, memberCount),
            accounts: (personalAccounts + familyAccounts).sorted(by: sortByName),
            categories: mergedByID(preferred: privateCategories, additional: sharedCategories)
                .sorted(by: sortByName),
            beneficiaries: mergedByID(preferred: privateBeneficiaries, additional: sharedBeneficiaries)
                .sorted(by: sortByName),
            senders: mergedByID(preferred: privateSenders, additional: sharedSenders)
                .sorted(by: sortByName),
            tags: mergedByID(preferred: privateTags, additional: sharedTags)
                .sorted(by: sortByName),
            movements: mergedByID(preferred: privateMovements, additional: sharedMovements)
                .sorted(by: Self.sortMovements),
            scheduledPayments: mergedByID(
                preferred: privateScheduledPayments,
                additional: sharedScheduledPayments
            ).sorted {
                $0.dueDate == $1.dueDate ? $0.installmentNumber < $1.installmentNumber : $0.dueDate < $1.dueDate
            },
            transfers: mergedByID(preferred: privateTransfers, additional: sharedTransfers),
            // The family record carries a confirmed/rejected status that must
            // override an older private pending copy.
            reimbursements: mergedByID(
                preferred: sharedReimbursements,
                additional: privateReimbursements
            ),
            loans: sharedLoans,
            loanRepayments: sharedLoanRepayments
        )
    }

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
                .in("record_type", values: ["category", "beneficiary", "sender", "tag"])
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
            ),
            tags: mergedDirectories(
                personal: decodeArray(LedgerDirectoryItem.self, key: "tags", from: personalRoot),
                shared: sharedItems.filter { $0.0 == "tag" }.map(\.1)
            )
        )
    }

    func createMovement(
        _ draft: MovementDraft,
        userID: UUID,
        userDisplayName: String,
        familyID: UUID?
    ) async throws {
        let effectivelyShared = draft.isShared
            || draft.account.familyID != nil
            || (draft.splits?.contains { $0.isShared } ?? false)

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

    func createTransfer(_ draft: TransferDraft, userID: UUID, familyID: UUID?) async throws {
        guard draft.amount > 0 else { throw LedgerRepositoryError.invalidTransferAmount }
        guard draft.fromAccount.id != draft.toAccount.id else {
            throw LedgerRepositoryError.invalidTransferAccounts
        }

        let description = draft.description.trimmingCharacters(in: .whitespacesAndNewlines)
        let transfer = LedgerTransfer(
            id: draft.id,
            authorID: userID.uuidString.lowercased(),
            fromAccountID: draft.fromAccount.id,
            toAccountID: draft.toAccount.id,
            amount: Money(decimal: draft.amount),
            date: Self.dayFormatter.string(from: draft.date),
            description: description.isEmpty ? "Giro fondi" : description
        )
        let data = try JSONValue.encode(transfer)
        let isShared = draft.fromAccount.familyID != nil || draft.toAccount.familyID != nil

        guard isShared else {
            let row: RawAppDataRow? = try await client.from("user_app_data")
                .select("data")
                .eq("user_id", value: userID)
                .maybeSingle()
                .execute()
                .value
            var root = appDataRoot(from: row?.data)
            upsertJSON(data, id: draft.id, in: "transfers", root: &root)
            try await client.from("user_app_data")
                .upsert(UserAppDataUpsert(userID: userID, data: .object(root)), onConflict: "user_id")
                .execute()
            return
        }

        guard let familyID else { throw LedgerRepositoryError.familyRequired }
        let familyAccounts = [draft.fromAccount, draft.toAccount].compactMap(\.familyID)
        guard familyAccounts.allSatisfy({ $0 == familyID }) else {
            throw LedgerRepositoryError.transferFamilyMismatch
        }

        async let privateRowRequest: RawAppDataRow? = client.from("family_user_app_data")
            .select("data")
            .eq("family_id", value: familyID)
            .eq("user_id", value: userID)
            .maybeSingle()
            .execute()
            .value
        async let existingKeysRequest: [OwnedSharedRecordRow] = client.from("family_shared_records")
            .select("record_type, record_id")
            .eq("family_id", value: familyID)
            .eq("created_by", value: userID)
            .in("record_type", values: Self.transactionRecordTypes)
            .execute()
            .value

        let (privateRow, existingKeys) = try await (privateRowRequest, existingKeysRequest)
        var root = appDataRoot(from: privateRow?.data)
        upsertJSON(data, id: draft.id, in: "transfers", root: &root)
        var ownedKeys = Set(existingKeys.map { SharedRecordKey(type: $0.recordType, id: $0.recordID) })
        ownedKeys.formUnion(transactionKeys(in: root))
        ownedKeys.insert(SharedRecordKey(type: "transfer", id: draft.id))

        try await client.from("family_user_app_data")
            .upsert(
                FamilyAppDataUpsert(familyID: familyID, userID: userID, data: .object(root)),
                onConflict: "family_id,user_id"
            )
            .execute()
        try await client.rpc(
            "sync_family_shared_records",
            params: SyncSharedRecordsParameters(
                familyID: familyID,
                records: [SharedRecordPayload(type: "transfer", id: draft.id, data: data)],
                ownedKeys: ownedKeys.sorted {
                    $0.type == $1.type ? $0.id < $1.id : $0.type < $1.type
                }
            )
        ).execute()
    }

    func saveAccount(_ draft: AccountDraft, userID: UUID, familyID: UUID?) async throws {
        let name = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { throw LedgerRepositoryError.accountNameRequired }
        let institution = draft.institution.trimmingCharacters(in: .whitespacesAndNewlines)
        let openingDate = Self.dayFormatter.string(from: draft.openingBalanceDate)

        if let targetFamilyID = draft.familyID {
            guard let accountID = UUID(uuidString: draft.id) else {
                throw LedgerRepositoryError.invalidAccountID
            }
            if draft.isNew {
                try await client.from("accounts").insert(
                    SharedAccountInsert(
                        id: accountID,
                        familyID: targetFamilyID,
                        name: name,
                        institution: institution,
                        accountType: draft.kind,
                        openingBalance: draft.openingBalance,
                        openingBalanceDate: openingDate,
                        createdBy: userID
                    )
                ).execute()
            } else {
                try await client.from("accounts")
                    .update(SharedAccountUpdate(
                        name: name,
                        institution: institution,
                        accountType: draft.kind,
                        openingBalance: draft.openingBalance,
                        openingBalanceDate: openingDate
                    ))
                    .eq("id", value: accountID)
                    .eq("family_id", value: targetFamilyID)
                    .eq("scope", value: "family")
                    .execute()
            }
            return
        }

        let existingRow: RawAppDataRow? = try await client.from("user_app_data")
            .select("data")
            .eq("user_id", value: userID)
            .maybeSingle()
            .execute()
            .value
        var root = appDataRoot(from: existingRow?.data)
        let account: JSONValue = .object([
            "id": .string(draft.id),
            "ownerId": .string(userID.uuidString.lowercased()),
            "name": .string(name),
            "institution": .string(institution),
            "type": .string(draft.kind.rawValue),
            "scope": .string("personal"),
            "openingBalance": .number(draft.openingBalance),
            "openingBalanceDate": .string(openingDate)
        ])
        upsertJSON(account, id: draft.id, in: "accounts", root: &root)
        try await client.from("user_app_data")
            .upsert(UserAppDataUpsert(userID: userID, data: .object(root)), onConflict: "user_id")
            .execute()
        if let reimbursementFamilyIDs = draft.reimbursementFamilyIDs {
            try await setReimbursementAccountFamilies(
                accountID: draft.id,
                name: name,
                familyIDs: reimbursementFamilyIDs
            )
        }
    }

    func deleteAccount(_ account: AccountSummary, userID: UUID, familyID: UUID?) async throws {
        if account.familyID != nil {
            guard let familyID, account.familyID == familyID,
                  let accountID = UUID(uuidString: account.id)
            else { throw LedgerRepositoryError.familyRequired }
            try await client.from("accounts")
                .delete()
                .eq("id", value: accountID)
                .eq("family_id", value: familyID)
                .eq("scope", value: "family")
                .execute()
            return
        }

        let existingRow: RawAppDataRow? = try await client.from("user_app_data")
            .select("data")
            .eq("user_id", value: userID)
            .maybeSingle()
            .execute()
            .value
        var root = appDataRoot(from: existingRow?.data)
        root["accounts"] = .array((root["accounts"]?.arrayValue ?? []).filter {
            $0.objectValue?["id"]?.stringValue != account.id
        })
        try await client.from("user_app_data")
            .upsert(UserAppDataUpsert(userID: userID, data: .object(root)), onConflict: "user_id")
            .execute()
        try await client.from("family_reimbursement_accounts")
            .delete()
            .eq("owner_id", value: userID)
            .eq("account_id", value: account.id)
            .execute()
    }

    func saveDirectory(
        _ item: LedgerDirectoryItem,
        kind: LedgerDirectoryKind,
        userID: UUID,
        familyID: UUID?
    ) async throws {
        let name = item.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { throw LedgerRepositoryError.directoryNameRequired }
        let resolved = LedgerDirectoryItem(
            id: item.id,
            name: name,
            scope: item.scope,
            ownerID: item.scope == .personal ? userID.uuidString.lowercased() : nil,
            movementType: kind == .category ? item.movementType : nil,
            color: item.color
        )

        if item.scope == .family {
            guard let familyID else { throw LedgerRepositoryError.familyRequired }
            let existing: [OwnedSharedRecordRow] = try await client.from("family_shared_records")
                .select("record_type, record_id")
                .eq("family_id", value: familyID)
                .eq("created_by", value: userID)
                .execute()
                .value
            var keys = Set(existing.map { SharedRecordKey(type: $0.recordType, id: $0.recordID) })
            keys.insert(SharedRecordKey(type: kind.rawValue, id: resolved.id))
            try await client.rpc(
                "sync_family_shared_records",
                params: SyncSharedRecordsParameters(
                    familyID: familyID,
                    records: [SharedRecordPayload(
                        type: kind.rawValue,
                        id: resolved.id,
                        data: try JSONValue.encode(resolved)
                    )],
                    ownedKeys: keys.sorted { $0.type == $1.type ? $0.id < $1.id : $0.type < $1.type }
                )
            ).execute()
            return
        }

        let row: RawAppDataRow? = try await client.from("user_app_data")
            .select("data")
            .eq("user_id", value: userID)
            .maybeSingle()
            .execute()
            .value
        var root = appDataRoot(from: row?.data)
        upsert(resolved, in: kind.arrayKey, root: &root)
        try await client.from("user_app_data")
            .upsert(UserAppDataUpsert(userID: userID, data: .object(root)), onConflict: "user_id")
            .execute()
    }

    func deleteDirectory(
        kind: LedgerDirectoryKind,
        id: String,
        replacementID: String?,
        scope: DirectoryScope,
        userID: UUID,
        familyID: UUID?
    ) async throws {
        if scope == .family {
            guard let familyID else { throw LedgerRepositoryError.familyRequired }
            try await client.rpc(
                "delete_family_directory_record",
                params: DeleteDirectoryParameters(
                    familyID: familyID,
                    recordType: kind.rawValue,
                    recordID: id,
                    replacementID: replacementID
                )
            ).execute()
        }

        let personalRow: RawAppDataRow? = try await client.from("user_app_data")
            .select("data").eq("user_id", value: userID).maybeSingle().execute().value
        var personalRoot = appDataRoot(from: personalRow?.data)
        applyDirectoryDeletion(kind: kind, id: id, replacementID: replacementID, root: &personalRoot)
        try await client.from("user_app_data")
            .upsert(UserAppDataUpsert(userID: userID, data: .object(personalRoot)), onConflict: "user_id")
            .execute()

        if let familyID {
            let familyRow: RawAppDataRow? = try await client.from("family_user_app_data")
                .select("data").eq("family_id", value: familyID).eq("user_id", value: userID)
                .maybeSingle().execute().value
            var familyRoot = appDataRoot(from: familyRow?.data)
            applyDirectoryDeletion(kind: kind, id: id, replacementID: replacementID, root: &familyRoot)
            try await client.from("family_user_app_data")
                .upsert(
                    FamilyAppDataUpsert(familyID: familyID, userID: userID, data: .object(familyRoot)),
                    onConflict: "family_id,user_id"
                )
                .execute()
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
        if let tag = draft.tag { upsert(personalCopy(tag, userID: userID), in: "tags", root: &root) }
        let splits = resolveSplits(draft, userID: userID, familyAccount: false)
        for split in splits {
            upsert(split.category, in: "categories", root: &root)
            if let splitBeneficiary = split.beneficiary {
                upsert(splitBeneficiary, in: "beneficiaries", root: &root)
            }
        }

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
            shared: false,
            splits: splits,
            preserving: existingJSON(id: draft.id, in: "movements", root: root)
        )
        upsertJSON(movement, id: draft.id, in: "movements", root: &root)
        for payment in scheduledPaymentJSON(
            draft,
            userID: userID,
            category: category,
            beneficiary: beneficiary,
            shared: false,
            splits: splits
        ) {
            guard let id = payment.objectValue?["id"]?.stringValue else { continue }
            upsertJSON(payment, id: id, in: "scheduledPayments", root: &root)
        }
        propagateInstallmentEdits(from: movement, in: &root)

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

        async let personalRowRequest: RawAppDataRow? = client
            .from("user_app_data")
            .select("data")
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

        let (privateRow, personalRow, existingKeys) = try await (
            privateRowRequest,
            personalRowRequest,
            existingKeysRequest
        )
        var familyRoot = appDataRoot(from: privateRow?.data)
        var personalRoot = appDataRoot(from: personalRow?.data)
        let familyAccount = draft.account.familyID != nil
        let mainShared = familyAccount || draft.isShared
        let category = mainShared
            ? draft.category.familyCopyWith(movementType: draft.type)
            : personalCopy(draft.category, userID: userID, movementType: draft.type)
        let splits = resolveSplits(draft, userID: userID, familyAccount: familyAccount)

        let beneficiary: LedgerDirectoryItem?
        let sender: LedgerDirectoryItem?

        if draft.type == .expense {
            beneficiary = mainShared
                ? draft.counterparty.familyCopy()
                : personalCopy(draft.counterparty, userID: userID)
            sender = nil
        } else {
            beneficiary = userBeneficiary(
                userID: userID,
                name: userDisplayName,
                scope: mainShared ? .family : .personal
            )
            sender = mainShared
                ? draft.counterparty.familyCopy()
                : personalCopy(draft.counterparty, userID: userID)
        }

        if !mainShared {
            upsert(category, in: "categories", root: &personalRoot)
            if let tag = draft.tag { upsert(personalCopy(tag, userID: userID), in: "tags", root: &personalRoot) }
            if let beneficiary { upsert(beneficiary, in: "beneficiaries", root: &personalRoot) }
            if let sender { upsert(sender, in: "senders", root: &personalRoot) }
        }
        for split in splits where !split.shared {
            upsert(split.category, in: "categories", root: &personalRoot)
            if let splitBeneficiary = split.beneficiary {
                upsert(splitBeneficiary, in: "beneficiaries", root: &personalRoot)
            }
        }

        let existingMovement = existingJSON(id: draft.id, in: "movements", root: familyRoot)
        var movement = movementJSON(
            draft,
            userID: userID,
            category: category,
            beneficiary: beneficiary,
            sender: sender,
            shared: mainShared,
            splits: splits,
            preserving: existingMovement
        )
        if existingMovement != nil {
            movement = recalculatingInstallmentSettlement(for: movement, in: familyRoot)
        }
        upsertJSON(movement, id: draft.id, in: "movements", root: &familyRoot)
        var scheduledPayments = scheduledPaymentJSON(
            draft,
            userID: userID,
            category: category,
            beneficiary: beneficiary,
            shared: mainShared,
            splits: splits
        )
        for payment in scheduledPayments {
            guard let id = payment.objectValue?["id"]?.stringValue else { continue }
            upsertJSON(payment, id: id, in: "scheduledPayments", root: &familyRoot)
        }
        propagateInstallmentEdits(from: movement, in: &familyRoot)
        if let planID = movement.objectValue?["installmentPlanId"]?.stringValue,
           movement.objectValue?["installmentNumber"] == .number(1) {
            scheduledPayments = (familyRoot["scheduledPayments"]?.arrayValue ?? []).filter {
                $0.objectValue?["planId"]?.stringValue == planID
                    && $0.objectValue?["status"]?.stringValue == "scheduled"
            }
        }

        // The RPC treats owned_keys as the complete set. Include both server
        // state and the local family snapshot so an incremental native save can
        // never remove unrelated records created by the same member.
        var ownedKeys = Set(existingKeys
            .filter { $0.recordType != "scheduled_payment" }
            .map { SharedRecordKey(type: $0.recordType, id: $0.recordID) })
        ownedKeys.formUnion(transactionKeys(in: familyRoot).filter { $0.type != "scheduled_payment" })
        ownedKeys.insert(SharedRecordKey(type: "movement", id: draft.id))

        let sharedMovement = familyAccount ? movement : sanitizedSharedTransaction(movement) ?? movement
        var records = [SharedRecordPayload(type: "movement", id: draft.id, data: sharedMovement)]
        // Le rate restano nella copia privata familiare dell'autore, complete.
        // Il primo movimento pubblica già l'intera quota condivisa e agli altri
        // membri non serve conoscere il piano di addebito personale.
        let sharedCategories = ([mainShared ? category : nil] + splits.filter(\.shared).map(\.category))
            .compactMap { $0 }
            .reduce(into: [String: LedgerDirectoryItem]()) { $0[$1.id] = $1.familyCopyWith(movementType: draft.type) }
        records.append(contentsOf: try sharedCategories.values.map {
            SharedRecordPayload(type: "category", id: $0.id, data: try JSONValue.encode($0))
        })
        let sharedBeneficiaries = ([mainShared ? beneficiary : nil] + splits.filter(\.shared).map(\.beneficiary))
            .compactMap { $0 }
            .reduce(into: [String: LedgerDirectoryItem]()) { $0[$1.id] = $1.familyCopy() }
        records.append(contentsOf: try sharedBeneficiaries.values.map {
            SharedRecordPayload(type: "beneficiary", id: $0.id, data: try JSONValue.encode($0))
        })
        if mainShared, let sender {
            let sharedSender = sender.familyCopy()
            records.append(SharedRecordPayload(
                type: "sender",
                id: sharedSender.id,
                data: try JSONValue.encode(sharedSender)
            ))
        }
        if mainShared, let tag = draft.tag?.familyCopy() {
            records.append(SharedRecordPayload(
                type: "tag",
                id: tag.id,
                data: try JSONValue.encode(tag)
            ))
        }
        try await client
            .from("user_app_data")
            .upsert(UserAppDataUpsert(userID: userID, data: .object(personalRoot)), onConflict: "user_id")
            .execute()

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
        shared: Bool,
        splits: [ResolvedMovementSplit],
        preserving existing: JSONValue? = nil
    ) -> JSONValue {
        var object = existing?.objectValue ?? [:]
        let amounts = installmentAmounts(for: draft)
        let firstAmount = amounts.first?.decimal ?? draft.amount
        let description = draft.installment == nil
            ? draft.description
            : "\(draft.description) · rata 1/\(draft.installment!.count)"
        object.merge([
            "id": .string(draft.id),
            "type": .string(draft.type.rawValue),
            "authorId": .string(userID.uuidString.lowercased()),
            "memberId": .string(userID.uuidString.lowercased()),
            "amount": .number(firstAmount),
            "date": .string(Self.dayFormatter.string(from: draft.date)),
            "description": .string(description),
            "categoryId": .string(category.id),
            "accountId": .string(draft.account.id),
            "shared": .bool(shared)
        ]) { _, new in new }
        if object["createdAt"] == nil {
            object["createdAt"] = .string(Self.timestampFormatter.string(from: Date()))
        }

        if let beneficiary { object["beneficiaryId"] = .string(beneficiary.id) } else { object.removeValue(forKey: "beneficiaryId") }
        if let sender { object["senderId"] = .string(sender.id) } else { object.removeValue(forKey: "senderId") }
        if let tag = draft.tag { object["tagId"] = .string(tag.id) } else { object.removeValue(forKey: "tagId") }
        let firstSplits = installmentSplits(for: draft, splits: splits, installmentIndex: 0)
        if firstSplits.isEmpty {
            object.removeValue(forKey: "splits")
        } else {
            object["splits"] = .array(firstSplits.map(splitJSON))
        }
        if let comments = draft.comments { object["comments"] = .string(comments) } else { object.removeValue(forKey: "comments") }
        if let affectsAccountBalance = draft.affectsAccountBalance {
            object["affectsAccountBalance"] = .bool(affectsAccountBalance)
        } else {
            object.removeValue(forKey: "affectsAccountBalance")
        }
        if let commissionedPurchaseID = draft.commissionedPurchaseID {
            object["commissionedPurchaseId"] = .string(commissionedPurchaseID)
        } else { object.removeValue(forKey: "commissionedPurchaseId") }
        if let paidByUserID = draft.paidByUserID {
            object["paidByUserId"] = .string(paidByUserID.uuidString.lowercased())
        } else { object.removeValue(forKey: "paidByUserId") }
        if draft.excludeFromReports { object["excludeFromReports"] = .bool(true) }
        else { object.removeValue(forKey: "excludeFromReports") }
        if let installment = draft.installment {
            object["installmentPlanId"] = .string(installment.planID)
            object["installmentProvider"] = .string(installment.provider)
            object["installmentNumber"] = .number(1)
            object["installmentCount"] = .number(Decimal(installment.count))
            let settlement = sharedPurchaseAmount(for: draft, splits: splits, mainShared: shared)
            if settlement > .zero {
                object["sharedSettlementAmount"] = .number(settlement.decimal)
            } else {
                object.removeValue(forKey: "sharedSettlementAmount")
            }
        }
        return .object(object)
    }

    private func scheduledPaymentJSON(
        _ draft: MovementDraft,
        userID: UUID,
        category: LedgerDirectoryItem,
        beneficiary: LedgerDirectoryItem?,
        shared: Bool,
        splits: [ResolvedMovementSplit]
    ) -> [JSONValue] {
        guard let installment = draft.installment else { return [] }
        let amounts = installmentAmounts(for: draft)
        guard amounts.count == installment.count,
              installment.scheduledPaymentIDs.count == max(0, installment.count - 1)
        else { return [] }
        let user = userID.uuidString.lowercased()
        return amounts.dropFirst().enumerated().map { offset, amount in
            let dueDate = Self.dayFormatter.string(
                from: LedgerCalculations.date(byAddingMonths: offset + 1, to: draft.date)
            )
            var object: [String: JSONValue] = [
                "id": .string(installment.scheduledPaymentIDs[offset]),
                "planId": .string(installment.planID),
                "authorId": .string(user),
                "memberId": .string(user),
                "amount": .number(amount.decimal),
                "dueDate": .string(dueDate),
                "description": .string(draft.description),
                "categoryId": .string(category.id),
                "accountId": .string(draft.account.id),
                "shared": .bool(shared),
                "provider": .string(installment.provider),
                "installmentNumber": .number(Decimal(offset + 2)),
                "installmentCount": .number(Decimal(installment.count)),
                "status": .string("scheduled")
            ]
            if let beneficiary { object["beneficiaryId"] = .string(beneficiary.id) }
            if let tag = draft.tag { object["tagId"] = .string(tag.id) }
            let paymentSplits = installmentSplits(for: draft, splits: splits, installmentIndex: offset + 1)
            if !paymentSplits.isEmpty { object["splits"] = .array(paymentSplits.map(splitJSON)) }
            if let comments = draft.comments { object["comments"] = .string(comments) }
            if let openingDate = draft.account.openingBalanceDate,
               dueDate < openingDate,
               let affectsAccountBalance = draft.affectsAccountBalance {
                object["affectsAccountBalance"] = .bool(affectsAccountBalance)
            }
            return .object(object)
        }
    }

    private func installmentAmounts(for draft: MovementDraft) -> [Money] {
        LedgerCalculations.installmentAmounts(
            total: draft.amount,
            count: draft.installment?.count ?? 1
        )
    }

    private func resolveSplits(
        _ draft: MovementDraft,
        userID: UUID,
        familyAccount: Bool
    ) -> [ResolvedMovementSplit] {
        (draft.splits ?? []).map { split in
            let shared = familyAccount || split.isShared
            let category = shared
                ? split.category.familyCopyWith(movementType: .expense)
                : personalCopy(split.category, userID: userID, movementType: .expense)
            let beneficiary = split.beneficiary.map {
                shared ? $0.familyCopy() : personalCopy($0, userID: userID)
            }
            return ResolvedMovementSplit(
                id: split.id,
                amount: Money(decimal: split.amount),
                category: category,
                beneficiary: beneficiary,
                tag: split.tag,
                shared: shared && !split.excludeFromReports,
                commissionedPurchaseID: split.commissionedPurchaseID,
                excludeFromReports: split.excludeFromReports
            )
        }
    }

    private func installmentSplits(
        for draft: MovementDraft,
        splits: [ResolvedMovementSplit],
        installmentIndex: Int
    ) -> [ResolvedMovementSplit] {
        guard !splits.isEmpty else { return [] }
        let splitTotal = splits.reduce(Money.zero) { $0 + $1.amount }
        let mainRemainder = Money(cents: max(0, Money(decimal: draft.amount).cents - splitTotal.cents))
        let rows = LedgerCalculations.splitAllocationsAcrossInstallments(
            allocations: [mainRemainder] + splits.map(\.amount),
            installments: installmentAmounts(for: draft)
        )
        guard rows.indices.contains(installmentIndex) else { return splits }
        return zip(splits, rows[installmentIndex].dropFirst()).map { split, amount in
            ResolvedMovementSplit(
                id: split.id,
                amount: amount,
                category: split.category,
                beneficiary: split.beneficiary,
                tag: split.tag,
                shared: split.shared,
                commissionedPurchaseID: split.commissionedPurchaseID,
                excludeFromReports: split.excludeFromReports
            )
        }
    }

    private func sharedPurchaseAmount(
        for draft: MovementDraft,
        splits: [ResolvedMovementSplit],
        mainShared: Bool
    ) -> Money {
        let splitTotal = splits.reduce(Money.zero) { $0 + $1.amount }
        let remainder = Money(cents: max(0, Money(decimal: draft.amount).cents - splitTotal.cents))
        return splits.filter(\.shared).reduce(mainShared ? remainder : .zero) { $0 + $1.amount }
    }

    private func splitJSON(_ split: ResolvedMovementSplit) -> JSONValue {
        var object: [String: JSONValue] = [
            "id": .string(split.id),
            "amount": .number(split.amount.decimal),
            "categoryId": .string(split.category.id),
            "shared": .bool(split.shared)
        ]
        if let beneficiary = split.beneficiary { object["beneficiaryId"] = .string(beneficiary.id) }
        if let tag = split.tag { object["tagId"] = .string(tag.id) }
        if let commissionedPurchaseID = split.commissionedPurchaseID {
            object["commissionedPurchaseId"] = .string(commissionedPurchaseID)
        }
        if split.excludeFromReports { object["excludeFromReports"] = .bool(true) }
        return .object(object)
    }

    private func sanitizedSharedTransaction(_ value: JSONValue) -> JSONValue? {
        guard var source = value.objectValue,
              let total = source["amount"]?.numberValue
        else { return nil }

        let splits = source["splits"]?.arrayValue ?? []
        let splitTotal = splits.reduce(Decimal.zero) {
            $0 + ($1.objectValue?["amount"]?.numberValue ?? 0)
        }
        let remainder = max(0, total - splitTotal)
        var allocations: [(amount: Decimal, categoryID: String, beneficiaryID: String?, tagID: String?)] = []
        if source["shared"] == .bool(true), remainder > 0,
           let categoryID = source["categoryId"]?.stringValue {
            allocations.append((remainder, categoryID, source["beneficiaryId"]?.stringValue, source["tagId"]?.stringValue))
        }
        allocations.append(contentsOf: splits.compactMap { split in
            guard let object = split.objectValue,
                  object["shared"] == .bool(true),
                  let amount = object["amount"]?.numberValue,
                  amount > 0,
                  let categoryID = object["categoryId"]?.stringValue
            else { return nil }
            return (amount, categoryID, object["beneficiaryId"]?.stringValue, object["tagId"]?.stringValue)
        })
        guard let primary = allocations.first else { return nil }

        source["amount"] = .number(allocations.reduce(0) { $0 + $1.amount })
        source["categoryId"] = .string(primary.categoryID)
        if let beneficiaryID = primary.beneficiaryID {
            source["beneficiaryId"] = .string(beneficiaryID)
        } else {
            source.removeValue(forKey: "beneficiaryId")
        }
        if let tagID = primary.tagID {
            source["tagId"] = .string(tagID)
        } else {
            source.removeValue(forKey: "tagId")
        }
        source["shared"] = .bool(true)
        source["affectsAccountBalance"] = .bool(false)
        if allocations.count > 1 {
            source["splits"] = .array(allocations.dropFirst().enumerated().map { index, allocation in
                var split: [String: JSONValue] = [
                    "id": .string("\(source["id"]?.stringValue ?? "movement")-shared-\(index + 1)"),
                    "amount": .number(allocation.amount),
                    "categoryId": .string(allocation.categoryID),
                    "shared": .bool(true)
                ]
                if let beneficiaryID = allocation.beneficiaryID {
                    split["beneficiaryId"] = .string(beneficiaryID)
                }
                if let tagID = allocation.tagID { split["tagId"] = .string(tagID) }
                return .object(split)
            })
        } else {
            source.removeValue(forKey: "splits")
        }
        return .object(source)
    }

    private func propagateInstallmentEdits(from movement: JSONValue, in root: inout [String: JSONValue]) {
        guard let source = movement.objectValue,
              source["installmentNumber"] == .number(1),
              let planID = source["installmentPlanId"]?.stringValue
        else { return }
        let baseDescription = (source["description"]?.stringValue ?? "")
            .replacingOccurrences(
                of: #"\s*·\s*rata\s+\d+/\d+\s*$"#,
                with: "",
                options: [.regularExpression, .caseInsensitive]
            )
            .trimmingCharacters(in: .whitespacesAndNewlines)
        root["scheduledPayments"] = .array((root["scheduledPayments"]?.arrayValue ?? []).map { value in
            guard var payment = value.objectValue,
                  payment["planId"]?.stringValue == planID,
                  payment["status"]?.stringValue == "scheduled"
            else { return value }
            payment["description"] = .string(baseDescription)
            for key in ["categoryId", "beneficiaryId", "accountId", "tagId", "comments", "shared"] {
                if let replacement = source[key] { payment[key] = replacement } else { payment.removeValue(forKey: key) }
            }
            let sourceSplits: [String: JSONValue] = Dictionary(
                uniqueKeysWithValues: (source["splits"]?.arrayValue ?? []).compactMap { value -> (String, JSONValue)? in
                    guard let id = value.objectValue?["id"]?.stringValue else { return nil }
                    return (id, value)
                }
            )
            if sourceSplits.isEmpty {
                payment.removeValue(forKey: "splits")
            } else {
                payment["splits"] = .array((payment["splits"]?.arrayValue ?? []).compactMap { value in
                    guard var split = value.objectValue,
                          let id = split["id"]?.stringValue,
                          let replacement = sourceSplits[id]?.objectValue
                    else { return nil }
                    for key in ["categoryId", "beneficiaryId", "tagId", "shared", "commissionedPurchaseId", "excludeFromReports"] {
                        if let item = replacement[key] { split[key] = item } else { split.removeValue(forKey: key) }
                    }
                    return .object(split)
                })
            }
            return .object(payment)
        })
    }

    private func recalculatingInstallmentSettlement(
        for movement: JSONValue,
        in root: [String: JSONValue]
    ) -> JSONValue {
        guard var source = movement.objectValue,
              source["installmentNumber"] == .number(1),
              let planID = source["installmentPlanId"]?.stringValue
        else { return movement }
        let firstAmount = sharedAmount(in: source)
        let paidLater = (root["movements"]?.arrayValue ?? []).reduce(Decimal.zero) { total, value in
            guard let item = value.objectValue,
                  item["id"]?.stringValue != source["id"]?.stringValue,
                  item["installmentPlanId"]?.stringValue == planID
            else { return total }
            return total + sharedAmount(in: item)
        }
        let scheduled = (root["scheduledPayments"]?.arrayValue ?? []).reduce(Decimal.zero) { total, value in
            guard let item = value.objectValue,
                  item["planId"]?.stringValue == planID,
                  item["status"]?.stringValue == "scheduled"
            else { return total }
            return total + sharedAmount(in: item)
        }
        source["sharedSettlementAmount"] = .number(firstAmount + paidLater + scheduled)
        return .object(source)
    }

    private func sharedAmount(in object: [String: JSONValue]) -> Decimal {
        let total = object["amount"]?.numberValue ?? 0
        let splits = object["splits"]?.arrayValue ?? []
        let splitTotal = splits.reduce(Decimal.zero) {
            $0 + ($1.objectValue?["amount"]?.numberValue ?? 0)
        }
        let sharedSplits = splits.reduce(Decimal.zero) { total, value in
            guard let split = value.objectValue, split["shared"] == .bool(true) else { return total }
            return total + (split["amount"]?.numberValue ?? 0)
        }
        return sharedSplits + (object["shared"] == .bool(true) ? max(0, total - splitTotal) : 0)
    }

    func deleteMovement(id: String, shared: Bool, userID: UUID, familyID: UUID?) async throws {
        if shared {
            guard let familyID else { throw LedgerRepositoryError.familyRequired }
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
            var root = appDataRoot(from: privateRow?.data)
            let removedKeys = removeMovementAndInstallmentPlan(id: id, root: &root)
            var ownedKeys = Set(existingKeys.map { SharedRecordKey(type: $0.recordType, id: $0.recordID) })
            ownedKeys.formUnion(transactionKeys(in: root))
            ownedKeys.subtract(removedKeys)

            try await client.from("family_user_app_data")
                .upsert(FamilyAppDataUpsert(familyID: familyID, userID: userID, data: .object(root)), onConflict: "family_id,user_id")
                .execute()
            try await client.rpc(
                "sync_family_shared_records",
                params: SyncSharedRecordsParameters(
                    familyID: familyID,
                    records: [],
                    ownedKeys: ownedKeys.sorted { $0.type == $1.type ? $0.id < $1.id : $0.type < $1.type }
                )
            ).execute()
        } else {
            let existingRow: RawAppDataRow? = try await client.from("user_app_data")
                .select("data")
                .eq("user_id", value: userID)
                .maybeSingle()
                .execute()
                .value
            var root = appDataRoot(from: existingRow?.data)
            _ = removeMovementAndInstallmentPlan(id: id, root: &root)
            try await client.from("user_app_data")
                .upsert(UserAppDataUpsert(userID: userID, data: .object(root)), onConflict: "user_id")
                .execute()
        }
    }

    func createReimbursement(_ draft: ReimbursementDraft, userID: UUID, familyID: UUID) async throws -> String {
        async let privateRowRequest: RawAppDataRow? = client.from("family_user_app_data")
            .select("data")
            .eq("family_id", value: familyID)
            .eq("user_id", value: userID)
            .maybeSingle()
            .execute()
            .value
        async let existingKeysRequest: [OwnedSharedRecordRow] = client.from("family_shared_records")
            .select("record_type, record_id")
            .eq("family_id", value: familyID)
            .eq("created_by", value: userID)
            .in("record_type", values: Self.transactionRecordTypes)
            .execute()
            .value

        let (privateRow, existingKeys) = try await (privateRowRequest, existingKeysRequest)
        var root = appDataRoot(from: privateRow?.data)
        let id = draft.id
        var object: [String: JSONValue] = [
            "id": .string(id),
            "fromId": .string(draft.fromID.uuidString.lowercased()),
            "toId": .string(draft.toID.uuidString.lowercased()),
            "amount": .number(draft.amount),
            "date": .string(Self.dayFormatter.string(from: draft.date)),
            "authorId": .string(userID.uuidString.lowercased()),
            "status": .string("pending")
        ]
        if let groupID = draft.groupID { object["groupId"] = .string(groupID) }
        if let fromAccountID = draft.fromAccountID { object["fromAccountId"] = .string(fromAccountID) }
        if let toAccountID = draft.toAccountID { object["toAccountId"] = .string(toAccountID) }
        object["settlementMethod"] = .string(draft.settlementMethod.rawValue)
        if let commissionedPurchaseID = draft.commissionedPurchaseID {
            object["commissionedPurchaseId"] = .string(commissionedPurchaseID)
        }
        let reimbursement = JSONValue.object(object)
        upsertJSON(reimbursement, id: id, in: "reimbursements", root: &root)

        var ownedKeys = Set(existingKeys.map { SharedRecordKey(type: $0.recordType, id: $0.recordID) })
        ownedKeys.formUnion(transactionKeys(in: root))
        ownedKeys.insert(SharedRecordKey(type: "reimbursement", id: id))
        try await client.from("family_user_app_data")
            .upsert(FamilyAppDataUpsert(familyID: familyID, userID: userID, data: .object(root)), onConflict: "family_id,user_id")
            .execute()
        try await client.rpc(
            "sync_family_shared_records",
            params: SyncSharedRecordsParameters(
                familyID: familyID,
                records: [SharedRecordPayload(type: "reimbursement", id: id, data: reimbursement)],
                ownedKeys: ownedKeys.sorted { $0.type == $1.type ? $0.id < $1.id : $0.type < $1.type }
            )
        ).execute()
        return id
    }

    func respondToReimbursement(id: String, accepted: Bool, accountID: String?, familyID: UUID) async throws {
        try await client.rpc(
            "respond_to_family_reimbursement",
            params: ReimbursementResponseParameters(
                familyID: familyID,
                reimbursementID: id,
                accepted: accepted,
                accountID: accountID
            )
        ).execute()
    }

    func createLoan(_ draft: LoanDraft, userID: UUID, familyID: UUID) async throws {
        try await client.rpc("create_family_loan", params: CreateLoanParameters(
            familyID: familyID, loanID: draft.id, borrowerID: draft.borrowerID,
            amount: draft.amount, date: Self.dayFormatter.string(from: draft.date),
            description: draft.description, lenderAccountID: draft.lenderAccountID
        )).execute()
    }

    func respondToLoan(id: String, accepted: Bool, accountID: String?, familyID: UUID) async throws {
        try await client.rpc("respond_to_family_loan", params: LoanResponseParameters(
            familyID: familyID, loanID: id, accepted: accepted, accountID: accountID
        )).execute()
    }

    func createLoanRepayment(_ draft: LoanRepaymentDraft, familyID: UUID) async throws {
        try await client.rpc("create_family_loan_repayment", params: CreateLoanRepaymentParameters(
            familyID: familyID, repaymentID: draft.id, loanID: draft.loanID,
            amount: draft.amount, date: Self.dayFormatter.string(from: draft.date),
            description: draft.description, method: draft.method.rawValue,
            fromAccountID: draft.fromAccountID, payerMovementID: draft.payerMovementID
        )).execute()
    }

    func respondToLoanRepayment(id: String, accepted: Bool, accountID: String?, categoryID: String?, recipientMovementID: String?, familyID: UUID) async throws {
        try await client.rpc("respond_to_family_loan_repayment", params: LoanRepaymentResponseParameters(
            familyID: familyID, repaymentID: id, accepted: accepted, accountID: accountID,
            categoryID: categoryID, recipientMovementID: recipientMovementID
        )).execute()
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

    private func existingJSON(id: String, in key: String, root: [String: JSONValue]) -> JSONValue? {
        root[key]?.arrayValue?.first { $0.objectValue?["id"]?.stringValue == id }
    }

    private func removeJSON(id: String, from key: String, root: inout [String: JSONValue]) {
        root[key] = .array((root[key]?.arrayValue ?? []).filter {
            $0.objectValue?["id"]?.stringValue != id
        })
    }

    private func removeMovementAndInstallmentPlan(
        id: String,
        root: inout [String: JSONValue]
    ) -> Set<SharedRecordKey> {
        let movements = root["movements"]?.arrayValue ?? []
        guard let target = movements.first(where: { $0.objectValue?["id"]?.stringValue == id }) else {
            return []
        }
        let targetObject = target.objectValue ?? [:]
        let deletesWholePlan = targetObject["installmentNumber"] == .number(1)
            && targetObject["installmentPlanId"]?.stringValue != nil
        let planID = deletesWholePlan ? targetObject["installmentPlanId"]?.stringValue : nil
        var removed = Set<SharedRecordKey>()

        root["movements"] = .array(movements.filter { value in
            let object = value.objectValue ?? [:]
            let shouldRemove = planID.map { object["installmentPlanId"]?.stringValue == $0 }
                ?? (object["id"]?.stringValue == id)
            if shouldRemove, let movementID = object["id"]?.stringValue {
                removed.insert(SharedRecordKey(type: "movement", id: movementID))
            }
            return !shouldRemove
        })
        root["scheduledPayments"] = .array((root["scheduledPayments"]?.arrayValue ?? []).filter { value in
            let object = value.objectValue ?? [:]
            let shouldRemove = planID.map { object["planId"]?.stringValue == $0 }
                ?? (object["paidMovementId"]?.stringValue == id)
            if shouldRemove, let paymentID = object["id"]?.stringValue {
                removed.insert(SharedRecordKey(type: "scheduled_payment", id: paymentID))
            }
            return !shouldRemove
        })
        return removed
    }

    private func transactionKeys(in root: [String: JSONValue]) -> Set<SharedRecordKey> {
        let mappings = [
            ("movements", "movement"),
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

    private func transactionPayloads(
        in root: [String: JSONValue],
        familyAccountIDs: Set<String> = []
    ) -> [SharedRecordPayload] {
        let mappings = [
            ("movements", "movement"),
            ("reimbursements", "reimbursement"),
            ("transfers", "transfer")
        ]
        return mappings.flatMap { arrayKey, recordType in
            (root[arrayKey]?.arrayValue ?? []).compactMap { value in
                guard let object = value.objectValue,
                      let id = object["id"]?.stringValue
                else { return nil }
                let isSplitTransaction = recordType == "movement"
                let accountID = object["accountId"]?.stringValue?.lowercased()
                let data = isSplitTransaction && !familyAccountIDs.contains(accountID ?? "")
                    ? sanitizedSharedTransaction(value)
                    : value
                return data.map { SharedRecordPayload(type: recordType, id: id, data: $0) }
            }
        }
    }

    private func materializeDuePayments(
        in root: inout [String: JSONValue],
        through today: String
    ) -> Bool {
        var changed = false
        var movements = root["movements"]?.arrayValue ?? []
        var movementIDs = Set(movements.compactMap { $0.objectValue?["id"]?.stringValue })
        let payments = (root["scheduledPayments"]?.arrayValue ?? []).map { value -> JSONValue in
            guard var payment = value.objectValue,
                  payment["status"]?.stringValue != "paid",
                  let dueDate = payment["dueDate"]?.stringValue,
                  dueDate <= today,
                  let paymentID = payment["id"]?.stringValue,
                  let planID = payment["planId"]?.stringValue,
                  let authorID = payment["authorId"]?.stringValue,
                  let memberID = payment["memberId"]?.stringValue,
                  let amount = payment["amount"],
                  let description = payment["description"]?.stringValue,
                  let categoryID = payment["categoryId"]?.stringValue,
                  let accountID = payment["accountId"]?.stringValue,
                  let installmentNumber = payment["installmentNumber"],
                  let installmentCount = payment["installmentCount"]
            else { return value }

            let movementID = payment["paidMovementId"]?.stringValue ?? "installment-\(paymentID)"
            if !movementIDs.contains(movementID) {
                var movement: [String: JSONValue] = [
                    "id": .string(movementID),
                    "type": .string("expense"),
                    "authorId": .string(authorID),
                    "memberId": .string(memberID),
                    "amount": amount,
                    "date": .string(dueDate),
                    "description": .string("\(description) · rata \(installmentNumber.decimalInteger)/\(installmentCount.decimalInteger)"),
                    "categoryId": .string(categoryID),
                    "accountId": .string(accountID),
                    "shared": payment["shared"] ?? .bool(false),
                    "installmentPlanId": .string(planID),
                    "installmentNumber": installmentNumber,
                    "installmentCount": installmentCount,
                    "createdAt": .string("\(dueDate)T08:00:00.000Z")
                ]
                for key in ["beneficiaryId", "tagId", "comments", "splits", "provider", "affectsAccountBalance"] {
                    if let inherited = payment[key] { movement[key == "provider" ? "installmentProvider" : key] = inherited }
                }
                let isShared = payment["shared"] == .bool(true)
                    || (payment["splits"]?.arrayValue ?? []).contains {
                        $0.objectValue?["shared"] == .bool(true)
                    }
                if isShared { movement["sharedSettlementAmount"] = .number(0) }
                movements.insert(.object(movement), at: 0)
                movementIDs.insert(movementID)
            }
            payment["status"] = .string("paid")
            payment["paidMovementId"] = .string(movementID)
            changed = true
            return .object(payment)
        }
        guard changed else { return false }
        root["movements"] = .array(movements)
        root["scheduledPayments"] = .array(payments)
        return true
    }

    private func applyingDirectoryRedirects(
        from records: [SharedRecordRow],
        personalRoot: inout [String: JSONValue],
        familyRoot: inout [String: JSONValue]
    ) -> [SharedRecordRow] {
        let redirects = records.compactMap { row -> (LedgerDirectoryKind, String, String?)? in
            guard row.recordType == "directory_redirect",
                  let object = row.data.objectValue,
                  let kindValue = object["kind"]?.stringValue,
                  let kind = LedgerDirectoryKind(rawValue: kindValue),
                  let oldID = object["oldId"]?.stringValue
            else { return nil }
            return (kind, oldID, object["replacementId"]?.stringValue)
        }
        guard !redirects.isEmpty else { return records }
        let map = Dictionary(uniqueKeysWithValues: redirects.map { ("\($0.0.rawValue):\($0.1)", $0) })
        func finalReplacement(kind: LedgerDirectoryKind, oldID: String, initial: String?) -> String? {
            var seen = Set([oldID])
            var replacement = initial
            while let current = replacement,
                  !seen.contains(current),
                  let next = map["\(kind.rawValue):\(current)"] {
                seen.insert(current)
                replacement = next.2
            }
            return replacement
        }
        let resolved = redirects.map { ($0.0, $0.1, finalReplacement(kind: $0.0, oldID: $0.1, initial: $0.2)) }
        for redirect in resolved {
            applyDirectoryDeletion(kind: redirect.0, id: redirect.1, replacementID: redirect.2, root: &personalRoot)
            applyDirectoryDeletion(kind: redirect.0, id: redirect.1, replacementID: redirect.2, root: &familyRoot)
        }
        return records.map { row in
            guard row.recordType == "movement" || row.recordType == "scheduled_payment",
                  var object = row.data.objectValue
            else { return row }
            for redirect in resolved {
                redirectDirectoryReferences(
                    kind: redirect.0,
                    id: redirect.1,
                    replacementID: redirect.2,
                    object: &object
                )
            }
            return SharedRecordRow(
                recordType: row.recordType,
                recordID: row.recordID,
                data: .object(object),
                createdBy: row.createdBy
            )
        }
    }

    private func applyDirectoryDeletion(
        kind: LedgerDirectoryKind,
        id: String,
        replacementID: String?,
        root: inout [String: JSONValue]
    ) {
        root[kind.arrayKey] = .array((root[kind.arrayKey]?.arrayValue ?? []).filter {
            $0.objectValue?["id"]?.stringValue != id
        })
        let deletedKey: String
        switch kind {
        case .category: deletedKey = "deletedCategoryIds"
        case .beneficiary: deletedKey = "deletedBeneficiaryIds"
        case .sender: deletedKey = "deletedSenderIds"
        case .tag: deletedKey = "deletedTagIds"
        }
        let deleted = Set((root[deletedKey]?.arrayValue ?? []).compactMap(\.stringValue)).union([id])
        root[deletedKey] = .array(deleted.sorted().map(JSONValue.string))
        if kind == .tag {
            root["tagReportIds"] = .array((root["tagReportIds"]?.arrayValue ?? []).filter {
                $0.stringValue != id
            })
        }
        for key in ["movements", "scheduledPayments"] {
            root[key] = .array((root[key]?.arrayValue ?? []).map { value in
                guard var object = value.objectValue else { return value }
                redirectDirectoryReferences(kind: kind, id: id, replacementID: replacementID, object: &object)
                return .object(object)
            })
        }
    }

    private func redirectDirectoryReferences(
        kind: LedgerDirectoryKind,
        id: String,
        replacementID: String?,
        object: inout [String: JSONValue]
    ) {
        let key: String
        switch kind {
        case .category: key = "categoryId"
        case .beneficiary: key = "beneficiaryId"
        case .sender: key = "senderId"
        case .tag: key = "tagId"
        }
        if object[key]?.stringValue == id {
            if let replacementID { object[key] = .string(replacementID) }
            else if kind == .category { object[key] = .string("") }
            else { object.removeValue(forKey: key) }
        }
        guard kind == .category || kind == .beneficiary else { return }
        object["splits"] = object["splits"].map { value in
            .array((value.arrayValue ?? []).map { splitValue in
                guard var split = splitValue.objectValue, split[key]?.stringValue == id else { return splitValue }
                if let replacementID { split[key] = .string(replacementID) }
                else if kind == .category { split[key] = .string("") }
                else { split.removeValue(forKey: key) }
                return .object(split)
            })
        }
    }

    private func setReimbursementAccountFamilies(
        accountID: String,
        name: String,
        familyIDs: Set<UUID>
    ) async throws {
        try await client.rpc(
            "set_reimbursement_account_families",
            params: ReimbursementAccountFamiliesParameters(
                accountID: accountID,
                displayName: name,
                familyIDs: familyIDs.sorted { $0.uuidString < $1.uuidString }
            )
        ).execute()
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

    private func decodeShared<T: Decodable>(
        _ type: T.Type,
        type recordType: String,
        from records: [SharedRecordRow]
    ) -> [T] {
        records
            .filter { $0.recordType == recordType }
            .compactMap { try? $0.data.decode(T.self) }
    }

    private func mergedByID<T: Identifiable>(preferred: [T], additional: [T]) -> [T]
    where T.ID == String {
        let preferredIDs = Set(preferred.map(\.id))
        return preferred + additional.filter { !preferredIDs.contains($0.id) }
    }

    private func sortByName<T>(_ lhs: T, _ rhs: T) -> Bool where T: NamedValue {
        lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
    }

    private static let transactionRecordTypes = ["movement", "reimbursement", "transfer"]
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

    private static func sortMovements(_ lhs: LedgerMovement, _ rhs: LedgerMovement) -> Bool {
        if lhs.date != rhs.date { return lhs.date > rhs.date }
        if lhs.createdAt != rhs.createdAt { return lhs.createdAt > rhs.createdAt }
        return lhs.id < rhs.id
    }
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

private struct DeleteDirectoryParameters: Encodable, Sendable {
    let familyID: UUID
    let recordType: String
    let recordID: String
    let replacementID: String?

    enum CodingKeys: String, CodingKey {
        case familyID = "target_family_id"
        case recordType = "target_record_type"
        case recordID = "target_record_id"
        case replacementID = "replacement_record_id"
    }
}

private struct ReimbursementResponseParameters: Encodable, Sendable {
    let familyID: UUID
    let reimbursementID: String
    let accepted: Bool
    let accountID: String?

    enum CodingKeys: String, CodingKey {
        case familyID = "target_family_id"
        case reimbursementID = "target_reimbursement_id"
        case accepted = "accept_reimbursement"
        case accountID = "selected_account_id"
    }
}

private struct CreateLoanParameters: Encodable, Sendable {
    let familyID: UUID; let loanID: String; let borrowerID: UUID; let amount: Decimal
    let date: String; let description: String; let lenderAccountID: String
    enum CodingKeys: String, CodingKey {
        case familyID = "target_family_id"; case loanID = "target_loan_id"
        case borrowerID = "target_borrower_id"; case amount = "target_amount"
        case date = "target_date"; case description = "target_description"
        case lenderAccountID = "target_lender_account_id"
    }
}

private struct LoanResponseParameters: Encodable, Sendable {
    let familyID: UUID; let loanID: String; let accepted: Bool; let accountID: String?
    enum CodingKeys: String, CodingKey {
        case familyID = "target_family_id"; case loanID = "target_loan_id"
        case accepted = "accept_loan"; case accountID = "selected_account_id"
    }
}

private struct CreateLoanRepaymentParameters: Encodable, Sendable {
    let familyID: UUID; let repaymentID: String; let loanID: String; let amount: Decimal
    let date: String; let description: String; let method: String
    let fromAccountID: String?; let payerMovementID: String?
    enum CodingKeys: String, CodingKey {
        case familyID = "target_family_id"; case repaymentID = "target_repayment_id"
        case loanID = "target_loan_id"; case amount = "target_amount"; case date = "target_date"
        case description = "target_description"; case method = "target_method"
        case fromAccountID = "target_from_account_id"; case payerMovementID = "target_payer_movement_id"
    }
}

private struct LoanRepaymentResponseParameters: Encodable, Sendable {
    let familyID: UUID; let repaymentID: String; let accepted: Bool
    let accountID: String?; let categoryID: String?; let recipientMovementID: String?
    enum CodingKeys: String, CodingKey {
        case familyID = "target_family_id"; case repaymentID = "target_repayment_id"
        case accepted = "accept_repayment"; case accountID = "selected_account_id"
        case categoryID = "selected_category_id"; case recipientMovementID = "target_recipient_movement_id"
    }
}

enum LedgerRepositoryError: LocalizedError {
    case familyRequired
    case accountNameRequired
    case invalidAccountID
    case directoryNameRequired
    case invalidTransferAmount
    case invalidTransferAccounts
    case transferFamilyMismatch

    var errorDescription: String? {
        switch self {
        case .familyRequired:
            "Seleziona una famiglia prima di registrare un elemento condiviso."
        case .accountNameRequired:
            "Inserisci il nome del conto."
        case .invalidAccountID:
            "Il conto condiviso non ha un identificativo valido."
        case .directoryNameRequired:
            "Inserisci il nome dell’elemento."
        case .invalidTransferAmount:
            "Inserisci un importo maggiore di zero."
        case .invalidTransferAccounts:
            "Scegli due conti diversi."
        case .transferFamilyMismatch:
            "I conti familiari devono appartenere allo spazio attivo."
        }
    }
}

private struct ReimbursementAccountFamiliesParameters: Encodable, Sendable {
    let accountID: String
    let displayName: String
    let familyIDs: [UUID]

    enum CodingKeys: String, CodingKey {
        case accountID = "target_account_id"
        case displayName = "target_display_name"
        case familyIDs = "target_family_ids"
    }
}

private struct SharedAccountInsert: Encodable, Sendable {
    let id: UUID
    let familyID: UUID
    let name: String
    let institution: String
    let accountType: AccountSummary.Kind
    let scope = "family"
    let openingBalance: Decimal
    let openingBalanceDate: String
    let createdBy: UUID

    enum CodingKeys: String, CodingKey {
        case id
        case familyID = "family_id"
        case name, institution
        case accountType = "account_type"
        case scope
        case openingBalance = "opening_balance"
        case openingBalanceDate = "opening_balance_date"
        case createdBy = "created_by"
    }
}

private struct SharedAccountUpdate: Encodable, Sendable {
    let name: String
    let institution: String
    let accountType: AccountSummary.Kind
    let openingBalance: Decimal
    let openingBalanceDate: String

    enum CodingKeys: String, CodingKey {
        case name, institution
        case accountType = "account_type"
        case openingBalance = "opening_balance"
        case openingBalanceDate = "opening_balance_date"
    }
}

private struct ResolvedMovementSplit: Sendable {
    let id: String
    let amount: Money
    let category: LedgerDirectoryItem
    let beneficiary: LedgerDirectoryItem?
    let tag: LedgerDirectoryItem?
    let shared: Bool
    let commissionedPurchaseID: String?
    let excludeFromReports: Bool
}
