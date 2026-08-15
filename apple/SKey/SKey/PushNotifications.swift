import Foundation
import UserNotifications

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

extension Notification.Name {
    static let sKeyDidReceivePushToken = Notification.Name("sKey.didReceivePushToken")
    static let sKeyDidOpenReimbursement = Notification.Name("sKey.didOpenReimbursement")
}

nonisolated struct PushReimbursementRoute: Identifiable, Equatable, Sendable {
    let familyID: UUID
    let reimbursementID: String
    var id: String { "\(familyID.uuidString):\(reimbursementID)" }
}

@MainActor
final class PushNotificationCoordinator: NSObject, UNUserNotificationCenterDelegate {
    static let shared = PushNotificationCoordinator()

    private(set) var currentDevice: PushDeviceRegistration?
    private(set) var pendingReimbursementRoute: PushReimbursementRoute?
    private var hasRequestedRegistration = false

    func requestAuthorizationAndRegister() {
        guard !hasRequestedRegistration else { return }
        hasRequestedRegistration = true
        Task {
            do {
                let granted = try await UNUserNotificationCenter.current().requestAuthorization(
                    options: [.alert, .sound, .badge]
                )
                guard granted else { return }
                #if os(iOS)
                UIApplication.shared.registerForRemoteNotifications()
                #elseif os(macOS)
                NSApplication.shared.registerForRemoteNotifications()
                #endif
            } catch {
                // Il rifiuto o un errore del sistema non deve bloccare l'accesso ai dati.
            }
        }
    }

    func stopRemoteNotifications() {
        #if os(iOS)
        UIApplication.shared.unregisterForRemoteNotifications()
        #elseif os(macOS)
        NSApplication.shared.unregisterForRemoteNotifications()
        #endif
        currentDevice = nil
        hasRequestedRegistration = false
    }

    func receive(deviceToken: Data) {
        let registration = PushDeviceRegistration(
            token: Self.hexadecimalToken(from: deviceToken),
            platform: Self.platform,
            environment: Self.environment,
            bundleID: Bundle.main.bundleIdentifier ?? "it.valarmorghulis.skey"
        )
        currentDevice = registration
        NotificationCenter.default.post(name: .sKeyDidReceivePushToken, object: registration)
    }

    func receive(notification userInfo: [AnyHashable: Any]) {
        guard let route = Self.reimbursementRoute(from: userInfo) else { return }
        receive(route: route)
    }

    private func receive(route: PushReimbursementRoute) {
        pendingReimbursementRoute = route
        NotificationCenter.default.post(name: .sKeyDidOpenReimbursement, object: route)
    }

    nonisolated static func reimbursementRoute(from userInfo: [AnyHashable: Any]) -> PushReimbursementRoute? {
        guard
            userInfo["type"] as? String == "reimbursement",
            let familyValue = userInfo["familyId"] as? String,
            let familyID = UUID(uuidString: familyValue),
            let reimbursementID = userInfo["reimbursementId"] as? String
        else { return nil }
        return PushReimbursementRoute(familyID: familyID, reimbursementID: reimbursementID)
    }

    func consumePendingRoute() -> PushReimbursementRoute? {
        defer { pendingReimbursementRoute = nil }
        return pendingReimbursementRoute
    }

    nonisolated static func hexadecimalToken(from data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }

    nonisolated private static var environment: String {
        #if DEBUG
        "development"
        #else
        "production"
        #endif
    }

    nonisolated private static var platform: String {
        #if os(iOS)
        "ios"
        #else
        "macos"
        #endif
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .badge]
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        guard let route = Self.reimbursementRoute(from: response.notification.request.content.userInfo) else { return }
        await MainActor.run { receive(route: route) }
    }
}

#if os(iOS)
final class SKeyAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = PushNotificationCoordinator.shared
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushNotificationCoordinator.shared.receive(deviceToken: deviceToken)
    }
}
#elseif os(macOS)
final class SKeyAppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        UNUserNotificationCenter.current().delegate = PushNotificationCoordinator.shared
    }

    func application(_ application: NSApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushNotificationCoordinator.shared.receive(deviceToken: deviceToken)
    }
}
#endif
