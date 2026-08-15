import Auth
import Foundation
import Observation
import Supabase

@MainActor
@Observable
final class AppModel {
    enum ReimbursementSubmissionResult: Equatable {
        case notificationSent
        case noRegisteredDevices
        case notificationFailed
    }

    enum SessionState: Equatable {
        case loading
        case signedOut
        case signedIn(email: String?)
        case configurationError(String)
    }

    enum WorkspaceState: Equatable {
        case idle
        case loading
        case loaded(FamilyWorkspace)
        case failed(String)
    }

    enum LedgerState: Equatable {
        case idle
        case loading
        case loaded(LedgerSnapshot)
        case failed(String)
    }

    private(set) var sessionState: SessionState
    private(set) var workspaceState: WorkspaceState
    private(set) var ledgerState: LedgerState
    private(set) var selectedFamilyID: UUID?
    private(set) var pendingReimbursementRoute: PushReimbursementRoute?

    @ObservationIgnored
    private let supabase: SupabaseClient?

    @ObservationIgnored
    private let familyRepository: (any FamilyRepository)?

    @ObservationIgnored
    private let accountRepository: (any AccountRepository)?

    @ObservationIgnored
    private let ledgerRepository: (any LedgerRepository)?

    @ObservationIgnored
    private let pushNotificationRepository: (any PushNotificationRepository)?

    @ObservationIgnored
    private let userDefaults: UserDefaults

    @ObservationIgnored
    private var currentUserID: UUID?

    @ObservationIgnored
    private var authObservationTask: Task<Void, Never>?

    @ObservationIgnored
    private var pushTokenObservation: NSObjectProtocol?

    @ObservationIgnored
    private var pushRouteObservation: NSObjectProtocol?

    init(bundle: Bundle = .main, userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
        workspaceState = .idle
        ledgerState = .idle
        selectedFamilyID = nil
        pendingReimbursementRoute = nil

        do {
            let configuration = try AppConfiguration(bundle: bundle)
            let client = SupabaseClient(
                supabaseURL: configuration.supabaseURL,
                supabaseKey: configuration.supabasePublishableKey
            )

            supabase = client
            familyRepository = SupabaseFamilyRepository(client: client)
            accountRepository = SupabaseAccountRepository(client: client)
            ledgerRepository = SupabaseLedgerRepository(client: client)
            pushNotificationRepository = SupabasePushNotificationRepository(client: client)
            sessionState = .loading
            observeAuthentication(using: client)
            observePushTokens()
        } catch {
            supabase = nil
            familyRepository = nil
            accountRepository = nil
            ledgerRepository = nil
            pushNotificationRepository = nil
            sessionState = .configurationError(error.localizedDescription)
        }
    }

    init(
        previewState: SessionState,
        workspaceState: WorkspaceState = .idle,
        ledgerState: LedgerState = .idle,
        selectedFamilyID: UUID? = nil
    ) {
        supabase = nil
        familyRepository = nil
        accountRepository = nil
        ledgerRepository = nil
        pushNotificationRepository = nil
        userDefaults = UserDefaults(suiteName: "skey.preview") ?? .standard
        sessionState = previewState
        self.workspaceState = workspaceState
        self.ledgerState = ledgerState
        self.selectedFamilyID = selectedFamilyID
        pendingReimbursementRoute = nil
    }

    deinit {
        authObservationTask?.cancel()
        if let pushTokenObservation {
            NotificationCenter.default.removeObserver(pushTokenObservation)
        }
        if let pushRouteObservation {
            NotificationCenter.default.removeObserver(pushRouteObservation)
        }
    }

    var activeFamily: FamilySummary? {
        guard
            case .loaded(let workspace) = workspaceState,
            let selectedFamilyID
        else {
            return nil
        }

        return workspace.families.first { $0.id == selectedFamilyID }
    }

    func signIn(email: String, password: String) async throws {
        guard let supabase else {
            throw AppModelError.clientUnavailable
        }

        let session = try await supabase.auth.signIn(
            email: email.trimmingCharacters(in: .whitespacesAndNewlines),
            password: password
        )
        await apply(session: session)
    }

