import Foundation
import SwiftUI

enum DirectoryPageMode {
    case categories
    case counterparties
    case tags
}

struct DirectoryManagementView: View {
    let appModel: AppModel
    let mode: DirectoryPageMode

    @State private var categoryType = MovementKind.expense
    @State private var counterpartyKind = LedgerDirectoryKind.beneficiary
    @State private var editor: DirectoryEditorContext?
    @State private var deletion: DirectoryDeletionContext?
    @State private var errorMessage: String?

    var body: some View {
        GeometryReader { geometry in
            content(persistentActions: usesPersistentActions(in: geometry.size))
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(addTitle, systemImage: "plus") {
                    editor = DirectoryEditorContext(
                        item: nil,
                        kind: selectedKind,
                        movementType: mode == .categories ? categoryType : nil
                    )
                }
                .labelStyle(.titleAndIcon)
            }
        }
        .sheet(item: $editor) { context in
            DirectoryEditorView(appModel: appModel, context: context)
        }
        .sheet(item: $deletion) { context in
            DirectoryDeletionView(appModel: appModel, context: context)
        }
        .alert("Operazione non riuscita", isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "Riprova tra poco.")
        }
    }

    @ViewBuilder
    private func content(persistentActions: Bool) -> some View {
        switch appModel.ledgerState {
        case .idle, .loading:
            ProgressView("Caricamento anagrafiche…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let message):
            ContentUnavailableView {
                Label("Anagrafiche non disponibili", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
            } actions: {
                Button("Riprova") { Task { await appModel.reloadLedger() } }
            }
        case .loaded(let snapshot):
            directoryList(snapshot, persistentActions: persistentActions)
        }
    }

    private func directoryList(_ snapshot: LedgerSnapshot, persistentActions: Bool) -> some View {
        let items = visibleItems(in: snapshot)
        return List {
            if mode == .categories {
                Picker("Tipo", selection: $categoryType) {
                    Text("Spese").tag(MovementKind.expense)
                    Text("Entrate").tag(MovementKind.income)
                }
                .pickerStyle(.segmented)
            } else if mode == .counterparties {
                Picker("Tipo", selection: $counterpartyKind) {
                    Text("Beneficiari").tag(LedgerDirectoryKind.beneficiary)
                    Text("Mittenti").tag(LedgerDirectoryKind.sender)
                }
                .pickerStyle(.segmented)
            }

            if let unassigned = unassignedRoute(in: snapshot) {
                NavigationLink {
                    DirectoryMovementsView(snapshot: snapshot, route: unassigned)
                } label: {
                    directoryLabel(title: unassigned.title, item: nil, count: movementCount(for: unassigned, in: snapshot))
                }
            }

            ForEach(items) { item in
                let route = DirectoryMovementRoute(kind: selectedKind, itemID: item.id, title: item.name)
                if persistentActions {
                    HStack(spacing: 8) {
                        NavigationLink {
                            DirectoryMovementsView(snapshot: snapshot, route: route)
                        } label: {
                            directoryLabel(title: item.name, item: item, count: movementCount(for: route, in: snapshot))
                        }
                        Button {
                            editor = DirectoryEditorContext(item: item, kind: selectedKind, movementType: item.movementType)
                        } label: {
                            Image(systemName: "pencil")
                        }
                        .buttonStyle(.borderless)
                        .help("Modifica \(item.name)")
                        Button(role: .destructive) {
                            deletion = deletionContext(item: item, snapshot: snapshot)
                        } label: {
                            Image(systemName: "trash")
                        }
                        .buttonStyle(.borderless)
                        .foregroundStyle(.red)
                        .help("Elimina \(item.name)")
                    }
                } else {
                    NavigationLink {
                        DirectoryMovementsView(snapshot: snapshot, route: route)
                    } label: {
                        directoryLabel(title: item.name, item: item, count: movementCount(for: route, in: snapshot))
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button("Elimina", systemImage: "trash", role: .destructive) {
                            deletion = deletionContext(item: item, snapshot: snapshot)
                        }
                        Button("Modifica", systemImage: "pencil") {
                            editor = DirectoryEditorContext(item: item, kind: selectedKind, movementType: item.movementType)
                        }
                        .tint(.blue)
                    }
                }
            }
        }
        .refreshable { await appModel.reloadLedger() }
        .overlay {
            if items.isEmpty && unassignedRoute(in: snapshot) == nil {
                ContentUnavailableView("Nessun elemento", systemImage: selectedKind.systemImage)
            }
        }
    }

    private func directoryLabel(title: String, item: LedgerDirectoryItem?, count: Int) -> some View {
        Label {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).foregroundStyle(.primary)
                    Text("\(count) \(count == 1 ? "movimento" : "movimenti")")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if let item {
                    Text(item.scope == .family ? "Famiglia" : "Personale")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        } icon: {
            Image(systemName: selectedKind.systemImage)
                .foregroundStyle(selectedKind == .category ? categoryType.tint : .green)
        }
        .contentShape(Rectangle())
    }

    private var selectedKind: LedgerDirectoryKind {
        switch mode {
        case .categories: .category
        case .counterparties: counterpartyKind
        case .tags: .tag
        }
    }

    private var addTitle: String {
        switch selectedKind {
        case .category: "Nuova categoria"
        case .beneficiary: "Nuovo beneficiario"
        case .sender: "Nuovo mittente"
        case .tag: "Nuovo tag"
        }
    }

    private func visibleItems(in snapshot: LedgerSnapshot) -> [LedgerDirectoryItem] {
        switch selectedKind {
        case .category:
            snapshot.categories.filter { $0.movementType == nil || $0.movementType == categoryType }
        case .beneficiary:
            snapshot.beneficiaries.filter { !$0.id.hasPrefix("beneficiary-user-") }
        case .sender: snapshot.senders
        case .tag: snapshot.tags
        }
    }

    private func unassignedRoute(in snapshot: LedgerSnapshot) -> DirectoryMovementRoute? {
        let route: DirectoryMovementRoute
        switch selectedKind {
        case .category:
            route = DirectoryMovementRoute(kind: .category, itemID: "", title: "Senza categoria")
        case .beneficiary:
            route = DirectoryMovementRoute(kind: .beneficiary, itemID: "", title: "Nessun beneficiario")
        case .sender:
            route = DirectoryMovementRoute(kind: .sender, itemID: "", title: "Nessun mittente")
        case .tag:
            return nil
        }
        return movementCount(for: route, in: snapshot) > 0 ? route : nil
    }

    private func movementCount(for route: DirectoryMovementRoute, in snapshot: LedgerSnapshot) -> Int {
        DirectoryMovementsView.movements(in: snapshot, matching: route).count
    }

    private func deletionContext(item: LedgerDirectoryItem, snapshot: LedgerSnapshot) -> DirectoryDeletionContext {
        let replacements = selectedKind == .tag ? [] : visibleItems(in: snapshot).filter {
            $0.id != item.id && (item.scope != .family || $0.scope == .family)
        }
        return DirectoryDeletionContext(item: item, kind: selectedKind, replacements: replacements)
    }

    private func usesPersistentActions(in size: CGSize) -> Bool {
        #if os(macOS)
        true
        #else
        size.width >= 700 && size.width > size.height
        #endif
    }
}

private struct DirectoryEditorContext: Identifiable {
    let id = UUID()
    let item: LedgerDirectoryItem?
    let kind: LedgerDirectoryKind
    let movementType: MovementKind?
}

private struct DirectoryDeletionContext: Identifiable {
    let id = UUID()
    let item: LedgerDirectoryItem
    let kind: LedgerDirectoryKind
    let replacements: [LedgerDirectoryItem]
}

private struct DirectoryEditorView: View {
    let appModel: AppModel
    let context: DirectoryEditorContext

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var scope: DirectoryScope
    @State private var movementType: MovementKind
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(appModel: AppModel, context: DirectoryEditorContext) {
        self.appModel = appModel
        self.context = context
        _name = State(initialValue: context.item?.name ?? "")
        _scope = State(initialValue: context.item?.scope ?? (appModel.selectedFamilyID == nil ? .personal : .family))
        _movementType = State(initialValue: context.item?.movementType ?? context.movementType ?? .expense)
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Nome", text: $name)
                if context.kind == .category {
                    Picker("Tipo", selection: $movementType) {
                        Text("Spesa").tag(MovementKind.expense)
                        Text("Entrata").tag(MovementKind.income)
                    }
                    .disabled(context.item != nil)
                }
                if context.item == nil, appModel.selectedFamilyID != nil {
                    Picker("Visibilità", selection: $scope) {
                        Text("Famiglia").tag(DirectoryScope.family)
                        Text("Personale").tag(DirectoryScope.personal)
                    }
                } else {
                    LabeledContent("Visibilità", value: scope == .family ? "Famiglia" : "Personale")
                }
            }
            .navigationTitle(context.item == nil ? "Nuovo elemento" : "Modifica elemento")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annulla") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Salva") { save() }.disabled(isSaving || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
            }
            .alert("Elemento non salvato", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
                Button("OK", role: .cancel) { errorMessage = nil }
            } message: { Text(errorMessage ?? "Riprova tra poco.") }
        }
    }

    private func save() {
        isSaving = true
        let item = LedgerDirectoryItem(
            id: context.item?.id ?? "\(context.kind.rawValue)-\(UUID().uuidString.lowercased())",
            name: name,
            scope: context.item?.scope ?? scope,
            ownerID: context.item?.ownerID,
            movementType: context.kind == .category ? movementType : nil,
            color: context.item?.color ?? (context.kind == .category ? movementType.hexColor : context.kind == .tag ? "#c64e2f" : nil)
        )
        Task {
            do {
                try await appModel.saveDirectory(item, kind: context.kind)
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
                isSaving = false
            }
        }
    }
}

