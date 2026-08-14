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

        if familyIDs.isEmpty {
            families = []
            allMemberships = []
            sharedAccountRows = []
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

            (families, allMemberships, sharedAccountRows) = try await (
                familiesRequest,
                membershipsRequest,
                sharedAccountsRequest
            )
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
            personalAccounts: personalAccounts,
            sharedAccounts: sharedAccounts
        )
    }
}
