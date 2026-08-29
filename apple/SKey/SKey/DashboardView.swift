import Foundation
import SwiftUI

struct DashboardView: View {
    let appModel: AppModel

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var sharedChartMode = SharedMonthlyChart.Mode.daily
    @State private var sharedChartMonth = Self.currentMonth
    @State private var showsReimbursement = false

    var body: some View {
        workspaceContent
            .sheet(isPresented: $showsReimbursement) {
                ReimbursementComposerView(appModel: appModel)
            }
            .sheet(item: Binding(
                get: { appModel.pendingReimbursementRoute },
                set: { if $0 == nil { appModel.clearPendingReimbursementRoute() } }
            )) { route in
                ReimbursementConfirmationView(route: route, appModel: appModel)
            }
    }

    @ViewBuilder
    private var workspaceContent: some View {
        switch appModel.workspaceState {
        case .idle, .loading:
            ProgressView("Caricamento del tuo spazio…")
                .controlSize(.large)
        case .failed(let message):
            WorkspaceErrorView(message: message) {
                Task { await appModel.reloadWorkspace() }
            }
        case .loaded(let workspace):
            loadedContent(workspace)
        }
    }

    private func loadedContent(_ workspace: FamilyWorkspace) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                welcomeHeader(workspace.profile)
                workspacePicker(workspace)
                headlineBalanceCard(workspace)
                sharedMonthlySection(workspace)
                latestSharedMovements(workspace)
                reimbursementUpdates(workspace)
                accountsSection

            }
            .frame(maxWidth: 860, alignment: .leading)
            .padding(20)
            .frame(maxWidth: .infinity)
        }
        .refreshable {
            await appModel.reloadWorkspace()
        }
        .background {
            LinearGradient(
                colors: [
                    .green.opacity(0.12),
                    .clear,
                    .mint.opacity(0.08)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
        }
    }

    @ViewBuilder
    private func sharedMonthlySection(_ workspace: FamilyWorkspace) -> some View {
        if appModel.activeFamily != nil, let snapshot = ledgerSnapshot {
            SharedMonthlyChart(
                snapshot: snapshot,
                members: workspace.members(for: appModel.selectedFamilyID),
                currentUserID: workspace.profile.id,
                mode: $sharedChartMode,
                month: $sharedChartMonth
            )
        }
    }

    private func welcomeHeader(_ profile: UserProfile) -> some View {
        Text("Ciao, \(welcomeName(for: profile))")
            .font(.largeTitle.bold())
    }

    private func workspacePicker(_ workspace: FamilyWorkspace) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Spazio attivo")
                .font(.headline)

            Picker(
                "Spazio attivo",
                selection: Binding(
                    get: { appModel.selectedFamilyID },
                    set: { appModel.selectFamily($0) }
                )
            ) {
                Text("Contabilità personale")
                    .tag(nil as UUID?)

                ForEach(workspace.families) { family in
                    Text(family.name)
                        .tag(Optional(family.id))
                }
            }
            .labelsHidden()
            .pickerStyle(.menu)
            .accessibilityIdentifier("workspace.picker")

            Text(workspaceDescription)
                .font(.footnote)
                .foregroundStyle(.secondary)

            if let family = appModel.activeFamily {
                HStack(spacing: 14) {
                    Label("\(family.memberCount) \(family.memberCount == 1 ? "membro" : "membri")", systemImage: "person.2.fill")
                    Label(family.role.label, systemImage: "person.badge.key.fill")
                }
                .font(.footnote.weight(.medium))
                .foregroundStyle(.secondary)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .liquidGlassSurface()
    }

    private func welcomeName(for profile: UserProfile) -> String {
        let firstName = profile.firstName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !firstName.isEmpty { return firstName }

        return profile.displayName.split(whereSeparator: \Character.isWhitespace).first.map(String.init)
            ?? profile.displayName
    }

    private func headlineBalanceCard(_ workspace: FamilyWorkspace) -> some View {
        HStack(spacing: horizontalSizeClass == .compact ? 10 : 16) {
            Image(systemName: appModel.activeFamily == nil ? "eurosign.bank.building" : "scale.3d")
                .font(horizontalSizeClass == .compact ? .title2 : .title)
                .foregroundStyle(.green)
                .frame(
                    width: horizontalSizeClass == .compact ? 40 : 50,
                    height: horizontalSizeClass == .compact ? 40 : 50
                )
                .background(Color.green.opacity(0.12), in: .circle)
            VStack(alignment: .leading, spacing: 4) {
                Text(balanceTitle(workspace))
                    .font(.subheadline).foregroundStyle(.secondary)
                Text(headlineBalance.map { Money(cents: abs($0.cents)).euroFormatted } ?? "—")
                    .font(horizontalSizeClass == .compact
                          ? .title2.bold().monospacedDigit()
                          : .largeTitle.bold().monospacedDigit())
                    .lineLimit(1)
                    .minimumScaleFactor(0.62)
                    .allowsTightening(true)
                    .layoutPriority(1)
                Text("Il saldo si aggiorna automaticamente")
                    .font(.caption).foregroundStyle(.secondary)
                    .lineLimit(horizontalSizeClass == .compact ? 2 : 1)
            }
            Spacer()
            if let family = appModel.activeFamily,
               let balance = headlineBalance,
               balance != .zero,
               family.memberCount <= 2 || balance < .zero {
                Button {
                    showsReimbursement = true
                } label: {
                    HStack(alignment: .center, spacing: 6) {
                        Text(horizontalSizeClass == .compact ? "Registra\nrimborso" : "Registra rimborso")
                            .font(horizontalSizeClass == .compact ? .caption.weight(.semibold) : .body)
                            .multilineTextAlignment(.leading)
                            .lineLimit(horizontalSizeClass == .compact ? 2 : 1)
                        Image(systemName: "arrow.right.circle.fill")
                            .frame(width: 16, height: 16, alignment: .center)
                    }
                    .fixedSize()
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
                .controlSize(horizontalSizeClass == .compact ? .small : .regular)
            }
        }
        .padding(horizontalSizeClass == .compact ? 16 : 20)
        .liquidGlassSurface(tint: .green.opacity(0.1))
    }

    @ViewBuilder
    private func latestSharedMovements(_ workspace: FamilyWorkspace) -> some View {
        if appModel.activeFamily != nil, let snapshot = ledgerSnapshot {
            let movements = snapshot.movements.filter {
                LedgerCalculations.hasSharedPortion($0, in: snapshot)
            }.prefix(4)
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Ultimi movimenti condivisi").font(.title2.bold())
                    Text("Entrate e spese visibili a tutta la famiglia")
                        .font(.caption).foregroundStyle(.secondary)
                }
                VStack(spacing: 0) {
                    if movements.isEmpty {
                        ContentUnavailableView("Nessun movimento condiviso", systemImage: "person.2")
                            .frame(minHeight: 130)
                    } else {
                        ForEach(Array(movements)) { movement in
                            DashboardMovementRow(movement: movement, snapshot: snapshot, workspace: workspace)
                            if movement.id != movements.last?.id { Divider().padding(.leading, 46) }
                        }
                    }
                }
                .padding(.horizontal, 18)
                .liquidGlassSurface()
            }
        }
    }

    @ViewBuilder
    private func reimbursementUpdates(_ workspace: FamilyWorkspace) -> some View {
        if let snapshot = ledgerSnapshot {
            let updates = snapshot.reimbursements.filter {
                ($0.status == .pending || $0.status == .rejected)
                    && ($0.fromID.caseInsensitiveCompare(snapshot.currentUserID) == .orderedSame
                        || $0.toID.caseInsensitiveCompare(snapshot.currentUserID) == .orderedSame)
            }
            if !updates.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Rimborsi da verificare").font(.title2.bold())
                        Text("I saldi cambiano soltanto dopo la conferma della controparte")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    VStack(spacing: 12) {
                        ForEach(updates) { reimbursement in
                            ReimbursementReviewCard(
                                reimbursement: reimbursement,
                                snapshot: snapshot,
                                workspace: workspace,
                                appModel: appModel
                            )
                        }
                    }
                }
            }
        }
    }

    private var accountsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Conti")
                    .font(.title2.bold())
                Spacer()
                Text("Saldo calcolato")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 0) {
                if case .idle = appModel.ledgerState {
                    ProgressView("Calcolo saldi…")
                        .frame(maxWidth: .infinity, minHeight: 120)
                } else if case .loading = appModel.ledgerState {
                    ProgressView("Calcolo saldi…")
                        .frame(maxWidth: .infinity, minHeight: 120)
                } else if case .failed(let message) = appModel.ledgerState {
                    ContentUnavailableView {
                        Label("Saldi non disponibili", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(message)
                    } actions: {
                        Button("Riprova") { Task { await appModel.reloadLedger() } }
                    }
                    .frame(minHeight: 150)
                } else if let snapshot = ledgerSnapshot, snapshot.accounts.isEmpty {
                    ContentUnavailableView {
                        Label("Nessun conto", systemImage: "wallet.bifold")
                    } description: {
                        Text(appModel.activeFamily == nil
                             ? "Non risultano ancora conti personali salvati."
                             : "Questa famiglia non ha ancora un conto condiviso.")
                    }
                    .frame(minHeight: 150)
                } else if let snapshot = ledgerSnapshot {
                    ForEach(snapshot.accounts) { account in
                        AccountRow(
                            account: account,
                            balance: LedgerCalculations.accountBalance(account, in: snapshot)
                        )

                        if account.id != snapshot.accounts.last?.id {
                            Divider()
                                .padding(.leading, 48)
                        }
                    }
                }
            }
            .padding(.horizontal, 18)
            .liquidGlassSurface()
        }
    }

    private func balanceTitle(_ workspace: FamilyWorkspace) -> String {
        guard let balance = headlineBalance, appModel.activeFamily != nil else { return "Saldo dei conti" }
        if balance == .zero { return "Siete in pari" }
        if balance < .zero { return workspace.members(for: appModel.selectedFamilyID).count > 2 ? "Devi alla famiglia" : "Devi alla famiglia" }
        return workspace.members(for: appModel.selectedFamilyID).count > 2 ? "La famiglia deve a te" : "La famiglia deve a te"
    }

    private var workspaceDescription: String {
        if let family = appModel.activeFamily {
            return "Stai consultando i dati condivisi di \(family.name)."
        }

        return "Stai consultando soltanto la tua contabilità personale."
    }

    private var ledgerSnapshot: LedgerSnapshot? {
        guard case .loaded(let snapshot) = appModel.ledgerState else { return nil }
        return snapshot
    }

    private var headlineBalance: Money? {
        guard let ledgerSnapshot else { return nil }
        if appModel.activeFamily != nil {
            return LedgerCalculations.sharedBalance(in: ledgerSnapshot)
        }
        return ledgerSnapshot.accounts.reduce(.zero) {
            $0 + LedgerCalculations.accountBalance($1, in: ledgerSnapshot)
        }
    }

    private static let currentMonth: String = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM"
        return formatter.string(from: Date())
    }()
}

