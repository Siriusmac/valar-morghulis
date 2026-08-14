import Auth
import Foundation
import Observation
import Supabase

@MainActor
@Observable
final class AppModel {
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

    private(set) var sessionState: SessionState
    private(set) var workspaceState: WorkspaceState
    private(set) var selectedFamilyID: UUID?

    @ObservationIgnored
    private let supabase: SupabaseClient?

    @ObservationIgnored
    private let familyRepository: (any FamilyRepository)?

    @ObservationIgnored
    private let ledgerRepository: (any LedgerRepository)?

    @ObservationIgnored
    private let userDefaults: UserDefaults

    @ObservationIgnored
    private var currentUserID: UUID?

    @ObservationIgnored
    private var authObservationTask: Task<Void, Never>?

    init(bundle: Bundle = .main, userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
        workspaceState = .idle
        selectedFamilyID = nil

        do {
            let configuration = try AppConfiguration(bundle: bundle)
            let client = SupabaseClient(
                supabaseURL: configuration.supabaseURL,
                supabaseKey: configuration.supabasePublishableKey
            )

            supabase = client
            familyRepository = SupabaseFamilyRepository(client: client)
            ledgerRepository = SupabaseLedgerRepository(client: client)
            sessionState = .loading
            observeAuthentication(using: client)
        } catch {
            supabase = nil
            familyRepository = nil
            ledgerRepository = nil
            sessionState = .configurationError(error.localizedDescription)
        }
    }

    init(
        previewState: SessionState,
        workspaceState: WorkspaceState = .idle,
        selectedFamilyID: UUID? = nil
    ) {
        supabase = nil
        familyRepository = nil
        ledgerRepository = nil
        userDefaults = UserDefaults(suiteName: "skey.preview") ?? .standard
        sessionState = previewState
        self.workspaceState = workspaceState
        self.selectedFamilyID = selectedFamilyID
    }

    deinit {
        authObservationTask?.cancel()
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
    }

    private func resetSignedOutState() {
        currentUserID = nil
        selectedFamilyID = nil
        workspaceState = .idle
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

    var errorDescription: String? {
        switch self {
        case .clientUnavailable: "Il servizio non è ancora disponibile."
        case .workspaceUnavailable: "Attendi il caricamento dei dati e riprova."
        }
    }
}