    func signOut() async throws {
        guard let supabase else {
            throw AppModelError.clientUnavailable
        }

        if let device = PushNotificationCoordinator.shared.currentDevice {
            try? await pushNotificationRepository?.unregister(token: device.token)
        }
        PushNotificationCoordinator.shared.stopRemoteNotifications()
        try await supabase.auth.signOut()
        resetSignedOutState()
    }

    func reloadWorkspace() async {
        guard let currentUserID, let familyRepository else { return }

        workspaceState = .loading

        do {
            let workspace = try await familyRepository.loadWorkspace(userID: currentUserID)
            restoreFamilySelection(for: workspace, userID: currentUserID)
            workspaceState = .loaded(workspace)
            await reloadLedger()
        } catch is CancellationError {
            return
        } catch {
            workspaceState = .failed(
                "Non è stato possibile caricare il tuo spazio. Controlla la connessione e riprova."
            )
        }
    }

    func selectFamily(_ familyID: UUID?) {
        guard case .loaded(let workspace) = workspaceState else { return }
        guard familyID == nil || workspace.families.contains(where: { $0.id == familyID }) else {
            return
        }

        selectedFamilyID = familyID

        guard let currentUserID else { return }
        userDefaults.set(
            familyID?.uuidString ?? Self.personalWorkspaceValue,
            forKey: Self.activeFamilyKey(userID: currentUserID)
        )

        Task { await reloadLedger() }
    }

    func reloadLedger() async {
        guard
            let currentUserID,
            let ledgerRepository,
            case .loaded(let workspace) = workspaceState
        else {
            return
        }

        let requestedFamilyID = selectedFamilyID
        let memberCount = requestedFamilyID.flatMap { familyID in
            workspace.families.first { $0.id == familyID }?.memberCount
        } ?? 1
        ledgerState = .loading

        do {
            let snapshot = try await ledgerRepository.loadLedgerSnapshot(
                userID: currentUserID,
                familyID: requestedFamilyID,
                memberCount: memberCount
            )
            guard requestedFamilyID == selectedFamilyID else { return }
            ledgerState = .loaded(snapshot)
        } catch is CancellationError {
            return
        } catch {
            guard requestedFamilyID == selectedFamilyID else { return }
            ledgerState = .failed(
                "Non è stato possibile caricare movimenti e saldi. Controlla la connessione e riprova."
            )
        }
    }

    func loadMovementOptions() async throws -> MovementOptions {
        guard let currentUserID, let ledgerRepository else {
            throw AppModelError.clientUnavailable
        }

        return try await ledgerRepository.loadMovementOptions(
            userID: currentUserID,
            familyID: selectedFamilyID
        )
    }

    func createMovement(_ draft: MovementDraft) async throws {
        guard let currentUserID, let ledgerRepository else {
            throw AppModelError.clientUnavailable
        }
        guard case .loaded(let workspace) = workspaceState else {
            throw AppModelError.workspaceUnavailable
        }

        try await ledgerRepository.createMovement(
            draft,
            userID: currentUserID,
            userDisplayName: workspace.profile.displayName,
            familyID: selectedFamilyID
        )
        await reloadWorkspace()
    }

    func canModify(_ movement: LedgerMovement) -> Bool {
        guard let currentUserID else { return false }
        return movement.authorID.caseInsensitiveCompare(currentUserID.uuidString) == .orderedSame
    }

    func updateMovement(_ draft: MovementDraft) async throws {
        try await createMovement(draft)
    }

    func deleteMovement(_ movement: LedgerMovement) async throws {
        guard canModify(movement), let currentUserID, let ledgerRepository else {
            throw AppModelError.movementNotOwned
        }
        let isShared = movement.shared || (movement.splits?.contains { $0.shared } ?? false)
        try await ledgerRepository.deleteMovement(
            id: movement.id,
            shared: isShared,
            userID: currentUserID,
            familyID: selectedFamilyID
        )
        await reloadWorkspace()
    }

    func createReimbursement(_ draft: ReimbursementDraft) async throws -> ReimbursementSubmissionResult {
        try await createReimbursements([draft])
    }

