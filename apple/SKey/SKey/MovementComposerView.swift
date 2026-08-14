import SwiftUI

struct MovementComposerView: View {
    let appModel: AppModel

    @Environment(\.dismiss) private var dismiss
    @State private var options: MovementOptions?
    @State private var type = MovementKind.expense
    @State private var amountText = ""
    @State private var date = Date()
    @State private var descriptionText = ""
    @State private var comments = ""
    @State private var accountID = ""
    @State private var category: LedgerDirectoryItem?
    @State private var counterparty: LedgerDirectoryItem?
    @State private var isShared = false
    @State private var affectsAccountBalance = false
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var submitted = false
    @State private var draftID = UUID().uuidString.lowercased()
    @FocusState private var focusedField: FocusField?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Caricamento…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let options {
                    movementForm(options)
                } else {
                    ContentUnavailableView(
                        "Dati non disponibili",
                        systemImage: "wifi.exclamationmark",
                        description: Text("Controlla la connessione e riprova.")
                    )
                }
            }
            .navigationTitle("Nuovo movimento")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annulla") { dismiss() }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salva") { save() }
                        .disabled(isLoading || isSaving)
                }
            }
            .task { await loadOptions() }
            .alert(
                "Movimento non salvato",
                isPresented: Binding(
                    get: { errorMessage != nil },
                    set: { if !$0 { errorMessage = nil } }
                )
            ) {
                Button("OK", role: .cancel) { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "Riprova tra poco.")
            }
            .interactiveDismissDisabled(isSaving)
        }
        #if os(iOS)
        .presentationDetents([.large])
        #endif
    }

    private func movementForm(_ options: MovementOptions) -> some View {
        Form {
            Section {
                Picker("Tipo", selection: $type) {
                    ForEach(MovementKind.allCases, id: \.self) { kind in
                        Text(kind.label).tag(kind)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: type) { _, newType in
                    category = nil
                    counterparty = nil
                    if newType == .income {
                        updateIncomeAccount(forSharedState: isShared, options: options)
                    }
                }

                amountField

                DatePicker("Data", selection: $date, displayedComponents: .date)
                    .environment(\.locale, Locale(identifier: "it_IT"))
                    .onChange(of: date) { _, _ in updateBalanceImpact() }
            } header: {
                Text("Movimento")
            } footer: {
                if submitted, parsedAmount == nil {
                    Text("Inserisci un importo maggiore di zero.")
                        .foregroundStyle(.red)
                }
            }

            Section("Dettagli") {
                TextField("Descrizione", text: $descriptionText)
                    .focused($focusedField, equals: .description)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .comments }

                TextField("Commenti facoltativi", text: $comments, axis: .vertical)
                    .lineLimit(2...5)
                    .focused($focusedField, equals: .comments)

                Picker("Conto", selection: $accountID) {
                    Text("Seleziona un conto").tag("")
                    ForEach(options.accounts) { account in
                        Text(accountLabel(account)).tag(account.id)
                    }
                }
                .onChange(of: accountID) { _, _ in
                    if type == .income {
                        isShared = selectedAccount?.familyID != nil
                    }
                    normalizeDirectorySelections()
                    updateBalanceImpact()
                }

                NavigationLink {
                    DirectorySelectionView(
                        title: "Categoria",
                        prompt: "Inserisci categoria",
                        items: availableCategories,
                        kind: .category(type),
                        scope: effectiveScope,
                        selection: $category
                    )
                } label: {
                    LabeledContent("Categoria", value: category?.name ?? "Seleziona")
                }

                NavigationLink {
                    DirectorySelectionView(
                        title: counterpartyLabel,
                        prompt: "Inserisci \(counterpartyLabel.lowercased())",
                        items: availableCounterparties,
                        kind: type == .expense ? .beneficiary : .sender,
                        scope: effectiveScope,
                        selection: $counterparty
                    )
                } label: {
                    LabeledContent(counterpartyLabel, value: counterparty?.name ?? "Seleziona")
                }
            }

            if appModel.selectedFamilyID != nil {
                Section {
                    Toggle(type == .income ? "Entrata della famiglia" : "Movimento condiviso", isOn: $isShared)
                        .disabled(selectedAccount?.familyID != nil)
                        .onChange(of: isShared) { _, newValue in
                            if type == .income {
                                updateIncomeAccount(forSharedState: newValue, options: options)
                            }
                            normalizeDirectorySelections()
                        }
                } footer: {
                    if selectedAccount?.familyID != nil {
                        Text("Il movimento è condiviso perché utilizza un conto della famiglia; non modifica il debito o credito tra i membri.")
                    } else if isShared {
                        Text("La spesa sarà ripartita in parti uguali tra i membri della famiglia.")
                    } else {
                        Text("Il movimento rimane visibile soltanto a te.")
                    }
                }
            }

            if isBeforeOpeningBalance {
                Section {
                    Picker("Effetto sul saldo", selection: $affectsAccountBalance) {
                        Text("Solo statistiche").tag(false)
                        Text("Includi nel saldo").tag(true)
                    }
                    .pickerStyle(.inline)
                } header: {
                    Text("Saldo iniziale")
                } footer: {
                    Text("La data precede il saldo iniziale del conto. Il movimento resterà comunque nelle statistiche.")
                }
            }

            if submitted, !isFormValid {
                Section {
                    Label(validationMessage, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                }
            }

            if isSaving {
                Section {
                    HStack {
                        Spacer()
                        ProgressView("Salvataggio…")
                        Spacer()
                    }
                }
            }
        }
        .formStyle(.grouped)
        .scrollDismissesKeyboard(.interactively)
    }

    @ViewBuilder
    private var amountField: some View {
        #if os(iOS)
        TextField("Importo", text: $amountText, prompt: Text("0,00 €"))
            .keyboardType(.decimalPad)
            .focused($focusedField, equals: .amount)
        #else
        TextField("Importo", text: $amountText, prompt: Text("0,00 €"))
            .focused($focusedField, equals: .amount)
        #endif
    }

    private var selectedAccount: AccountSummary? {
        options?.accounts.first { $0.id == accountID }
    }

    private var effectivelyShared: Bool {
        isShared || selectedAccount?.familyID != nil
    }

    private var effectiveScope: DirectoryScope {
        effectivelyShared ? .family : .personal
    }

    private var availableCategories: [LedgerDirectoryItem] {
        (options?.categories ?? []).filter {
            ($0.movementType == nil || $0.movementType == type)
                && (effectivelyShared || $0.scope == .personal)
        }
    }

    private var availableCounterparties: [LedgerDirectoryItem] {
        let values = type == .expense ? options?.beneficiaries : options?.senders
        return (values ?? []).filter { effectivelyShared || $0.scope == .personal }
    }

    private var counterpartyLabel: String {
        type == .expense ? "Beneficiario" : "Mittente"
    }

    private var parsedAmount: Decimal? {
        let trimmed = amountText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let normalized: String
        if trimmed.contains(",") {
            normalized = trimmed.replacingOccurrences(of: ".", with: "")
                .replacingOccurrences(of: ",", with: ".")
        } else {
            normalized = trimmed
        }

        guard let value = Decimal(string: normalized), value > 0 else { return nil }
        return value
    }

    private var isBeforeOpeningBalance: Bool {
        guard
            let openingDate = selectedAccount?.openingBalanceDate,
            let date = Self.dayFormatter.date(from: openingDate)
        else {
            return false
        }
        return Calendar.current.startOfDay(for: self.date) < date
    }

    private var isFormValid: Bool {
        parsedAmount != nil && selectedAccount != nil && category != nil && counterparty != nil
    }

    private var validationMessage: String {
        if selectedAccount == nil { return "Seleziona il conto del movimento." }
        if category == nil { return "Seleziona o crea una categoria." }
        if counterparty == nil { return "Seleziona o crea un \(counterpartyLabel.lowercased())." }
        return "Controlla l’importo inserito."
    }

    private func loadOptions() async {
        guard options == nil else { return }
        isLoading = true

        do {
            let loaded = try await appModel.loadMovementOptions()
            options = loaded
            accountID = loaded.accounts.first(where: { $0.familyID == nil })?.id
                ?? loaded.accounts.first?.id
                ?? ""
            updateBalanceImpact()
            focusedField = .amount
        } catch is CancellationError {
            return
        } catch {
            errorMessage = "Non è stato possibile caricare conti e categorie. Controlla la connessione e riprova."
        }
        isLoading = false
    }

    private func save() {
        submitted = true
        guard
            !isSaving,
            let amount = parsedAmount,
            let account = selectedAccount,
            let category,
            let counterparty
        else {
            return
        }

        isSaving = true
        focusedField = nil
        let cleanDescription = descriptionText.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanComments = comments.trimmingCharacters(in: .whitespacesAndNewlines)
        let draft = MovementDraft(
            id: draftID,
            type: type,
            amount: amount,
            date: date,
            description: cleanDescription.isEmpty ? category.name : cleanDescription,
            comments: cleanComments.isEmpty ? nil : cleanComments,
            account: account,
            category: category,
            counterparty: counterparty,
            isShared: effectivelyShared,
            affectsAccountBalance: isBeforeOpeningBalance ? affectsAccountBalance : nil
        )

        Task {
            do {
                try await appModel.createMovement(draft)
                dismiss()
            } catch is CancellationError {
                isSaving = false
            } catch {
                errorMessage = error.localizedDescription
                isSaving = false
            }
        }
    }

    private func updateIncomeAccount(forSharedState shared: Bool, options: MovementOptions) {
        let desiredFamilyID = shared ? appModel.selectedFamilyID : nil
        if let account = options.accounts.first(where: { $0.familyID == desiredFamilyID }) {
            accountID = account.id
        } else if shared {
            isShared = false
            accountID = options.accounts.first(where: { $0.familyID == nil })?.id ?? ""
        }
    }

    private func normalizeDirectorySelections() {
        guard !effectivelyShared else { return }
        if category?.scope == .family { category = nil }
        if counterparty?.scope == .family { counterparty = nil }
    }

    private func updateBalanceImpact() {
        affectsAccountBalance = !isBeforeOpeningBalance
    }

    private func accountLabel(_ account: AccountSummary) -> String {
        account.familyID == nil ? account.name : "\(account.name) · Famiglia"
    }

    private enum FocusField: Hashable {
        case amount
        case description
        case comments
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

private struct DirectorySelectionView: View {
    enum Kind {
        case category(MovementKind)
        case beneficiary
        case sender

        var defaultColor: String? {
            switch self {
            case .category(.income): "#3f7650"
            case .category(.expense): "#c64e2f"
            case .beneficiary, .sender: nil
            }
        }

        var movementType: MovementKind? {
            guard case .category(let type) = self else { return nil }
            return type
        }
    }

    let title: String
    let prompt: String
    let items: [LedgerDirectoryItem]
    let kind: Kind
    let scope: DirectoryScope
    @Binding var selection: LedgerDirectoryItem?

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    var body: some View {
        List {
            if canCreate {
                Section {
                    Button {
                        selection = LedgerDirectoryItem(
                            id: "\(idPrefix)-\(UUID().uuidString.lowercased())",
                            name: cleanQuery,
                            scope: scope,
                            ownerID: nil,
                            movementType: kind.movementType,
                            color: kind.defaultColor
                        )
                        dismiss()
                    } label: {
                        Label("Crea “\(cleanQuery)”", systemImage: "plus.circle.fill")
                    }
                }
            }

            Section {
                ForEach(filteredItems) { item in
                    Button {
                        selection = item
                        dismiss()
                    } label: {
                        HStack {
                            Text(item.name)
                                .foregroundStyle(.primary)
                            Spacer()
                            if selection?.id == item.id {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.tint)
                            }
                            if item.scope == .family {
                                Image(systemName: "person.2.fill")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .accessibilityLabel("Famiglia")
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(title)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .searchable(text: $query, prompt: prompt)
        .overlay {
            if filteredItems.isEmpty && !canCreate {
                ContentUnavailableView.search(text: query)
            }
        }
    }

    private var cleanQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var filteredItems: [LedgerDirectoryItem] {
        guard !cleanQuery.isEmpty else { return items }
        return items.filter { $0.name.localizedCaseInsensitiveContains(cleanQuery) }
    }

    private var canCreate: Bool {
        !cleanQuery.isEmpty
            && !items.contains { $0.name.compare(cleanQuery, options: .caseInsensitive) == .orderedSame }
    }

    private var idPrefix: String {
        switch kind {
        case .category: "category"
        case .beneficiary: "beneficiary"
        case .sender: "sender"
        }
    }
}