private struct DirectoryDeletionView: View {
    let appModel: AppModel
    let context: DirectoryDeletionContext

    @Environment(\.dismiss) private var dismiss
    @State private var replacementID = ""
    @State private var isDeleting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                if context.kind == .tag {
                    Section {
                        Text("I movimenti resteranno disponibili e il tag verrà rimosso dalle voci che lo utilizzano.")
                    }
                } else {
                    Section {
                        Picker("Riassegna a", selection: $replacementID) {
                            Text(emptyLabel).tag("")
                            ForEach(context.replacements) { Text($0.name).tag($0.id) }
                        }
                    } footer: {
                        Text("La scelta viene applicata anche ai parziali e alle rate future.")
                    }
                }
            }
            .navigationTitle("Elimina \(context.item.name)")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annulla") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Elimina", role: .destructive) { remove() }.disabled(isDeleting)
                }
            }
            .alert("Elemento non eliminato", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
                Button("OK", role: .cancel) { errorMessage = nil }
            } message: { Text(errorMessage ?? "Riprova tra poco.") }
        }
    }

    private var emptyLabel: String {
        switch context.kind {
        case .category: "Senza categoria"
        case .beneficiary: "Nessun beneficiario"
        case .sender: "Nessun mittente"
        case .tag: "Nessun tag"
        }
    }

    private func remove() {
        isDeleting = true
        Task {
            do {
                try await appModel.deleteDirectory(context.item, kind: context.kind, replacementID: replacementID.isEmpty ? nil : replacementID)
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
                isDeleting = false
            }
        }
    }
}