    func createReimbursements(_ drafts: [ReimbursementDraft]) async throws -> ReimbursementSubmissionResult {
        guard let familyID = selectedFamilyID else { throw AppModelError.familyRequired }
        guard let currentUserID, let ledgerRepository else { throw AppModelError.clientUnavailable }
        guard !drafts.isEmpty else { return .noRegisteredDevices }
        var sentAnyNotification = false
        var missingDevicesOnly = true
        var notificationFailed = false

        for draft in drafts {
            let reimbursementID = try await ledgerRepository.createReimbursement(
                draft,
                userID: currentUserID,
                familyID: familyID
            )
            do {
                guard let pushNotificationRepository else {
                    notificationFailed = true
                    continue
                }
                let delivery = try await pushNotificationRepository.notifyReimbursement(
                    familyID: familyID,
                    reimbursementID: reimbursementID
                )
                if delivery.failed > 0 {
                    notificationFailed = true
                    missingDevicesOnly = false
                } else if delivery.attempted > 0 {
                    sentAnyNotification = true
                    missingDevicesOnly = false
                }
            } catch {
                notificationFailed = true
                missingDevicesOnly = false
            }
        }
        await reloadWorkspace()
        if notificationFailed { return .notificationFailed }
        if sentAnyNotification { return .notificationSent }
        return missingDevicesOnly ? .noRegisteredDevices : .notificationFailed
    }

    func respondToReimbursement(_ reimbursement: LedgerReimbursement, accepted: Bool, accountID: String?) async throws {
        guard let familyID = selectedFamilyID else { throw AppModelError.familyRequired }
        guard let ledgerRepository else { throw AppModelError.clientUnavailable }
        try await ledgerRepository.respondToReimbursement(
            id: reimbursement.id,
            accepted: accepted,
            accountID: accountID,
            familyID: familyID
        )
        await reloadWorkspace()
    }

    func updateProfile(firstName: String, lastName: String) async throws {
        guard let currentUserID, let accountRepository else { throw AppModelError.clientUnavailable }
        try await accountRepository.updateProfile(userID: currentUserID, firstName: firstName, lastName: lastName)
        await reloadWorkspace()
    }

