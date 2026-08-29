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
        .onChange(of: appModel.pendingCommissionedPurchaseID) { _, purchaseID in
            guard purchaseID != nil else { return }
            sidebarSelection = .contacts
            compactTab = .more
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
            NavigationStack {
                destinationContainer(sidebarSelection ?? .dashboard)
            }
            .id(sidebarSelection ?? .dashboard)
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
            #if os(iOS)
            .navigationBarTitleDisplayMode(destination == .dashboard ? .inline : .automatic)
            #endif
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    ProminentMovementButton {
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
            ScheduledPaymentsView(appModel: appModel)
        case .reimbursements:
            ReimbursementsView(appModel: appModel)
        case .accounts:
            AccountsView(appModel: appModel)
        case .categories:
            DirectoryManagementView(appModel: appModel, mode: .categories)
        case .counterparties:
            DirectoryManagementView(appModel: appModel, mode: .counterparties)
        case .tags:
            DirectoryManagementView(appModel: appModel, mode: .tags)
        case .contacts:
            ContactsView(appModel: appModel)
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
        if destination == .dashboard { return "" }
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

private struct ProminentMovementButton: View {
    let action: () -> Void

    var body: some View {
        if #available(iOS 26.0, macOS 26.0, *) {
            Button("Nuovo movimento", systemImage: "plus", action: action)
                .labelStyle(.titleAndIcon)
                .buttonStyle(.glassProminent)
                .tint(.green)
        } else {
            Button("Nuovo movimento", systemImage: "plus", action: action)
                .labelStyle(.titleAndIcon)
                .buttonStyle(.borderedProminent)
                .tint(.green)
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

private struct ScheduledPaymentsView: View {
    let appModel: AppModel

    @State private var editingMovement: LedgerMovement?
    @State private var pendingDeletion: LedgerMovement?
    @State private var deletionError: String?

    var body: some View {
        Group {
            switch appModel.ledgerState {
            case .idle, .loading:
                ProgressView("Caricamento rate…")
            case .failed(let message):
                ContentUnavailableView {
                    Label("Rate non disponibili", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(message)
                } actions: {
                    Button("Riprova") { Task { await appModel.reloadLedger() } }
                }
            case .loaded(let snapshot):
                let scheduled = snapshot.scheduledPayments.filter {
                    $0.status == .scheduled
                        && $0.authorID.caseInsensitiveCompare(snapshot.currentUserID) == .orderedSame
                }
                let groups = Self.groups(from: scheduled)
                List {
                    ForEach(groups) { group in
                        let firstMovement = Self.firstMovement(for: group, in: snapshot)
                        Section {
                            ForEach(group.payments) { payment in
                                HStack(alignment: .firstTextBaseline, spacing: 12) {
                                    Text("\(payment.installmentNumber)")
                                        .font(.caption.weight(.bold))
                                        .foregroundStyle(.secondary)
                                        .frame(minWidth: 22)
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text("Rata \(payment.installmentNumber) di \(payment.installmentCount)")
                                            .fontWeight(.medium)
                                        Text("Scadenza \(Self.dateLabel(payment.dueDate))")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 2) {
                                        Text("Rata completa")
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                        Text(payment.amount.euroFormatted)
                                            .fontWeight(.semibold)
                                            .monospacedDigit()
                                    }
                                }
                            }
                        } header: {
                            VStack(alignment: .leading, spacing: 7) {
                                HStack(alignment: .firstTextBaseline) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(group.first.description)
                                            .font(.headline)
                                            .textCase(nil)
                                        Text(Self.subtitle(for: group.first, snapshot: snapshot))
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .textCase(nil)
                                        if let firstMovement {
                                            Text("Iniziato il \(Self.dateLabel(firstMovement.date))")
                                                .font(.caption2)
                                                .foregroundStyle(.secondary)
                                                .textCase(nil)
                                        }
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 2) {
                                        Text("Ancora da pagare")
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                            .textCase(nil)
                                        Text(group.pendingTotal.euroFormatted)
                                            .font(.headline)
                                            .monospacedDigit()
                                            .textCase(nil)
                                    }
                                    if let firstMovement {
                                        #if os(macOS)
                                        Button {
                                            editingMovement = firstMovement
                                        } label: {
                                            Image(systemName: "pencil")
                                        }
                                        .buttonStyle(.borderless)
                                        .help("Modifica piano rateale")
                                        .accessibilityLabel("Modifica \(group.first.description)")

                                        Button(role: .destructive) {
                                            pendingDeletion = firstMovement
                                        } label: {
                                            Image(systemName: "trash")
                                        }
                                        .buttonStyle(.borderless)
                                        .foregroundStyle(.red)
                                        .help("Elimina piano rateale")
                                        .accessibilityLabel("Elimina \(group.first.description)")
                                        #else
                                        Menu("Azioni", systemImage: "ellipsis.circle") {
                                            Button("Modifica", systemImage: "pencil") {
                                                editingMovement = firstMovement
                                            }
                                            Button("Elimina piano", systemImage: "trash", role: .destructive) {
                                                pendingDeletion = firstMovement
                                            }
                                        }
                                        .labelStyle(.iconOnly)
                                        .accessibilityLabel("Azioni per \(group.first.description)")
                                        #endif
                                    }
                                }
                                HStack(spacing: 12) {
                                    Label(Self.accountName(for: group.first, snapshot: snapshot), systemImage: "creditcard")
                                    Label("\(group.paidCount) di \(group.first.installmentCount) pagate", systemImage: "timer")
                                    Label(group.first.shared ? "Famiglia" : "Personale", systemImage: group.first.shared ? "person.2" : "person")
                                }
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .textCase(nil)
                            }
                            .padding(.vertical, 6)
                        }
                    }
                }
                .overlay {
                    if scheduled.isEmpty {
                        ContentUnavailableView(
                            "Nessuna rata futura",
                            systemImage: "calendar.badge.checkmark",
                            description: Text("Le nuove spese rateali compariranno qui fino alla scadenza.")
                        )
                    }
                }
                .refreshable { await appModel.reloadLedger() }
            }
        }
        .sheet(item: $editingMovement) { movement in
            MovementComposerView(appModel: appModel, movement: movement)
        }
        .alert("Eliminare il piano rateale?", isPresented: Binding(
            get: { pendingDeletion != nil },
            set: { if !$0 { pendingDeletion = nil } }
        )) {
            Button("Annulla", role: .cancel) { pendingDeletion = nil }
            Button("Elimina", role: .destructive) { deletePendingPlan() }
        } message: {
            Text("L’acquisto iniziale e tutte le rate collegate verranno rimossi definitivamente.")
        }
        .alert("Piano non eliminato", isPresented: Binding(
            get: { deletionError != nil },
            set: { if !$0 { deletionError = nil } }
        )) {
            Button("OK", role: .cancel) { deletionError = nil }
        } message: {
            Text(deletionError ?? "Riprova tra poco.")
        }
    }

    private struct PlanGroup: Identifiable {
        let planID: String
        let payments: [LedgerScheduledPayment]

        var id: String { planID }
        var first: LedgerScheduledPayment { payments[0] }
        var pendingTotal: Money { payments.reduce(.zero) { $0 + $1.amount } }
        var paidCount: Int { max(0, first.installmentCount - payments.count) }
    }

    private static func groups(from payments: [LedgerScheduledPayment]) -> [PlanGroup] {
        Dictionary(grouping: payments, by: \.planID)
            .map { planID, items in
                PlanGroup(planID: planID, payments: items.sorted { $0.dueDate < $1.dueDate })
            }
            .sorted { $0.first.dueDate < $1.first.dueDate }
    }

    private static func firstMovement(for group: PlanGroup, in snapshot: LedgerSnapshot) -> LedgerMovement? {
        snapshot.movements.first {
            $0.installmentPlanID == group.planID
                && $0.installmentNumber == 1
                && $0.authorID.caseInsensitiveCompare(snapshot.currentUserID) == .orderedSame
        }
    }

    private static func accountName(for payment: LedgerScheduledPayment, snapshot: LedgerSnapshot) -> String {
        snapshot.accounts.first(where: { $0.id == payment.accountID })?.name ?? "Conto non disponibile"
    }

    private static func subtitle(for payment: LedgerScheduledPayment, snapshot: LedgerSnapshot) -> String {
        let beneficiary = snapshot.beneficiaries.first(where: { $0.id == payment.beneficiaryID })?.name
            ?? "Nessun beneficiario"
        return "\(beneficiary) · \(payment.provider ?? "Pagamento rateale")"
    }

    private static func dateLabel(_ value: String) -> String {
        guard let date = dayFormatter.date(from: value) else { return value }
        return date.formatted(.dateTime.day().month(.abbreviated).year().locale(Locale(identifier: "it_IT")))
    }

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private func deletePendingPlan() {
        guard let movement = pendingDeletion else { return }
        pendingDeletion = nil
        Task {
            do {
                try await appModel.deleteMovement(movement)
            } catch is CancellationError {
                return
            } catch {
                deletionError = error.localizedDescription
            }
        }
    }
}

private struct AccountsView: View {
    let appModel: AppModel
    @State private var editor: AccountEditorContext?
    @State private var accountToDelete: AccountSummary?
    @State private var deletingAccountID: String?
    @State private var deletionError: String?

    var body: some View {
        GeometryReader { geometry in
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
                    accountsList(snapshot, persistentActions: usesPersistentActions(in: geometry.size))
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Crea conto", systemImage: "plus") {
                    editor = AccountEditorContext(account: nil)
                }
                .labelStyle(.titleAndIcon)
            }
        }
        .sheet(item: $editor) { context in
            AccountEditorView(appModel: appModel, account: context.account)
        }
        .confirmationDialog(
            accountToDelete.map { "Eliminare \($0.name)?" } ?? "Eliminare il conto?",
            isPresented: Binding(
                get: { accountToDelete != nil },
                set: { if !$0 { accountToDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Elimina conto", role: .destructive) {
                guard let account = accountToDelete else { return }
                accountToDelete = nil
                remove(account)
            }
            Button("Annulla", role: .cancel) { accountToDelete = nil }
        } message: {
            Text("I movimenti storici resteranno disponibili, ma non potranno più aggiornare il saldo di questo conto.")
        }
        .alert("Conto non eliminato", isPresented: Binding(
            get: { deletionError != nil },
            set: { if !$0 { deletionError = nil } }
        )) {
            Button("OK", role: .cancel) { deletionError = nil }
        } message: {
            Text(deletionError ?? "Riprova tra poco.")
        }
    }

    private func accountsList(_ snapshot: LedgerSnapshot, persistentActions: Bool) -> some View {
        List {
            ForEach(snapshot.accounts) { account in
                if persistentActions {
                    HStack(spacing: 8) {
                        accountRow(account, snapshot: snapshot)
                        editButton(for: account)
                        if appModel.canDeleteLedgerAccount(account) {
                            deleteButton(for: account)
                        }
                    }
                } else {
                    accountRow(account, snapshot: snapshot)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            if appModel.canDeleteLedgerAccount(account) {
                                Button("Elimina", systemImage: "trash", role: .destructive) {
                                    accountToDelete = account
                                }
                            }
                            Button("Modifica", systemImage: "pencil") {
                                editor = AccountEditorContext(account: account)
                            }
                            .tint(.blue)
                        }
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

    private func editButton(for account: AccountSummary) -> some View {
        Button {
            editor = AccountEditorContext(account: account)
        } label: {
            Image(systemName: "pencil")
        }
        .buttonStyle(.borderless)
        .help("Modifica conto")
        .accessibilityLabel("Modifica \(account.name)")
    }

    private func deleteButton(for account: AccountSummary) -> some View {
        Button(role: .destructive) {
            accountToDelete = account
        } label: {
            if deletingAccountID == account.id {
                ProgressView().controlSize(.small)
            } else {
                Image(systemName: "trash")
            }
        }
        .buttonStyle(.borderless)
        .foregroundStyle(.red)
        .disabled(deletingAccountID != nil)
        .help("Elimina conto")
        .accessibilityLabel("Elimina \(account.name)")
    }

    private func accountRow(_ account: AccountSummary, snapshot: LedgerSnapshot) -> some View {
        HStack {
            Label {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 5) {
                        Text(account.name).foregroundStyle(.primary)
                        if appModel.isVisibleForReimbursements(account) {
                            Image(systemName: "eye.fill")
                                .font(.caption2)
                                .foregroundStyle(.blue)
                                .accessibilityLabel("Visibile per i rimborsi")
                        }
                    }
                    Text(accountSubtitle(account))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } icon: {
                Image(systemName: account.kind.systemImage)
            }
            Spacer()
            Text(LedgerCalculations.accountBalance(account, in: snapshot).euroFormatted)
                .monospacedDigit()
                .foregroundStyle(.primary)
        }
    }

    private func accountSubtitle(_ account: AccountSummary) -> String {
        let detail = account.institution.isEmpty ? account.kind.label : account.institution
        return "\(detail) · \(account.familyID == nil ? "Personale" : "Famiglia")"
    }

    private func usesPersistentActions(in size: CGSize) -> Bool {
        #if os(macOS)
        true
        #else
        size.width >= 700 && size.width > size.height
        #endif
    }

    private func remove(_ account: AccountSummary) {
        deletingAccountID = account.id
        Task {
            do {
                try await appModel.deleteLedgerAccount(account)
                deletingAccountID = nil
            } catch {
                deletionError = error.localizedDescription
                deletingAccountID = nil
            }
        }
    }
}

private struct AccountEditorContext: Identifiable {
    let id = UUID()
    let account: AccountSummary?
}

private struct AccountEditorView: View {
    let appModel: AppModel
    let account: AccountSummary?

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var institution: String
    @State private var kind: AccountSummary.Kind
    @State private var scope: DirectoryScope
    @State private var targetFamilyID: UUID?
    @State private var openingBalanceText: String
    @State private var openingBalanceDate: Date
    @State private var reimbursementFamilyIDs: Set<UUID>
    @State private var isSaving = false
    @State private var submitted = false
    @State private var errorMessage: String?

    init(appModel: AppModel, account: AccountSummary?) {
        self.appModel = appModel
        self.account = account
        _name = State(initialValue: account?.name ?? "")
        _institution = State(initialValue: account?.institution ?? "")
        _kind = State(initialValue: account?.kind ?? .bank)
        _scope = State(initialValue: account?.scope ?? .personal)
        _targetFamilyID = State(initialValue: account?.familyID ?? appModel.selectedFamilyID ?? appModel.availableFamilies.first?.id)
        _openingBalanceText = State(initialValue: account.map {
            NSDecimalNumber(decimal: $0.openingBalance).stringValue.replacingOccurrences(of: ".", with: ",")
        } ?? "0")
        _openingBalanceDate = State(initialValue: account?.openingBalanceDate.flatMap {
            Self.dayFormatter.date(from: $0)
        } ?? Date())
        _reimbursementFamilyIDs = State(initialValue: account.map(appModel.reimbursementFamilyIDs) ?? [])
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Conto") {
                    TextField("Nome conto", text: $name)
                    TextField("Istituto o dettaglio", text: $institution)
                    Picker("Tipo", selection: $kind) {
                        ForEach([AccountSummary.Kind.bank, .credit, .cash, .paypal], id: \.self) {
                            Text($0.label).tag($0)
                        }
                    }
                    if account == nil, !appModel.availableFamilies.isEmpty {
                        Picker("Visibilità", selection: $scope) {
                            Text("Personale").tag(DirectoryScope.personal)
                            Text("Condiviso con la famiglia").tag(DirectoryScope.family)
                        }
                    } else {
                        LabeledContent("Visibilità", value: scope == .personal ? "Personale" : "Famiglia")
                    }
                    if scope == .family {
                        if account == nil {
                            Picker("Famiglia", selection: $targetFamilyID) {
                                ForEach(appModel.availableFamilies) { family in
                                    Text(family.name).tag(Optional(family.id))
                                }
                            }
                        } else if let familyID = account?.familyID {
                            LabeledContent("Famiglia", value: familyName(familyID))
                        }
                    }
                }

                Section {
                    TextField("Saldo iniziale", text: $openingBalanceText)
                    #if os(iOS)
                        .keyboardType(.decimalPad)
                    #endif
                    DatePicker("Data di riferimento", selection: $openingBalanceDate, displayedComponents: .date)
                        .environment(\.locale, Locale(identifier: "it_IT"))
                } header: {
                    Text("Saldo iniziale")
                } footer: {
                    Text("I movimenti precedenti possono restare nelle statistiche senza modificare il saldo calcolato.")
                }

                if account?.familyID == nil, scope == .personal, !appModel.availableFamilies.isEmpty {
                    Section {
                        ForEach(appModel.availableFamilies) { family in
                            Toggle(family.name, isOn: reimbursementBinding(for: family.id))
                        }
                    } header: {
                        Text("Visibile per i rimborsi")
                    } footer: {
                        Text("Scegli in quali famiglie gli altri membri potranno selezionare questo conto. Vedranno soltanto il nome, mai il saldo o i movimenti.")
                    }
                }

                if submitted, !isValid {
                    Section {
                        Label("Inserisci un nome e un saldo iniziale valido.", systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                    }
                }
            }
            .formStyle(.grouped)
            .navigationTitle(account == nil ? "Nuovo conto" : "Modifica conto")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annulla") { dismiss() }.disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salva") { save() }.disabled(isSaving)
                }
            }
            .interactiveDismissDisabled(isSaving)
            .alert("Conto non salvato", isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "Riprova tra poco.")
            }
        }
    }

    private var parsedOpeningBalance: Decimal? {
        let trimmed = openingBalanceText.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalized = trimmed.contains(",")
            ? trimmed.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".")
            : trimmed
        return Decimal(string: normalized)
    }

    private var isValid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && parsedOpeningBalance != nil
            && (scope != .family || targetFamilyID != nil)
    }

    private func familyName(_ familyID: UUID) -> String {
        appModel.availableFamilies.first { $0.id == familyID }?.name ?? "Famiglia"
    }

    private func reimbursementBinding(for familyID: UUID) -> Binding<Bool> {
        Binding(
            get: { reimbursementFamilyIDs.contains(familyID) },
            set: { visible in
                if visible { reimbursementFamilyIDs.insert(familyID) }
                else { reimbursementFamilyIDs.remove(familyID) }
            }
        )
    }

    private func save() {
        submitted = true
        guard !isSaving, isValid, let openingBalance = parsedOpeningBalance else { return }
        isSaving = true
        let isFamily = account?.familyID != nil || (account == nil && scope == .family)
        let draft = AccountDraft(
            id: account?.id ?? UUID().uuidString.lowercased(),
            isNew: account == nil,
            familyID: isFamily ? (account?.familyID ?? targetFamilyID) : nil,
            name: name,
            institution: institution,
            kind: kind,
            openingBalance: openingBalance,
            openingBalanceDate: openingBalanceDate,
            reimbursementFamilyIDs: !isFamily
                ? reimbursementFamilyIDs
                : nil
        )
        Task {
            do {
                try await appModel.saveAccount(draft)
                dismiss()
            } catch is CancellationError {
                isSaving = false
            } catch {
                errorMessage = error.localizedDescription
                isSaving = false
            }
        }
    }

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
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