private struct AccountRow: View {
    let account: AccountSummary
    let balance: Money

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: account.kind.systemImage)
                .font(.title3)
                .foregroundStyle(.green)
                .frame(width: 34, height: 34)

            VStack(alignment: .leading, spacing: 3) {
                Text(account.name)
                    .font(.headline)
                Text(account.institution.isEmpty ? account.kind.label : account.institution)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 12)

            Text(balance.euroFormatted)
                .font(.headline.monospacedDigit())
                .foregroundStyle(balance < .zero ? .red : .primary)
        }
        .padding(.vertical, 14)
    }
}

private struct DashboardMovementRow: View {
    let movement: LedgerMovement
    let snapshot: LedgerSnapshot
    let workspace: FamilyWorkspace

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: movement.type == .expense ? "receipt.fill" : "arrow.down.left")
                .foregroundStyle(movement.type == .expense ? .red : .green)
                .frame(width: 32)
            VStack(alignment: .leading, spacing: 3) {
                Text(movement.description).font(.headline).lineLimit(1)
                Text("\(snapshot.categoryName(for: movement)) · \(snapshot.directoryName(for: movement))")
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                Text(authorName).font(.caption2).foregroundStyle(.tertiary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(displayedAmount.euroFormatted)
                    .font(.headline.monospacedDigit())
                    .foregroundStyle(movement.type == .expense ? .red : .green)
                Text(Self.date(movement.date)).font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 12)
    }

    private var displayedAmount: Money {
        snapshot.account(named: movement.accountID)?.familyID != nil
            ? movement.amount
            : LedgerCalculations.sharedAmount(of: movement)
    }

    private var authorName: String {
        workspace.members.first { $0.id.uuidString.caseInsensitiveCompare(movement.memberID) == .orderedSame }?.displayName ?? "Membro"
    }

    private static func date(_ value: String) -> String {
        guard let date = parser.date(from: value) else { return value }
        return formatter.string(from: date)
    }

    private static let parser: DateFormatter = {
        let formatter = DateFormatter(); formatter.dateFormat = "yyyy-MM-dd"; formatter.locale = Locale(identifier: "en_US_POSIX"); return formatter
    }()
    private static let formatter: DateFormatter = {
        let formatter = DateFormatter(); formatter.dateStyle = .medium; formatter.locale = Locale(identifier: "it_IT"); return formatter
    }()
}

