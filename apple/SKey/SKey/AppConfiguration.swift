import Foundation

struct AppConfiguration: Equatable {
    let supabaseURL: URL
    let supabasePublishableKey: String

    init(bundle: Bundle = .main) throws {
        try self.init(infoDictionary: bundle.infoDictionary ?? [:])
    }

    init(infoDictionary: [String: Any]) throws {
        let urlString = try Self.requiredString(named: "SUPABASE_URL", in: infoDictionary)
        let publishableKey = try Self.requiredString(
            named: "SUPABASE_PUBLISHABLE_KEY",
            in: infoDictionary
        )

        guard
            let url = URL(string: urlString),
            url.scheme == "https",
            url.host != nil
        else {
            throw AppConfigurationError.invalidSupabaseURL
        }

        supabaseURL = url
        supabasePublishableKey = publishableKey
    }

    private static func requiredString(
        named key: String,
        in infoDictionary: [String: Any]
    ) throws -> String {
        guard
            let value = infoDictionary[key] as? String,
            !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            !value.contains("$(")
        else {
            throw AppConfigurationError.missingValue(key)
        }

        return value
    }
}

enum AppConfigurationError: LocalizedError, Equatable {
    case missingValue(String)
    case invalidSupabaseURL

    var errorDescription: String? {
        switch self {
        case .missingValue(let key):
            "Configurazione mancante: \(key)."
        case .invalidSupabaseURL:
            "L’indirizzo Supabase configurato non è valido."
        }
    }
}