    func updateEmail(_ email: String) async throws {
        guard let accountRepository else { throw AppModelError.clientUnavailable }
        try await accountRepository.updateEmail(email)
        sessionState = .signedIn(email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
    }

    func updatePassword(_ password: String) async throws {
        guard let accountRepository else { throw AppModelError.clientUnavailable }
        try await accountRepository.updatePassword(password)
    }

    func createFamily(_ draft: CreateFamilyDraft) async throws {
        guard let accountRepository else { throw AppModelError.clientUnavailable }
        let familyID = try await accountRepository.createFamily(draft)
        selectedFamilyID = familyID
        if let currentUserID {
            userDefaults.set(familyID.uuidString, forKey: Self.activeFamilyKey(userID: currentUserID))
        }
        await reloadWorkspace()
    }

    func renameActiveFamily(_ name: String) async throws {
        guard let familyID = selectedFamilyID, let accountRepository else { throw AppModelError.familyRequired }
        try await accountRepository.renameFamily(familyID, name: name)
        await reloadWorkspace()
    }

    func inviteMember(_ email: String) async throws {
        guard let familyID = selectedFamilyID, let accountRepository else { throw AppModelError.familyRequired }
        try await accountRepository.inviteMember(familyID: familyID, email: email)
        await reloadWorkspace()
    }

    func deleteInvitation(_ invitationID: UUID) async throws {
        guard let accountRepository else { throw AppModelError.clientUnavailable }
        try await accountRepository.deleteInvitation(invitationID)
        await reloadWorkspace()
    }

    func deleteActiveFamily(preservingAuthoredData: Bool) async throws {
        guard let familyID = selectedFamilyID, let accountRepository else { throw AppModelError.familyRequired }
        try await accountRepository.deleteFamily(familyID, preservingAuthoredData: preservingAuthoredData)
        selectedFamilyID = nil
        if let currentUserID {
            userDefaults.set(Self.personalWorkspaceValue, forKey: Self.activeFamilyKey(userID: currentUserID))
        }
        await reloadWorkspace()
    }

    func deleteAccount() async throws {
        guard let accountRepository else { throw AppModelError.clientUnavailable }
        try await accountRepository.deleteAccount()
        PushNotificationCoordinator.shared.stopRemoteNotifications()
        resetSignedOutState()
    }

    func exportAccountData() async throws -> Data {
        guard let currentUserID, let accountRepository else { throw AppModelError.clientUnavailable }
        guard case .loaded(let workspace) = workspaceState else { throw AppModelError.workspaceUnavailable }
        return try await accountRepository.exportAccountData(
            userID: currentUserID,
            profile: workspace.profile,
            families: workspace.families
        )
    }

    static func userFacingMessage(for error: Error) -> String {
        if let authError = error as? AuthError,
           authError.errorCode == .invalidCredentials {
            return "Email o password non corrette."
        }

        return "Non è stato possibile accedere. Controlla la connessione e riprova."
    }

    private func observeAuthentication(using client: SupabaseClient) {
        let authStateChanges = client.auth.authStateChanges

        authObservationTask = Task { [weak self] in
            for await (_, session) in authStateChanges {
                guard !Task.isCancelled else { return }
                await self?.apply(session: session)
            }
        }
    }

    private func observePushTokens() {
        pushTokenObservation = NotificationCenter.default.addObserver(
            forName: .sKeyDidReceivePushToken,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let device = notification.object as? PushDeviceRegistration else { return }
            Task { @MainActor [weak self] in
                guard let self, self.currentUserID != nil else { return }
                try? await self.pushNotificationRepository?.register(device)
            }
        }
        pushRouteObservation = NotificationCenter.default.addObserver(
            forName: .sKeyDidOpenReimbursement,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let route = notification.object as? PushReimbursementRoute else { return }
            Task { @MainActor [weak self] in await self?.openPushRoute(route) }
        }
    }

    func clearPendingReimbursementRoute() {
        pendingReimbursementRoute = nil
    }

    private func openPushRoute(_ route: PushReimbursementRoute) async {
        pendingReimbursementRoute = route
        guard currentUserID != nil else { return }
        if case .loaded(let workspace) = workspaceState,
           workspace.families.contains(where: { $0.id == route.familyID }) {
            selectedFamilyID = route.familyID
            if let currentUserID {
                userDefaults.set(route.familyID.uuidString, forKey: Self.activeFamilyKey(userID: currentUserID))
            }
            await reloadWorkspace()
        }
    }

    private func apply(session: Session?) async {
        guard let session else {
            resetSignedOutState()
            return
        }

        let userID = session.user.id
        let needsWorkspaceLoad = currentUserID != userID || workspaceState == .idle

        currentUserID = userID
        sessionState = .signedIn(email: session.user.email)

        if needsWorkspaceLoad {
            await reloadWorkspace()
        }
        PushNotificationCoordinator.shared.requestAuthorizationAndRegister()
        if let route = PushNotificationCoordinator.shared.consumePendingRoute() {
            await openPushRoute(route)
        } else if let pendingReimbursementRoute {
            await openPushRoute(pendingReimbursementRoute)
        }
    }

    private func resetSignedOutState() {
        currentUserID = nil
        selectedFamilyID = nil
        workspaceState = .idle
        ledgerState = .idle
        pendingReimbursementRoute = nil
        sessionState = .signedOut
    }

    private func restoreFamilySelection(for workspace: FamilyWorkspace, userID: UUID) {
        let storedValue = userDefaults.string(forKey: Self.activeFamilyKey(userID: userID))

        if storedValue == Self.personalWorkspaceValue {
            selectedFamilyID = nil
            return
        }

        if
            let storedValue,
            let storedFamilyID = UUID(uuidString: storedValue),
            workspace.families.contains(where: { $0.id == storedFamilyID })
        {
            selectedFamilyID = storedFamilyID
            return
        }

        selectedFamilyID = workspace.families.first?.id
    }

    private static func activeFamilyKey(userID: UUID) -> String {
        "skey.active-family.\(userID.uuidString)"
    }

    private static let personalWorkspaceValue = "personal"
}

enum AppModelError: LocalizedError {
    case clientUnavailable
    case workspaceUnavailable
    case familyRequired
    case movementNotOwned

    var errorDescription: String? {
        switch self {
        case .clientUnavailable: "Il servizio non è ancora disponibile."
        case .workspaceUnavailable: "Attendi il caricamento dei dati e riprova."
        case .familyRequired: "Seleziona prima una famiglia."
        case .movementNotOwned: "Puoi modificare o eliminare soltanto i movimenti registrati da te."
        }
    }
}