struct ReimbursementReviewCard: View {
    let reimbursement: LedgerReimbursement
    let snapshot: LedgerSnapshot
    let workspace: FamilyWorkspace
    let appModel: AppModel
    var onResolved: (() -> Void)? = nil

    @State private var selectedAccountID = ""
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showsPurchaseReview = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label(title, systemImage: reimbursement.status == .rejected ? "xmark.circle.fill" : "clock.fill")
                    .font(.headline)
                Spacer()
                Text(reimbursement.amount.euroFormatted).font(.headline.monospacedDigit())
            }
            Text(subtitle).font(.footnote).foregroundStyle(.secondary)

            if isCounterparty, reimbursement.status == .pending {
                if reimbursement.settlementMethod == .purchase {
                    if linkedPurchase != nil {
                        Button("Conferma e cataloga", systemImage: "checkmark") {
                            showsPurchaseReview = true
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.green)
                    } else {
                        Text("La richiesta d’acquisto collegata non è disponibile. Aggiorna la schermata e riprova.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    if ownAccountID == nil {
                        Picker("Il tuo conto", selection: $selectedAccountID) {
                            Text("Seleziona un conto").tag("")
                            ForEach(snapshot.accounts.filter { $0.familyID == nil }) { account in
                                Text(account.name).tag(account.id)
                            }
                        }
                    }
                    HStack {
                        Button("Rifiuta", role: .destructive) { respond(accepted: false) }
                        Button("Conferma", systemImage: "checkmark") { respond(accepted: true) }
                            .buttonStyle(.borderedProminent)
                            .tint(.green)
                            .disabled(ownAccountID == nil && selectedAccountID.isEmpty)
                    }
                    .disabled(isSaving)
                }
            }

            if isSaving { ProgressView() }
        }
        .padding(18)
        .liquidGlassSurface()
        .alert("Rimborso non aggiornato", isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "Riprova tra poco.")
        }
        .sheet(isPresented: $showsPurchaseReview) {
            if let linkedPurchase {
                CommissionedPurchaseReviewView(appModel: appModel, purchase: linkedPurchase)
            }
        }
    }

    private var currentUserID: String { snapshot.currentUserID }
    private var isCounterparty: Bool {
        reimbursement.authorID.caseInsensitiveCompare(currentUserID) != .orderedSame
    }
    private var linkedPurchase: CommissionedPurchaseSummary? {
        guard let purchaseID = reimbursement.commissionedPurchaseID else { return nil }
        return workspace.commissionedPurchases.first { $0.id == purchaseID }
    }
    private var ownAccountID: String? {
        reimbursement.fromID.caseInsensitiveCompare(currentUserID) == .orderedSame
            ? reimbursement.fromAccountID
            : reimbursement.toAccountID
    }
    private var otherName: String {
        let otherID = reimbursement.fromID.caseInsensitiveCompare(currentUserID) == .orderedSame
            ? reimbursement.toID : reimbursement.fromID
        return workspace.members.first {
            $0.id.uuidString.caseInsensitiveCompare(otherID) == .orderedSame
        }?.displayName ?? "un membro"
    }
    private var authorName: String {
        workspace.members.first {
            $0.id.uuidString.caseInsensitiveCompare(reimbursement.authorID) == .orderedSame
        }?.displayName ?? "Un membro"
    }
    private var title: String {
        if reimbursement.status == .rejected { return "Rimborso rifiutato" }
        return isCounterparty ? "\(authorName) ha registrato un rimborso" : "In attesa di \(otherName)"
    }
    private var subtitle: String {
        if reimbursement.settlementMethod == .purchase, reimbursement.status == .pending {
            return isCounterparty
                ? "Scegli categoria e conto personale per confermare l’acquisto."
                : "L’acquisto sarà compensato dopo la catalogazione del destinatario."
        }
        return reimbursement.status == .rejected
            ? "Il rimborso non è incluso nei saldi."
            : "Verifica il conto prima di confermare."
    }

    private func respond(accepted: Bool) {
        isSaving = true
        Task {
            do {
                try await appModel.respondToReimbursement(
                    reimbursement,
                    accepted: accepted,
                    accountID: selectedAccountID.isEmpty ? nil : selectedAccountID
                )
                onResolved?()
            } catch is CancellationError {
                isSaving = false
            } catch {
                errorMessage = error.localizedDescription
                isSaving = false
            }
        }
    }
}

