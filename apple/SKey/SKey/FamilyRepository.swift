import Foundation
import Supabase

protocol FamilyRepository: Sendable {
    func loadWorkspace(userID: UUID) async throws -> FamilyWorkspace
    func inviteContact(email: String) async throws -> UUID
    func removeContact(id: UUID) async throws
    func createCommissionedPurchase(_ draft: CommissionedPurchaseDraft) async throws
    func respondToCommissionedPurchase(_ response: CommissionedPurchaseResponse) async throws
}

struct SupabaseFamilyRepository: FamilyRepository {
    let client: SupabaseClient

    func loadWorkspace(userID: UUID) async throws -> FamilyWorkspace {
        async let profileRequest: UserProfile = client
            .from("profiles")
            .select("id, first_name, last_name, full_name, email")
            .eq("id", value: userID)
            .single()
            .execute()
            .value

        async let personalDataRequest: PersonalAppDataRow? = client
            .from("user_app_data")
            .select("data")
            .eq("user_id", value: userID)
            .maybeSingle()
            .execute()
            .value

        let ownMemberships: [FamilyMembershipRow] = try await client
            .from("family_members")
            .select("family_id, user_id, role")
            .eq("user_id", value: userID)
            .execute()
            .value

        let familyIDs = ownMemberships.map(\.familyID)
        let families: [FamilyRow]
        let allMemberships: [FamilyMembershipRow]
        let sharedAccountRows: [SharedAccountRow]
        let invitationRows: [FamilyInvitationRow]
        let reimbursementRows: [ReimbursementAccountRow]

        if familyIDs.isEmpty {
            families = []
            allMemberships = []
            sharedAccountRows = []
            invitationRows = []
            reimbursementRows = []
        } else {
            async let familiesRequest: [FamilyRow] = client
                .from("families")
                .select("id, name")
                .in("id", values: familyIDs)
                .execute()
                .value

            async let membershipsRequest: [FamilyMembershipRow] = client
                .from("family_members")
                .select("family_id, user_id, role")
                .in("family_id", values: familyIDs)
                .execute()
                .value

            async let sharedAccountsRequest: [SharedAccountRow] = client
                .from("accounts")
                .select("id, family_id, name, institution, account_type, opening_balance, opening_balance_date")
                .in("family_id", values: familyIDs)
                .eq("scope", value: "family")
                .execute()
                .value

            async let invitationsRequest: [FamilyInvitationRow] = client
                .from("family_invitations")
                .select("id, family_id, email, expires_at, accepted_at, declined_at")
                .in("family_id", values: familyIDs)
                .is("accepted_at", value: nil)
                .execute()
                .value

            async let reimbursementRequest: [ReimbursementAccountRow] = client
                .from("family_reimbursement_accounts")
                .select("family_id, owner_id, account_id, display_name")
                .in("family_id", values: familyIDs)
                .execute()
                .value

            (families, allMemberships, sharedAccountRows, invitationRows, reimbursementRows) = try await (
                familiesRequest,
                membershipsRequest,
                sharedAccountsRequest,
                invitationsRequest,
                reimbursementRequest
            )
        }

        let memberIDs = Array(Set(allMemberships.map(\.userID)))
        let memberProfiles: [FamilyMemberProfileRow]
        if memberIDs.isEmpty {
            memberProfiles = []
        } else {
            memberProfiles = try await client
                .from("profiles")
                .select("id, first_name, last_name, full_name, email")
                .in("id", values: memberIDs)
                .execute()
                .value
        }

        let (profile, personalData) = try await (profileRequest, personalDataRequest)
        // Il backend e i client possono essere aggiornati in momenti diversi:
        // un errore del modulo Contatti non deve bloccare il workspace contabile.
        let contactModule = await loadContactModule(userID: userID)
        let familyByID = Dictionary(uniqueKeysWithValues: families.map { ($0.id, $0) })
        let memberCountByFamily = Dictionary(
            grouping: allMemberships,
            by: \.familyID
        ).mapValues(\.count)

        let summaries = ownMemberships.compactMap { membership -> FamilySummary? in
            guard let family = familyByID[membership.familyID] else { return nil }

            return FamilySummary(
                id: family.id,
                name: family.name,
                role: membership.role,
                memberCount: memberCountByFamily[family.id, default: 1]
            )
        }
        .sorted {
            $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }

        var memberProfileByID = Dictionary(uniqueKeysWithValues: memberProfiles.map { ($0.id, $0) })
        memberProfileByID[profile.id] = FamilyMemberProfileRow(
            id: profile.id,
            firstName: profile.firstName,
            lastName: profile.lastName,
            fullName: profile.fullName,
            email: profile.email
        )
        let memberSummaries: [FamilyMemberSummary] = allMemberships.map { membership in
            let member = memberProfileByID[membership.userID]
            return FamilyMemberSummary(
                id: membership.userID,
                familyID: membership.familyID,
                displayName: member?.displayName ?? "Membro",
                email: member?.email
            )
        }
        .sorted(by: { lhs, rhs in
            lhs.displayName.localizedCaseInsensitiveCompare(rhs.displayName) == .orderedAscending
        })

        let personalAccounts = (personalData?.data?.accounts ?? [])
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
            .sorted {
                $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
            }

        let sharedAccounts = sharedAccountRows
            .map {
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
            .sorted {
                $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
            }

        return FamilyWorkspace(
            profile: profile,
            families: summaries,
            members: memberSummaries,
            invitations: invitationRows.map {
                FamilyInvitationSummary(
                    id: $0.id,
                    familyID: $0.familyID,
                    email: $0.email,
                    expiresAt: $0.expiresAt,
                    status: $0.declinedAt != nil ? .declined : ($0.expiresAt <= Date() ? .expired : .pending)
                )
            },
            reimbursementAccounts: reimbursementRows.map {
                ReimbursementAccountReference(
                    familyID: $0.familyID,
                    ownerID: $0.ownerID,
                    accountID: $0.accountID,
                    name: $0.displayName
                )
            },
            contacts: contactModule.friendProfiles.map {
                ContactSummary(id: $0.id, displayName: $0.displayName, email: $0.email, source: .friend, familyNames: [])
            },
            contactInvitations: contactModule.invitations.compactMap {
                guard $0.acceptedAt == nil, $0.declinedAt == nil, $0.expiresAt > Date() else { return nil }
                return ContactInvitationSummary(id: $0.id, email: $0.email, expiresAt: $0.expiresAt)
            },
            commissionedPurchases: contactModule.purchases.map {
                CommissionedPurchaseSummary(
                    id: $0.id, payerID: $0.payerID, recipientID: $0.recipientID,
                    invitationID: $0.invitationID, familyID: $0.familyID,
                    reimbursementID: $0.reimbursementID, payerMovementID: $0.payerMovementID,
                    amount: Money(decimal: $0.amount), purchaseDate: $0.purchaseDate,
                    description: $0.description, status: $0.status,
                    recipientMovementID: $0.recipientMovementID
                )
            },
            personalAccounts: personalAccounts,
            sharedAccounts: sharedAccounts
        )
    }

    private func loadContactModule(userID: UUID) async -> ContactModuleData {
        do {
            async let linksRequest: [ContactLinkRow] = client.from("contact_links")
                .select("user_id_a, user_id_b")
                .or("user_id_a.eq.\(userID.uuidString),user_id_b.eq.\(userID.uuidString)")
                .execute().value
            async let invitationsRequest: [ContactInvitationRow] = client.from("contact_invitations")
                .select("id, email, expires_at, accepted_at, declined_at")
                .eq("invited_by", value: userID).is("accepted_at", value: nil)
                .execute().value
            async let purchasesRequest: [CommissionedPurchaseRow] = client.from("commissioned_purchases")
                .select("id, payer_id, recipient_id, invitation_id, family_id, reimbursement_id, payer_movement_id, amount, purchase_date, description, status, recipient_movement_id")
                .or("payer_id.eq.\(userID.uuidString),recipient_id.eq.\(userID.uuidString)")
                .order("created_at", ascending: false)
                .execute().value

            let (links, invitations, purchases) = try await (
                linksRequest, invitationsRequest, purchasesRequest
            )
            let friendIDs = links.map { $0.userIDA == userID ? $0.userIDB : $0.userIDA }
            let friendProfiles: [FamilyMemberProfileRow] = friendIDs.isEmpty ? [] : try await client
                .from("profiles").select("id, first_name, last_name, full_name, email")
                .in("id", values: friendIDs).execute().value
            return ContactModuleData(
                friendProfiles: friendProfiles,
                invitations: invitations,
                purchases: purchases
            )
        } catch {
            return .empty
        }
    }

    func inviteContact(email: String) async throws -> UUID {
        let response: ContactInvitationFunctionResponse = try await client.functions.invoke("invite-contact", options: FunctionInvokeOptions(
            body: ContactInvitationRequest(email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
        ))
        return response.invitation.id
    }

    func removeContact(id: UUID) async throws {
        try await client.rpc("remove_contact", params: RemoveContactParameters(contactID: id)).execute()
    }

    func createCommissionedPurchase(_ draft: CommissionedPurchaseDraft) async throws {
        try await client.rpc("create_commissioned_purchase", params: CreateCommissionedPurchaseParameters(draft: draft)).execute()
    }

    func respondToCommissionedPurchase(_ response: CommissionedPurchaseResponse) async throws {
        try await client.rpc("respond_to_commissioned_purchase", params: RespondCommissionedPurchaseParameters(response: response)).execute()
    }
}

private struct ContactModuleData: Sendable {
    let friendProfiles: [FamilyMemberProfileRow]
    let invitations: [ContactInvitationRow]
    let purchases: [CommissionedPurchaseRow]

    static let empty = ContactModuleData(friendProfiles: [], invitations: [], purchases: [])
}

private struct ContactInvitationRequest: Encodable, Sendable { let email: String }
private struct ContactInvitationFunctionResponse: Decodable, Sendable {
    let invitation: ContactInvitationFunctionResult
}
private struct ContactInvitationFunctionResult: Decodable, Sendable { let id: UUID }
private struct RemoveContactParameters: Encodable, Sendable {
    let contactID: UUID
    enum CodingKeys: String, CodingKey { case contactID = "target_contact_id" }
}
private struct CreateCommissionedPurchaseParameters: Encodable, Sendable {
    let purchaseID: String; let recipientID: UUID?; let invitationID: UUID?; let familyID: UUID?
    let reimbursementID: String?; let payerMovementID: String; let amount: Decimal; let purchaseDate: String; let description: String
    init(draft: CommissionedPurchaseDraft) {
        purchaseID = draft.id; recipientID = draft.recipientID; invitationID = draft.invitationID; familyID = draft.familyID
        reimbursementID = draft.reimbursementID; payerMovementID = draft.payerMovementID; amount = draft.amount
        purchaseDate = draft.purchaseDate; description = draft.description
    }
    enum CodingKeys: String, CodingKey {
        case purchaseID = "purchase_id"; case recipientID = "target_recipient_id"; case invitationID = "target_invitation_id"
        case familyID = "target_family_id"; case reimbursementID = "target_reimbursement_id"; case payerMovementID = "target_payer_movement_id"
        case amount = "purchase_amount"; case purchaseDate = "target_purchase_date"; case description = "purchase_description"
    }
}
private struct RespondCommissionedPurchaseParameters: Encodable, Sendable {
    let purchaseID: String; let accepted: Bool; let movementID: String?; let categoryID: String?; let accountID: String?
    init(response: CommissionedPurchaseResponse) {
        purchaseID = response.id; accepted = response.accepted; movementID = response.movementID
        categoryID = response.categoryID; accountID = response.accountID
    }
    enum CodingKeys: String, CodingKey {
        case purchaseID = "target_purchase_id"; case accepted = "accept_purchase"
        case movementID = "target_recipient_movement_id"; case categoryID = "target_category_id"; case accountID = "target_account_id"
    }
}

private struct FamilyMemberProfileRow: Decodable, Sendable {
    let id: UUID
    let firstName: String?
    let lastName: String?
    let fullName: String
    let email: String?

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
