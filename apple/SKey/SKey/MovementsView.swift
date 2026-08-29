import Foundation
import SwiftUI

struct MovementsView: View {
    let appModel: AppModel

    @State private var section = MovementSection.expenses
    @State private var selectedMonth = Self.currentMonth
    @State private var query = ""
    @State private var editingMovement: LedgerMovement?
    @State private var pendingDeletion: LedgerMovement?
    @State private var deletionError: String?

    var body: some View {
        content
            .searchable(text: $query, prompt: "Cerca movimento")
            .sheet(item: $editingMovement) { movement in
                MovementComposerView(appModel: appModel, movement: movement)
            }
            .alert("Eliminare il movimento?", isPresented: Binding(
                get: { pendingDeletion != nil },
                set: { if !$0 { pendingDeletion = nil } }
            )) {
                Button("Annulla", role: .cancel) { pendingDeletion = nil }
                Button("Elimina", role: .destructive) { deletePendingMovement() }
            } message: {
                Text("Il movimento verrà rimosso definitivamente.")
            }
            .alert("Movimento non eliminato", isPresented: Binding(
                get: { deletionError != nil },
                set: { if !$0 { deletionError = nil } }
            )) {
                Button("OK", role: .cancel) { deletionError = nil }
            } message: {
                Text(deletionError ?? "Riprova tra poco.")
            }
    }

    @ViewBuilder
    private var content: some View {
        switch appModel.ledgerState {
        case .idle, .loading:
            ProgressView("Caricamento movimenti…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let message):
            ContentUnavailableView {
                Label("Movimenti non disponibili", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
            } actions: {
                Button("Riprova") { Task { await appModel.reloadLedger() } }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
            }
        case .loaded(let snapshot):
            movementList(snapshot)
        }
    }

    private func movementList(_ snapshot: LedgerSnapshot) -> some View {
        let projection = MovementProjection(
            snapshot: snapshot,
            section: section,
            month: selectedMonth,
            query: query
        )

        return List {
            Section {
                Picker("Sezione", selection: $section) {
                    ForEach(MovementSection.allCases) { item in
                        Text(item.title).tag(item)
                    }
                }
                .pickerStyle(.segmented)

                Picker("Mese", selection: $selectedMonth) {
                    ForEach(selectableMonths(in: snapshot), id: \.self) { month in
                        Text(Self.monthLabel(month)).tag(month)
                    }
                }
                .pickerStyle(.menu)
                .accessibilityIdentifier("movements.month")
            }

            Section("Percentuali mensili per categoria") {
                if section == .shared {
                    VStack(spacing: 22) {
                        CategoryDonutChart(
                            title: "Spese condivise",
                            totals: projection.expenseCategoryTotals,
                            tone: .red
                        )
                        Divider()
                        CategoryDonutChart(
                            title: "Entrate condivise",
                            totals: projection.incomeCategoryTotals,
                            tone: .green
                        )
                    }
                } else {
                    CategoryDonutChart(
                        title: section == .expenses
                            ? "Spese per categoria"
                            : "Entrate per categoria",
                        totals: section == .expenses
                            ? projection.expenseCategoryTotals
                            : projection.incomeCategoryTotals,
                        tone: section == .expenses ? .red : .green
                    )
                }
            }

            Section {
                LabeledContent(projection.summaryTitle) {
                    Text(projection.total.euroFormatted)
                        .font(.headline.monospacedDigit())
                        .foregroundStyle(projection.summaryColor)
                }

                if section == .shared {
                    LabeledContent("Entrate condivise") {
                        Text(projection.sharedIncome.euroFormatted)
                            .monospacedDigit()
                            .foregroundStyle(.green)
                    }
                }
            } header: {
                Text("Riepilogo")
            } footer: {
                Text(projection.resultDescription)
            }

            if projection.movements.isEmpty {
                ContentUnavailableView {
                    Label(
                        query.isEmpty ? "Nessun movimento" : "Nessun risultato",
                        systemImage: query.isEmpty ? "tray" : "magnifyingglass"
                    )
                } description: {
                    Text(emptyDescription)
                }
                .listRowBackground(Color.clear)
                .frame(maxWidth: .infinity, minHeight: 220)
            } else {
                ForEach(projection.groups) { group in
                    Section(group.title) {
                        ForEach(group.movements) { movement in
                            #if os(macOS)
                            HStack(spacing: 8) {
                                MovementRow(
                                    movement: movement,
                                    snapshot: snapshot,
                                    sharedAmountOnly: section == .shared
                                )
                                if appModel.canModify(movement) {
                                    Button {
                                        editingMovement = movement
                                    } label: {
                                        Image(systemName: "pencil")
                                    }
                                    .buttonStyle(.borderless)
                                    .help("Modifica movimento")
                                    .accessibilityLabel("Modifica \(movement.description)")

                                    Button(role: .destructive) {
                                        pendingDeletion = movement
                                    } label: {
                                        Image(systemName: "trash")
                                    }
                                    .buttonStyle(.borderless)
                                    .foregroundStyle(.red)
                                    .help("Elimina movimento")
                                    .accessibilityLabel("Elimina \(movement.description)")
                                }
                            }
                            #else
                            MovementRow(
                                movement: movement,
                                snapshot: snapshot,
                                sharedAmountOnly: section == .shared
                            )
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                if appModel.canModify(movement) {
                                    Button("Elimina", systemImage: "trash", role: .destructive) {
                                        pendingDeletion = movement
                                    }
                                    Button("Modifica", systemImage: "pencil") {
                                        editingMovement = movement
                                    }
                                    .tint(.blue)
                                }
                            }
                            #endif
                        }
                    }
                }
            }
        }
        .listStyle(.automatic)
        .refreshable { await appModel.reloadLedger() }
    }

    private func deletePendingMovement() {
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

    private var emptyDescription: String {
        if !query.isEmpty {
            return "Prova a cercare per descrizione, categoria, conto, beneficiario o mittente."
        }
        return "Non risultano movimenti per il mese e la sezione selezionati."
    }

    private func selectableMonths(in snapshot: LedgerSnapshot) -> [String] {
        Set(snapshot.movements.map { String($0.date.prefix(7)) } + [Self.currentMonth])
            .filter { $0.count == 7 }
            .sorted(by: >)
    }

    private static let currentMonth: String = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM"
        return formatter.string(from: Date())
    }()

    private static func monthLabel(_ value: String) -> String {
        guard let date = monthParser.date(from: value) else { return value }
        return monthFormatter.string(from: date).capitalized(with: Locale(identifier: "it_IT"))
    }

    private static let monthParser: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM"
        return formatter
    }()