private struct ReimbursementConfirmationView: View {
    let route: PushReimbursementRoute
    let appModel: AppModel

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if
                    case .loaded(let workspace) = appModel.workspaceState,
                    case .loaded(let snapshot) = appModel.ledgerState,
                    let reimbursement = snapshot.reimbursements.first(where: { $0.id == route.reimbursementID })
                {
                    ReimbursementReviewCard(
                        reimbursement: reimbursement,
                        snapshot: snapshot,
                        workspace: workspace,
                        appModel: appModel,
                        onResolved: close
                    )
                    .padding(20)
                } else {
                    ContentUnavailableView(
                        "Rimborso non disponibile",
                        systemImage: "checkmark.circle",
                        description: Text("Potrebbe essere già stato risolto o non appartenere più a questa famiglia.")
                    )
                }
            }
            .navigationTitle("Conferma rimborso")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Chiudi", action: close)
                }
            }
        }
        #if os(iOS)
        .presentationDetents([.medium, .large])
        #endif
    }

    private func close() {
        appModel.clearPendingReimbursementRoute()
        dismiss()
    }
}

private struct WorkspaceErrorView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 42))
                .foregroundStyle(.orange)
            Text("Caricamento non riuscito")
                .font(.title2.bold())
            Text(message)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Riprova", action: retry)
                .liquidGlassProminentButton()
                .tint(.green)
        }
        .frame(maxWidth: 440)
        .padding(24)
    }
}