struct DirectoryMovementRoute: Hashable {
    let kind: LedgerDirectoryKind
    let itemID: String
    let title: String
}

private struct DirectoryMovementsView: View {
    let snapshot: LedgerSnapshot
    let route: DirectoryMovementRoute

    private var filtered: [LedgerMovement] {
        Self.movements(in: snapshot, matching: route)
    }

    private var total: Money {
        filtered.reduce(.zero) { result, movement in result + amount(for: movement) }
    }

    var body: some View {
        List {
            Section {
                LabeledContent("Totale") { Text(total.euroFormatted).font(.headline.monospacedDigit()) }
                if let oldest = filtered.last?.date {
                    LabeledContent("Dal", value: Self.dateLabel(oldest))
                }
            }
            if filtered.isEmpty {
                ContentUnavailableView("Nessun movimento", systemImage: "tray")
            } else {
                ForEach(filtered) { movement in
                    MovementRow(movement: movement, snapshot: snapshot, sharedAmountOnly: false)
                }
            }
        }
        .navigationTitle(route.title)
    }

    static func movements(in snapshot: LedgerSnapshot, matching route: DirectoryMovementRoute) -> [LedgerMovement] {
        snapshot.movements.filter { movement in
            switch route.kind {
            case .category:
                LedgerCalculations.allocations(of: movement).contains { $0.categoryID == route.itemID }
            case .beneficiary:
                movement.type == .expense && LedgerCalculations.allocations(of: movement).contains { ($0.beneficiaryID ?? "") == route.itemID }
            case .sender:
                movement.type == .income && (movement.senderID ?? "") == route.itemID
            case .tag:
                movement.tagID == route.itemID
            }
        }.sorted { $0.date == $1.date ? $0.createdAt > $1.createdAt : $0.date > $1.date }
    }

    private func amount(for movement: LedgerMovement) -> Money {
        switch route.kind {
        case .category:
            LedgerCalculations.allocations(of: movement).filter { $0.categoryID == route.itemID }.reduce(.zero) { $0 + $1.amount }
        case .beneficiary:
            LedgerCalculations.allocations(of: movement).filter { ($0.beneficiaryID ?? "") == route.itemID }.reduce(.zero) { $0 + $1.amount }
        case .sender, .tag:
            movement.amount
        }
    }

    private static func dateLabel(_ value: String) -> String {
        guard let date = parser.date(from: value) else { return value }
        return formatter.string(from: date)
    }

    private static let parser: DateFormatter = {
        let value = DateFormatter()
        value.calendar = Calendar(identifier: .gregorian)
        value.locale = Locale(identifier: "en_US_POSIX")
        value.timeZone = .current
        value.dateFormat = "yyyy-MM-dd"
        return value
    }()
    private static let formatter: DateFormatter = {
        let value = DateFormatter()
        value.locale = Locale(identifier: "it_IT")
        value.dateStyle = .medium
        return value
    }()
}

private extension LedgerDirectoryKind {
    var systemImage: String {
        switch self {
        case .category: "square.grid.2x2"
        case .beneficiary: "building.2"
        case .sender: "paperplane"
        case .tag: "tag"
        }
    }
}

private extension MovementKind {
    var tint: Color { self == .expense ? .red : .green }
    var hexColor: String { self == .expense ? "#c64e2f" : "#3f7650" }
}
