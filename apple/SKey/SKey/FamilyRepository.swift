import Foundation
import Supabase

protocol FamilyRepository: Sendable {
    func loadWorkspace(userID: UUID) async throws -> FamilyWorkspace
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
            personalAccounts: personalAccounts,
            sharedAccounts: sharedAccounts
        )
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
