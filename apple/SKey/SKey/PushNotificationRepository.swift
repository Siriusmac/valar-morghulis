import Foundation
import Functions
import Supabase

nonisolated struct PushDeviceRegistration: Equatable, Sendable {
    let token: String
    let platform: String
    let environment: String
    let bundleID: String
}

nonisolated struct ReimbursementPushResult: Decodable, Equatable, Sendable {
    let attempted: Int
    let sent: Int
    let failed: Int
    let skipped: Int
}

protocol PushNotificationRepository: Sendable {
    func register(_ device: PushDeviceRegistration) async throws
    func unregister(token: String) async throws
    func notifyReimbursement(familyID: UUID, reimbursementID: String) async throws -> ReimbursementPushResult
}

struct SupabasePushNotificationRepository: PushNotificationRepository {
    let client: SupabaseClient

    func register(_ device: PushDeviceRegistration) async throws {
        try await client.rpc(
            "register_my_push_device",
            params: RegisterPushDeviceParameters(device: device)
        ).execute()
    }

    func unregister(token: String) async throws {
        try await client.rpc(
            "unregister_my_push_device",
            params: UnregisterPushDeviceParameters(deviceToken: token)
        ).execute()
    }

    func notifyReimbursement(familyID: UUID, reimbursementID: String) async throws -> ReimbursementPushResult {
        try await client.functions.invoke(
            "notify-family-reimbursement",
            options: FunctionInvokeOptions(
                body: ReimbursementPushRequest(familyID: familyID, reimbursementID: reimbursementID)
            )
        )
    }
}

private struct RegisterPushDeviceParameters: Encodable, Sendable {
    let deviceToken: String
    let devicePlatform: String
    let apnsEnvironment: String
    let appBundleID: String

    init(device: PushDeviceRegistration) {
        deviceToken = device.token
        devicePlatform = device.platform
        apnsEnvironment = device.environment
        appBundleID = device.bundleID
    }

    enum CodingKeys: String, CodingKey {
        case deviceToken = "device_token"
        case devicePlatform = "device_platform"
        case apnsEnvironment = "apns_environment"
        case appBundleID = "app_bundle_id"
    }
}

private struct UnregisterPushDeviceParameters: Encodable, Sendable {
    let deviceToken: String
    enum CodingKeys: String, CodingKey { case deviceToken = "device_token" }
}

private struct ReimbursementPushRequest: Encodable, Sendable {
    let familyID: UUID
    let reimbursementID: String
    enum CodingKeys: String, CodingKey {
        case familyID = "familyId"
        case reimbursementID = "reimbursementId"
    }
}