#Preview("Bacheca famiglia") {
    let familyID = UUID(uuidString: "11111111-1111-1111-1111-111111111111")!
    let workspace = FamilyWorkspace(
        profile: UserProfile(
            id: UUID(uuidString: "22222222-2222-2222-2222-222222222222")!,
            firstName: "Simone",
            lastName: "Miotto",
            fullName: "Simone Miotto",
            email: "simone@example.com"
        ),
        families: [
            FamilySummary(
                id: familyID,
                name: "Famiglia Miotto",
                role: .admin,
                memberCount: 2
            )
        ],
        members: [
            FamilyMemberSummary(
                id: UUID(uuidString: "22222222-2222-2222-2222-222222222222")!,
                familyID: familyID,
                displayName: "Simone Miotto"
            ),
            FamilyMemberSummary(
                id: UUID(uuidString: "33333333-3333-3333-3333-333333333333")!,
                familyID: familyID,
                displayName: "Anna Rossi"
            )
        ],
        invitations: [],
        reimbursementAccounts: [],
        personalAccounts: [
            AccountSummary(
                id: "cash",
                familyID: nil,
                name: "Contanti",
                institution: "Portafoglio",
                kind: .cash,
                openingBalance: 80,
                openingBalanceDate: "2026-08-01"
            )
        ],
        sharedAccounts: [
            AccountSummary(
                id: "shared",
                familyID: familyID,
                name: "Conto di famiglia",
                institution: "Cointestato",
                kind: .bank,
                openingBalance: 1_250,
                openingBalanceDate: "2026-08-01"
            )
        ]
    )

    DashboardView(
        appModel: AppModel(
            previewState: .signedIn(email: "simone@example.com"),
            workspaceState: .loaded(workspace),
            ledgerState: .loaded(.preview),
            selectedFamilyID: familyID
        )
    )
}