    private static let monthFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "it_IT")
        formatter.setLocalizedDateFormatFromTemplate("MMMM yyyy")
        return formatter
    }()
}

private enum MovementSection: String, CaseIterable, Identifiable {
    case expenses
    case income
    case shared

    var id: String { rawValue }

    var title: String {
        switch self {
        case .expenses: "Spese"
        case .income: "Entrate"
        case .shared: "Condivise"
        }
    }
}

private struct MovementProjection {
    let section: MovementSection
    let movements: [LedgerMovement]
    let groups: [MovementDayGroup]
    let total: Money
    let sharedIncome: Money
    let expenseCategoryTotals: [LedgerCategoryTotal]
    let incomeCategoryTotals: [LedgerCategoryTotal]

    init(snapshot: LedgerSnapshot, section: MovementSection, month: String, query: String) {
        self.section = section
        let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
            .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)

        let monthlySectionMovements = snapshot.movements.filter { movement in
            guard movement.date.hasPrefix(month) else { return false }
            return switch section {
            case .expenses: movement.type == .expense
            case .income: movement.type == .income
            case .shared: LedgerCalculations.hasSharedPortion(movement, in: snapshot)
            }
        }

        movements = monthlySectionMovements.filter { movement in
            guard !normalizedQuery.isEmpty else { return true }

            let searchableText = [
                movement.description,
                movement.comments ?? "",
                snapshot.categoryName(for: movement),
                snapshot.directoryName(for: movement),
                movement.accountID == CommissionedPurchaseAccounting.debtCompensationAccountID
                    ? CommissionedPurchaseAccounting.debtCompensationAccountLabel
                    : snapshot.account(named: movement.accountID)?.name ?? ""
            ]
            .joined(separator: " ")
            .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            return searchableText.contains(normalizedQuery)
        }

        expenseCategoryTotals = LedgerCalculations.categoryTotals(
            in: snapshot,
            movements: monthlySectionMovements.filter { $0.type == .expense },
            sharedOnly: section == .shared
        )
        incomeCategoryTotals = LedgerCalculations.categoryTotals(
            in: snapshot,
            movements: monthlySectionMovements.filter { $0.type == .income },
            sharedOnly: section == .shared
        )

        groups = Dictionary(grouping: movements, by: \.date)
            .map { MovementDayGroup(date: $0.key, movements: $0.value) }
            .sorted { $0.date > $1.date }

        total = movements
            .filter { section == .shared ? $0.type == .expense : true }
            .reduce(.zero) { partial, movement in
                partial + (section == .shared
                    ? LedgerCalculations.sharedAmount(of: movement)
                    : movement.amount)
            }
        sharedIncome = movements
            .filter { $0.type == .income }
            .reduce(.zero) { $0 + LedgerCalculations.sharedAmount(of: $1) }
    }

    var summaryTitle: String {
        switch section {
        case .expenses: "Totale spese"
        case .income: "Totale entrate"
        case .shared: "Spese condivise"
        }
    }

    var summaryColor: Color {
        section == .income ? .green : .red
    }

    var resultDescription: String {
        let noun = movements.count == 1 ? "movimento" : "movimenti"
        return "\(movements.count) \(noun) nel mese selezionato"
            + (section == .shared ? " · importi condivisi" : "")
    }
}

private struct MovementDayGroup: Identifiable {
    let date: String
    let movements: [LedgerMovement]

