import Foundation
import Testing
@testable import SKey

struct SKeyTests {
    @Test
    func loadsValidSupabaseConfiguration() throws {
        let configuration = try AppConfiguration(
            infoDictionary: [
                "SUPABASE_URL": "https://example.supabase.co",
                "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_example"
            ]
        )

        #expect(configuration.supabaseURL.absoluteString == "https://example.supabase.co")
        #expect(configuration.supabasePublishableKey == "sb_publishable_example")
    }

    @Test
    func rejectsMissingPublishableKey() {
        #expect(throws: AppConfigurationError.missingValue("SUPABASE_PUBLISHABLE_KEY")) {
            try AppConfiguration(
                infoDictionary: [
                    "SUPABASE_URL": "https://example.supabase.co"
                ]
            )
        }
    }

    @Test
    func rejectsNonSecureSupabaseURL() {
        #expect(throws: AppConfigurationError.invalidSupabaseURL) {
            try AppConfiguration(
                infoDictionary: [
                    "SUPABASE_URL": "http://example.supabase.co",
                    "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_example"
                ]
            )
        }
    }

    @Test
    func decodesProfileUsingSupabaseColumnNames() throws {
        let data = Data(
            #"{"id":"22222222-2222-2222-2222-222222222222","first_name":"Simone","last_name":"Miotto","full_name":"Simone Miotto","email":"simone@example.com"}"#
                .utf8
        )

        let profile = try JSONDecoder().decode(UserProfile.self, from: data)

        #expect(profile.firstName == "Simone")
        #expect(profile.lastName == "Miotto")
        #expect(profile.displayName == "Simone Miotto")
    }

    @Test
    func fallsBackToFullNameWhenProfilePartsAreMissing() {
        let profile = UserProfile(
            id: UUID(),
            firstName: nil,
            lastName: nil,
            fullName: "Anna",
            email: "anna@example.com"
        )

        #expect(profile.displayName == "Anna")
    }

    @Test
    func decodesPersonalAccountsFromVersionThreeSnapshot() throws {
        let data = Data(
            #"{"data":{"accounts":[{"id":"cash","name":"Contanti","institution":"Portafoglio","type":"cash","scope":"personal","openingBalance":42.50,"openingBalanceDate":"2026-08-01"}]}}"#
                .utf8
        )

        let row = try JSONDecoder().decode(PersonalAppDataRow.self, from: data)
        let account = try #require(row.data?.accounts?.first)

        #expect(account.id == "cash")
        #expect(account.type == .cash)
        #expect(account.openingBalance == Decimal(string: "42.50"))
    }

    @Test
    func decodesSharedAccountDatabaseColumns() throws {
        let data = Data(
            #"{"id":"33333333-3333-3333-3333-333333333333","family_id":"11111111-1111-1111-1111-111111111111","name":"Conto di famiglia","institution":"Cointestato","account_type":"bank","opening_balance":1250,"opening_balance_date":"2026-08-01"}"#
                .utf8
        )

        let account = try JSONDecoder().decode(SharedAccountRow.self, from: data)

        #expect(account.accountType == .bank)
        #expect(account.openingBalance == 1_250)
    }

    @Test
    func exposesEveryNativeDestinationInOneSidebarGroup() {
        let groupedDestinations = AppDestination.Group.allCases.flatMap {
            AppDestination.destinations(in: $0)
        }

        #expect(Set(groupedDestinations) == Set(AppDestination.allCases))
        #expect(groupedDestinations.count == AppDestination.allCases.count)
    }

    @Test
    func preservesUnknownAppDataFieldsThroughJSONValue() throws {
        let original = Data(
            #"{"version":3,"movements":[],"futureFeature":{"enabled":true},"amount":12.45}"#.utf8
        )

        let value = try JSONDecoder().decode(JSONValue.self, from: original)
        let encoded = try JSONEncoder().encode(value)
        let decoded = try JSONDecoder().decode(JSONValue.self, from: encoded)

        #expect(decoded.objectValue?["futureFeature"]?.objectValue?["enabled"] == .bool(true))
        #expect(decoded.objectValue?["amount"] == .number(Decimal(string: "12.45")!))
    }

    @Test
    func createsStableMovementDraftIDForSafeRetries() {
        let account = AccountSummary(
            id: "cash",
            familyID: nil,
            name: "Contanti",
            institution: "Portafoglio",
            kind: .cash,
            openingBalance: 0,
            openingBalanceDate: nil
        )
        let category = LedgerDirectoryItem(
            id: "alimentari",
            name: "Alimentari",
            scope: .personal,
            ownerID: "user",
            movementType: .expense,
            color: "#c64e2f"
        )
        let beneficiary = LedgerDirectoryItem(
            id: "lidl",
            name: "Lidl",
            scope: .personal,
            ownerID: "user",
            movementType: nil,
            color: nil
        )
        let draft = MovementDraft(
            id: "movement-retry",
            type: .expense,
            amount: 30,
            date: Date(timeIntervalSince1970: 0),
            description: "Spesa",
            comments: nil,
            account: account,
            category: category,
            counterparty: beneficiary,
            isShared: false,
            affectsAccountBalance: nil
        )

        #expect(draft.id == "movement-retry")
    }
}
