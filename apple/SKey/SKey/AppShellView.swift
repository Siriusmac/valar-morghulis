import SwiftUI

struct AppShellView: View {
    let appModel: AppModel
    let email: String?

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var sidebarSelection: AppDestination? = .dashboard
    @State private var compactTab: CompactTab = .dashboard
    @State private var presentedSheet: AppSheet?
    @State private var isSigningOut = false
    @State private var signOutError: String?

    var body: some View {
        Group {
            #if os(macOS)
            regularLayout
            #else
            if horizontalSizeClass == .compact {
                compactLayout
            } else {
                regularLayout
            }
            #endif
        }
        .sheet(item: $presentedSheet) { sheet in
            switch sheet {
            case .newMovement:
                MovementComposerView(appModel: appModel)
            case .account:
                NativeAccountView(appModel: appModel)
            }
        }
        .alert(
            "Uscita non riuscita",
            isPresented: Binding(
                get: { signOutError != nil },
                set: { if !$0 { signOutError = nil } }
            )
        ) {
            Button("OK", role: .cancel) { signOutError = nil }
        } message: {
            Text(signOutError ?? "Riprova tra poco.")
        }
        .onChange(of: appModel.pendingReimbursementRoute) { _, route in
            guard route != nil else { return }
            sidebarSelection = .dashboard
            compactTab = .dashboard
        }
    }

    private var regularLayout: some View {
        NavigationSplitView {
            List(selection: $sidebarSelection) {
                ForEach(AppDestination.Group.allCases, id: \.self) { group in
                    Section(group.title) {
                        ForEach(AppDestination.destinations(in: group)) { destination in
                            Label(destination.title, systemImage: destination.systemImage)
                                .tag(destination)
                        }
                    }
                }
            }
            .listStyle(.sidebar)
            .navigationTitle("sKey")
        } detail: {
            destinationContainer(sidebarSelection ?? .dashboard)
        }
    }

    private var compactLayout: some View {
        TabView(selection: $compactTab) {
            compactTabView(.dashboard, destination: .dashboard)
            compactTabView(.movements, destination: .movements)
            compactTabView(.scheduled, destination: .scheduledPayments)
            compactTabView(.accounts, destination: .accounts)

            NavigationStack {
                MoreDestinationsView { destination in
                    destinationContainer(destination)
                }
            }
            .tabItem {
                Label("Altro", systemImage: "ellipsis")
            }
            .tag(CompactTab.more)
        }
    }

    private func compactTabView(
        _ tab: CompactTab,
        destination: AppDestination
    ) -> some View {
        NavigationStack {
            destinationContainer(destination)
        }
        .tabItem {
            Label(destination.compactTitle, systemImage: destination.systemImage)
        }
        .tag(tab)
    }

    private func destinationContainer(_ destination: AppDestination) -> some View {
        destinationView(destination)
            .navigationTitle(destinationTitle(destination))
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("Aggiungi movimento", systemImage: "plus") {
                        presentedSheet = .newMovement
                    }
                    .keyboardShortcut("n", modifiers: .command)
                }