    var id: String { date }

    var title: String {
        guard let parsedDate = Self.parser.date(from: date) else { return date }
        return Self.formatter.string(from: parsedDate)
    }

    private static let parser: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "it_IT")
        formatter.dateStyle = .full
        return formatter
    }()
}

struct MovementRow: View {
    let movement: LedgerMovement
    let snapshot: LedgerSnapshot
    let sharedAmountOnly: Bool

    private var displayedAmount: Money {
        sharedAmountOnly ? LedgerCalculations.sharedAmount(of: movement) : movement.amount
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Image(systemName: movement.type == .expense ? "arrow.up.right" : "arrow.down.left")
                .font(.subheadline.bold())
                .foregroundStyle(movement.type == .expense ? .red : .green)
                .frame(width: 30, height: 30)
                .background((movement.type == .expense ? Color.red : .green).opacity(0.12), in: .circle)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                Text(movement.description)
                    .font(.headline)
                    .lineLimit(2)
                Text("\(snapshot.categoryName(for: movement)) · \(snapshot.directoryName(for: movement))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                HStack(spacing: 5) {
                    Text(accountLabel)
                    if LedgerCalculations.hasSharedPortion(movement, in: snapshot) {
                        Label("Condiviso", systemImage: "person.2.fill")
                    }
                    if movement.affectsAccountBalance == false {
                        Label("Solo statistiche", systemImage: "chart.bar")
                    }
                }
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .labelStyle(.titleAndIcon)
            }

            Spacer(minLength: 8)

            Text(displayedAmount.euroFormatted)
                .font(.headline.monospacedDigit())
                .foregroundStyle(movement.type == .expense ? .red : .green)
                .accessibilityLabel(
                    "\(movement.type == .expense ? "Spesa" : "Entrata") di \(displayedAmount.euroFormatted)"
                )
        }
        .padding(.vertical, 5)
    }

    private var accountLabel: String {
        if movement.accountID == CommissionedPurchaseAccounting.debtCompensationAccountID {
            return CommissionedPurchaseAccounting.debtCompensationAccountLabel
        }
        return snapshot.account(named: movement.accountID)?.name ?? "Conto non disponibile"
    }
}

#Preview("Movimenti caricati") {
    NavigationStack {
        MovementsView(appModel: AppModel(previewState: .signedIn(email: nil), ledgerState: .loaded(.preview)))
            .navigationTitle("Spese ed Entrate")
    }
}

#Preview("Movimenti vuoti") {
    NavigationStack {
        MovementsView(appModel: AppModel(previewState: .signedIn(email: nil), ledgerState: .loaded(.emptyPreview)))
            .navigationTitle("Spese ed Entrate")
    }
}

#Preview("Errore movimenti") {
    MovementsView(appModel: AppModel(previewState: .signedIn(email: nil), ledgerState: .failed("Controlla la connessione e riprova.")))
}

extension LedgerSnapshot {
    static let preview: LedgerSnapshot = {
        let familyID = UUID(uuidString: "11111111-1111-1111-1111-111111111111")!
        let account = AccountSummary(
            id: "cash",
            familyID: nil,
            name: "Contanti",
            institution: "Portafoglio",
            kind: .cash,
            openingBalance: 80,
            openingBalanceDate: "2026-08-01"
        )
        let category = LedgerDirectoryItem(
            id: "alimentari",
            name: "Alimentari",
            scope: .family,
            ownerID: nil,
            movementType: .expense,
            color: "#c64e2f"
        )
        let beneficiary = LedgerDirectoryItem(
            id: "mercato",
            name: "Mercato",
            scope: .family,
            ownerID: nil,
            movementType: nil,
            color: nil
        )
        return LedgerSnapshot(
            currentUserID: "22222222-2222-2222-2222-222222222222",
            memberCount: 2,
            accounts: [account],
            categories: [category],
            beneficiaries: [beneficiary],
            senders: [],
            movements: [
                LedgerMovement(
                    id: "preview-expense",
                    type: .expense,
                    authorID: "22222222-2222-2222-2222-222222222222",
                    memberID: "22222222-2222-2222-2222-222222222222",
                    amount: Money(cents: 3_000),
                    date: "2026-08-14",
                    description: "Spesa settimanale",
                    categoryID: category.id,
                    beneficiaryID: beneficiary.id,
                    senderID: nil,
                    accountID: account.id,
                    tagID: nil,
                    comments: nil,
                    shared: true,
                    splits: nil,
                    sharedSettlementAmount: nil,
                    affectsAccountBalance: nil,
                    createdAt: "2026-08-14T10:00:00Z"
                )
            ],
            transfers: [],
            reimbursements: []
        )
    }()

    fileprivate static let emptyPreview = LedgerSnapshot(
        currentUserID: "22222222-2222-2222-2222-222222222222",
        memberCount: 1,
        accounts: [],
        categories: [],
        beneficiaries: [],
        senders: [],
        movements: [],
        transfers: [],
        reimbursements: []
    )
}