                ToolbarItem(placement: .primaryAction) {
                    profileMenu
                }
            }
    }

    @ViewBuilder
    private func destinationView(_ destination: AppDestination) -> some View {
        switch destination {
        case .dashboard:
            DashboardView(appModel: appModel)
        case .movements:
            MovementsView(appModel: appModel)
        case .scheduledPayments:
            FeaturePlaceholderView(
                destination: destination,
                message: "Qui verranno raggruppate rate future e pagamenti ricorrenti."
            )
        case .accounts:
            AccountsView(appModel: appModel)
        case .categories:
            FeaturePlaceholderView(
                destination: destination,
                message: "Categorie di spesa ed entrata, con ricerca e modifica native."
            )
        case .counterparties:
            FeaturePlaceholderView(
                destination: destination,
                message: "Beneficiari e mittenti saranno gestiti in due sezioni native."
            )
        case .tags:
            FeaturePlaceholderView(
                destination: destination,
                message: "I riepiloghi per tag utilizzeranno Swift Charts."
            )
        case .guide:
            FeaturePlaceholderView(
                destination: destination,
                message: "La guida sarà consultabile e ricercabile direttamente nell’app."
            )
        }
    }

    private var profileMenu: some View {
        Menu {
            if let email {
                Text(email)
            }

            #if os(macOS)
            SettingsLink {
                Label("Impostazioni…", systemImage: "gearshape")
            }
            #else
            Button("Account", systemImage: "person.crop.circle") {
                presentedSheet = .account
            }
            #endif

            Divider()

            Button(
                "Esci",
                systemImage: "rectangle.portrait.and.arrow.right",
                role: .destructive
            ) {
                signOut()
            }
            .disabled(isSigningOut)
        } label: {
            Image(systemName: "person.crop.circle")
        }
        .accessibilityLabel("Gestisci account")
    }

    private func destinationTitle(_ destination: AppDestination) -> String {
        if destination == .dashboard {
            return appModel.activeFamily?.name ?? "Contabilità personale"
        }
        return destination.title
    }

    private func signOut() {
        guard !isSigningOut else { return }

        isSigningOut = true

        Task {
            defer { isSigningOut = false }

            do {
                try await appModel.signOut()
            } catch is CancellationError {
                return
            } catch {
                signOutError = "Non è stato possibile uscire. Controlla la connessione e riprova."
            }
        }
    }
}

private enum CompactTab: Hashable {
    case dashboard
    case movements
    case scheduled
    case accounts
    case more
}

private enum AppSheet: String, Identifiable {
    case newMovement
    case account

    var id: String { rawValue }
}

private struct MoreDestinationsView<DestinationContent: View>: View {
    @ViewBuilder let destinationContent: (AppDestination) -> DestinationContent

    var body: some View {
        List {
            Section("Organizzazione") {
                destinationLink(.categories)
                destinationLink(.counterparties)
                destinationLink(.tags)
            }

            Section("Supporto") {
                destinationLink(.guide)
            }
        }
        .navigationTitle("Altro")
    }

    private func destinationLink(_ destination: AppDestination) -> some View {
        NavigationLink {
            destinationContent(destination)
        } label: {
            Label(destination.title, systemImage: destination.systemImage)
        }
    }
}

private struct FeaturePlaceholderView: View {
    let destination: AppDestination
    let message: String

    var body: some View {
        ContentUnavailableView {
            Label(destination.title, systemImage: destination.systemImage)
        } description: {
            Text(message)
        }
    }
}

private struct AccountsView: View {
    let appModel: AppModel

    var body: some View {
        Group {
            switch appModel.ledgerState {
            case .idle, .loading:
                ProgressView("Calcolo saldi…")
            case .failed(let message):
                ContentUnavailableView {
                    Label("Saldi non disponibili", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(message)
                } actions: {
                    Button("Riprova") { Task { await appModel.reloadLedger() } }
                }
            case .loaded(let snapshot):
                List(snapshot.accounts) { account in
                    LabeledContent {
                        Text(LedgerCalculations.accountBalance(account, in: snapshot).euroFormatted)
                            .monospacedDigit()
                    } label: {
                        Label {
                            VStack(alignment: .leading) {
                                Text(account.name)
                                Text(account.institution.isEmpty ? account.kind.label : account.institution)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: account.kind.systemImage)
                        }
                    }
                }
                .overlay {
                    if snapshot.accounts.isEmpty {
                        ContentUnavailableView(
                            "Nessun conto",
                            systemImage: "creditcard",
                            description: Text("Non risultano conti nello spazio selezionato.")
                        )
                    }
                }
                .refreshable { await appModel.reloadLedger() }
            }
        }
    }
}

struct NativeAccountView: View {
    let appModel: AppModel

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            AccountSettingsView(appModel: appModel)
                .navigationTitle("Account e famiglie")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fine") { dismiss() }
                }
            }
        }
    }
}
