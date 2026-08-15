import SwiftUI

struct MovementComposerView: View {
    let appModel: AppModel
    let movement: LedgerMovement?

    @Environment(\.dismiss) private var dismiss
    @State private var options: MovementOptions?
    @State private var composerMode = ComposerMode.expense
    @State private var type = MovementKind.expense
    @State private var amountText = ""
    @State private var date = Date()
    @State private var descriptionText = ""
    @State private var comments = ""
    @State private var accountID = ""
    @State private var toAccountID = ""
    @State private var category: LedgerDirectoryItem?
    @State private var counterparty: LedgerDirectoryItem?
    @State private var tag: LedgerDirectoryItem?
    @State private var isShared = false
    @State private var splitsEnabled = false
    @State private var splitDrafts: [MovementSplitEditorDraft] = []
    @State private var splitDirectorySheet: SplitDirectorySheetContext?
    @State private var affectsAccountBalance = false
    @State private var installmentsEnabled = false
    @State private var installmentCount = 3
    @State private var installmentProvider = "PayPal"
    @State private var customInstallmentProvider = ""
    @State private var installmentPlanID = "installment-plan-\(UUID().uuidString.lowercased())"
    @State private var scheduledPaymentIDs = (0..<4).map { _ in
        "scheduled-payment-\(UUID().uuidString.lowercased())"
    }
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var submitted = false
    @State private var draftID = UUID().uuidString.lowercased()
    @FocusState private var focusedField: FocusField?

    init(appModel: AppModel, movement: LedgerMovement? = nil) {
        self.appModel = appModel
        self.movement = movement
        _composerMode = State(initialValue: movement?.type == .income ? .income : .expense)
        _type = State(initialValue: movement?.type ?? .expense)
        _amountText = State(initialValue: movement.map {
            NSDecimalNumber(decimal: $0.amount.decimal).stringValue.replacingOccurrences(of: ".", with: ",")
        } ?? "")
        _date = State(initialValue: movement.flatMap { Self.dayFormatter.date(from: $0.date) } ?? Date())
        _descriptionText = State(initialValue: movement?.description ?? "")
        _comments = State(initialValue: movement?.comments ?? "")
        _accountID = State(initialValue: movement?.accountID ?? "")
        _isShared = State(initialValue: movement?.shared ?? false)
        _affectsAccountBalance = State(initialValue: movement?.affectsAccountBalance ?? false)
        _draftID = State(initialValue: movement?.id ?? UUID().uuidString.lowercased())
    }

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
            .navigationTitle(movement == nil ? "Nuovo movimento" : "Modifica movimento")
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
            .sheet(item: $splitDirectorySheet) { context in
                NavigationStack {
                    splitDirectorySheetContent(context)
                }
                #if os(iOS)
                .presentationDetents([.large])
                #endif
            }
        }
        #if os(iOS)
        .presentationDetents([.large])
        #endif
    }

    @ViewBuilder
    private func movementForm(_ options: MovementOptions) -> some View {
        if composerMode == .transfer, movement == nil {
            transferForm(options)
        } else {
            standardMovementForm(options)
        }
    }

    private func standardMovementForm(_ options: MovementOptions) -> some View {
        Form {
            Section {
                Picker("Tipo", selection: $composerMode) {
                    ForEach(availableComposerModes, id: \.self) { mode in
                        Text(mode.label).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: composerMode) { _, newMode in
                    changeComposerMode(newMode, options: options)
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


            if movement == nil, type == .expense {
                Section {
                    Toggle("Acquisto a rate", isOn: $installmentsEnabled)

                    if installmentsEnabled {
                        Picker("Numero rate", selection: $installmentCount) {
                            Text("3 rate").tag(3)
                            Text("5 rate").tag(5)
                        }

                        Picker("Servizio", selection: $installmentProvider) {
                            ForEach(Self.installmentProviders, id: \.self) { provider in
                                Text(provider).tag(provider)
                            }
                        }

                        if installmentProvider == "Altro" {
                            TextField("Nome del servizio", text: $customInstallmentProvider)
                        }

                        if let parts = installmentPreview {
                            LabeledContent("Prima rata", value: parts[0].euroFormatted)
                            LabeledContent("Ultima rata", value: parts[parts.count - 1].euroFormatted)
                        }
                    }
                } header: {
                    Text("Pagamento rateale")
                } footer: {
                    if installmentsEnabled {
                        Text("La prima rata viene registrata subito; le successive scadono ogni mese. Per una spesa condivisa, il debito familiare considera immediatamente l’intero acquisto.")
                    }
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
                    ForEach(usableAccounts(in: options)) { account in
                        Text(accountLabel(account)).tag(account.id)
                    }
                }
                .onChange(of: accountID) { _, _ in
                    if type == .income {
                        isShared = selectedAccount?.familyID != nil
                    }
                    normalizeDirectorySelections()
                    normalizeSplitSelections()
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

                NavigationLink {
                    DirectorySelectionView(
                        title: "Tag",
                        prompt: "Inserisci tag",
                        items: availableTags,
                        kind: .tag,
                        scope: effectiveScope,
                        selection: $tag
                    )
                } label: {
                    LabeledContent("Tag", value: tag?.name ?? "Facoltativo")
                }

                if tag != nil {
                    Button("Rimuovi tag", role: .destructive) { tag = nil }
                        .font(.caption)
                }
            }

            if type == .expense {
                splitSection
            }

            if appModel.selectedFamilyID != nil {
                Section {
                    Toggle(type == .income ? "Entrata della famiglia" : "Movimento condiviso", isOn: $isShared)
                        .disabled(selectedAccount?.familyID != nil || movement != nil)
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

    private func transferForm(_ options: MovementOptions) -> some View {
        Form {
            Section {
                Picker("Tipo", selection: $composerMode) {
                    ForEach(availableComposerModes, id: \.self) { mode in
                        Text(mode.label).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: composerMode) { _, newMode in
                    changeComposerMode(newMode, options: options)
                }

                amountField

                DatePicker("Data", selection: $date, displayedComponents: .date)
                    .environment(\.locale, Locale(identifier: "it_IT"))
            } header: {
                Text("Movimento")
            } footer: {
                if submitted, parsedAmount == nil {
                    Text("Inserisci un importo maggiore di zero.")
                        .foregroundStyle(.red)
                }
            }

            Section {
                Picker("Dal conto", selection: $accountID) {
                    Text("Seleziona un conto").tag("")
                    ForEach(options.accounts) { account in
                        Text(accountLabel(account)).tag(account.id)
                    }
                }
                .onChange(of: accountID) { _, newValue in
                    if toAccountID == newValue {
                        toAccountID = options.accounts.first(where: { $0.id != newValue })?.id ?? ""
                    }
                }

                Picker("Al conto", selection: $toAccountID) {
                    Text("Seleziona un conto").tag("")
                    ForEach(options.accounts.filter { $0.id != accountID }) { account in
                        Text(accountLabel(account)).tag(account.id)
                    }
                }

                TextField("Descrizione facoltativa", text: $descriptionText)
                    .focused($focusedField, equals: .description)
            } header: {
                Text("Trasferimento")
            } footer: {
                if selectedAccount?.familyID != nil, selectedDestinationAccount?.familyID == nil {
                    Text(transferFamilyNote)
                } else {
                    Text("Il giro fondi aggiorna il saldo di entrambi i conti senza creare una spesa o un’entrata.")
                }
            }

            if submitted, !isTransferValid {
                Section {
                    Label(transferValidationMessage, systemImage: "exclamationmark.triangle.fill")
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

    private var selectedDestinationAccount: AccountSummary? {
        options?.accounts.first { $0.id == toAccountID }
    }

    private var availableComposerModes: [ComposerMode] {
        movement == nil ? ComposerMode.allCases : [.expense, .income]
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

    private var availableTags: [LedgerDirectoryItem] {
        (options?.tags ?? []).filter { effectivelyShared || $0.scope == .personal }
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
        parsedAmount != nil
            && selectedAccount != nil
            && category != nil
            && counterparty != nil
            && splitsAreValid
    }

    private var validationMessage: String {
        if selectedAccount == nil { return "Seleziona il conto del movimento." }
        if category == nil { return "Seleziona o crea una categoria." }
        if counterparty == nil { return "Seleziona o crea un \(counterpartyLabel.lowercased())." }
        if splitsEnabled, splitDrafts.isEmpty { return "Aggiungi almeno un parziale." }
        if splitsEnabled, splitDrafts.contains(where: { parsedSplitAmount($0.amountText) == nil || $0.category == nil }) {
            return "Completa ogni parziale con categoria e importo valido."
        }
        if splitTotal > Money(decimal: parsedAmount ?? 0) {
            return "La somma dei parziali non può superare l’importo totale."
        }
        return "Controlla l’importo inserito."
    }

    private var isTransferValid: Bool {
        parsedAmount != nil
            && selectedAccount != nil
            && selectedDestinationAccount != nil
            && accountID != toAccountID
            && (options?.accounts.count ?? 0) >= 2
    }

    private var transferValidationMessage: String {
        if (options?.accounts.count ?? 0) < 2 { return "Crea almeno due conti per effettuare un giro fondi." }
        if selectedAccount == nil { return "Seleziona il conto di origine." }
        if selectedDestinationAccount == nil { return "Seleziona il conto di destinazione." }
        if accountID == toAccountID { return "Scegli due conti diversi." }
        return "Inserisci un importo maggiore di zero."
    }

    private var transferFamilyNote: String {
        let members = max(1, appModel.activeFamily?.memberCount ?? 1)
        guard members > 1 else {
            return "Il trasferimento dal conto familiare al conto personale aggiorna il saldo familiare."
        }
        let personalShare = Decimal(members - 1) / Decimal(members) * 100
        let percentage = NSDecimalNumber(decimal: personalShare).rounding(
            accordingToBehavior: NSDecimalNumberHandler(
                roundingMode: .plain,
                scale: 0,
                raiseOnExactness: false,
                raiseOnOverflow: false,
                raiseOnUnderflow: false,
                raiseOnDivideByZero: false
            )
        ).stringValue
        return "Il trasferimento verso un conto personale genera un debito verso la famiglia pari al \(percentage)% dell’importo."
    }

    private func loadOptions() async {
        guard options == nil else { return }
        isLoading = true

        do {
            let loaded = try await appModel.loadMovementOptions()
            options = loaded
            if let movement {
                accountID = usableAccounts(in: loaded).contains { $0.id == movement.accountID }
                    ? movement.accountID
                    : usableAccounts(in: loaded).first?.id ?? ""
                category = loaded.categories.first { $0.id == movement.categoryID }
                let counterpartyID = movement.type == .expense ? movement.beneficiaryID : movement.senderID
                let candidates = movement.type == .expense ? loaded.beneficiaries : loaded.senders
                counterparty = candidates.first { $0.id == counterpartyID }
                tag = loaded.tags.first { $0.id == movement.tagID }
                splitDrafts = (movement.splits ?? []).map { split in
                    MovementSplitEditorDraft(
                        id: split.id,
                        amountText: NSDecimalNumber(decimal: split.amount.decimal).stringValue
                            .replacingOccurrences(of: ".", with: ","),
                        category: loaded.categories.first { $0.id == split.categoryID },
                        beneficiary: loaded.beneficiaries.first { $0.id == split.beneficiaryID },
                        isShared: split.shared
                    )
                }
                splitsEnabled = !splitDrafts.isEmpty
            } else {
                accountID = loaded.accounts.first(where: { $0.familyID == nil })?.id
                    ?? loaded.accounts.first?.id
                    ?? ""
                toAccountID = loaded.accounts.first(where: { $0.id != accountID })?.id ?? ""
            }
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
        if composerMode == .transfer, movement == nil {
            saveTransfer()
            return
        }
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
            tag: tag,
            isShared: effectivelyShared,
            splits: resolvedSplits,
            affectsAccountBalance: isBeforeOpeningBalance ? affectsAccountBalance : nil,
            installment: installmentDraft
        )

        Task {
            do {
                if movement == nil {
                    try await appModel.createMovement(draft)
                } else {
                    try await appModel.updateMovement(draft)
                }
                dismiss()
            } catch is CancellationError {
                isSaving = false
            } catch {
                errorMessage = error.localizedDescription
                isSaving = false
            }
        }
    }

    private func saveTransfer() {
        guard
            !isSaving,
            isTransferValid,
            let amount = parsedAmount,
            let fromAccount = selectedAccount,
            let toAccount = selectedDestinationAccount
        else {
            return
        }

        isSaving = true
        focusedField = nil
        let draft = TransferDraft(
            fromAccount: fromAccount,
            toAccount: toAccount,
            amount: amount,
            date: date,
            description: descriptionText
        )

        Task {
            do {
                try await appModel.createTransfer(draft)
                dismiss()
            } catch is CancellationError {
                isSaving = false
            } catch {
                errorMessage = error.localizedDescription
                isSaving = false
            }
        }
    }

    private func changeComposerMode(_ mode: ComposerMode, options: MovementOptions) {
        guard movement == nil else {
            type = mode.movementKind ?? type
            return
        }

        if let movementKind = mode.movementKind {
            type = movementKind
            category = nil
            counterparty = nil
            if movementKind == .income {
                installmentsEnabled = false
                splitsEnabled = false
                splitDrafts = []
                updateIncomeAccount(forSharedState: isShared, options: options)
            }
        } else {
            installmentsEnabled = false
            splitsEnabled = false
            splitDrafts = []
            if accountID.isEmpty {
                accountID = options.accounts.first?.id ?? ""
            }
            if toAccountID.isEmpty || toAccountID == accountID {
                toAccountID = options.accounts.first(where: { $0.id != accountID })?.id ?? ""
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
        if tag?.scope == .family { tag = nil }
    }

    private func normalizeSplitSelections() {
        let familyAccount = selectedAccount?.familyID != nil
        for index in splitDrafts.indices {
            if familyAccount { splitDrafts[index].isShared = true }
            guard !splitDrafts[index].isShared, !familyAccount else { continue }
            if splitDrafts[index].category?.scope == .family { splitDrafts[index].category = nil }
            if splitDrafts[index].beneficiary?.scope == .family { splitDrafts[index].beneficiary = nil }
        }
    }

    private func updateBalanceImpact() {
        affectsAccountBalance = !isBeforeOpeningBalance
    }

    private func accountLabel(_ account: AccountSummary) -> String {
        account.familyID == nil ? account.name : "\(account.name) · Famiglia"
    }

    private func usableAccounts(in options: MovementOptions) -> [AccountSummary] {
        guard let movement else { return options.accounts }
        let originalIsShared = movement.shared || (movement.splits?.contains { $0.shared } ?? false)
        return originalIsShared ? options.accounts : options.accounts.filter { $0.familyID == nil }
    }

    private var installmentDraft: InstallmentPurchaseDraft? {
        guard movement == nil, type == .expense, installmentsEnabled else { return nil }
        let provider = installmentProvider == "Altro"
            ? customInstallmentProvider.trimmingCharacters(in: .whitespacesAndNewlines)
            : installmentProvider
        return InstallmentPurchaseDraft(
            planID: installmentPlanID,
            provider: provider.isEmpty ? "Altro" : provider,
            count: installmentCount,
            scheduledPaymentIDs: Array(scheduledPaymentIDs.prefix(installmentCount - 1))
        )
    }

    private var installmentPreview: [Money]? {
        guard installmentsEnabled, let amount = parsedAmount else { return nil }
        return LedgerCalculations.installmentAmounts(total: amount, count: installmentCount)
    }

    private var resolvedSplits: [MovementSplitDraft]? {
        guard splitsEnabled else { return nil }
        let familyAccount = selectedAccount?.familyID != nil
        return splitDrafts.compactMap { item in
            guard let amount = parsedSplitAmount(item.amountText), let category = item.category else { return nil }
            return MovementSplitDraft(
                id: item.id,
                amount: amount,
                category: category,
                beneficiary: item.beneficiary,
                isShared: familyAccount || item.isShared
            )
        }
    }

    private var splitTotal: Money {
        splitDrafts.reduce(.zero) { total, item in
            total + Money(decimal: parsedSplitAmount(item.amountText) ?? 0)
        }
    }

    private var splitsAreValid: Bool {
        guard splitsEnabled else { return true }
        guard !splitDrafts.isEmpty,
              splitDrafts.allSatisfy({ parsedSplitAmount($0.amountText) != nil && $0.category != nil }),
              let amount = parsedAmount
        else { return false }
        return splitTotal <= Money(decimal: amount)
    }

    private func parsedSplitAmount(_ text: String) -> Decimal? {
        let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: ".", with: "")
            .replacingOccurrences(of: ",", with: ".")
        guard let value = Decimal(string: normalized), value > 0 else { return nil }
        return value
    }

    @ViewBuilder
    private var splitSection: some View {
        Section {
            Picker("Suddivisione per categorie", selection: $splitsEnabled) {
                Text("Categoria unica").tag(false)
                Text("Aggiungi parziali").tag(true)
            }
            .onChange(of: splitsEnabled) { _, enabled in
                if enabled, splitDrafts.isEmpty { addSplit() }
                if !enabled { splitDrafts = [] }
            }

            if splitsEnabled {
                ForEach(splitDrafts) { item in
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("Parziale")
                                .font(.headline)
                            Spacer()
                            Button("Elimina", systemImage: "trash", role: .destructive) {
                                splitDrafts.removeAll { $0.id == item.id }
                            }
                            .labelStyle(.iconOnly)
                            .accessibilityLabel("Elimina parziale")
                        }

                        #if os(iOS)
                        TextField(
                            "Importo parziale",
                            text: splitFieldBinding(
                                id: item.id,
                                keyPath: \.amountText,
                                fallback: item.amountText
                            ),
                            prompt: Text("0,00 €")
                        )
                            .keyboardType(.decimalPad)
                        #else
                        TextField(
                            "Importo parziale",
                            text: splitFieldBinding(
                                id: item.id,
                                keyPath: \.amountText,
                                fallback: item.amountText
                            ),
                            prompt: Text("0,00 €")
                        )
                        #endif

                        Button {
                            focusedField = nil
                            splitDirectorySheet = SplitDirectorySheetContext(split: item, kind: .category)
                        } label: {
                            splitDirectoryRow(
                                title: "Categoria",
                                value: item.category?.name ?? "Seleziona"
                            )
                        }
                        .buttonStyle(.plain)

                        Button {
                            focusedField = nil
                            splitDirectorySheet = SplitDirectorySheetContext(split: item, kind: .beneficiary)
                        } label: {
                            splitDirectoryRow(
                                title: "Beneficiario",
                                value: item.beneficiary?.name ?? "Facoltativo"
                            )
                        }
                        .buttonStyle(.plain)

                        if item.beneficiary != nil {
                            Button("Rimuovi beneficiario", role: .destructive) {
                                splitFieldBinding(
                                    id: item.id,
                                    keyPath: \.beneficiary,
                                    fallback: item.beneficiary
                                ).wrappedValue = nil
                            }
                                .font(.caption)
                        }

                        Toggle(
                            "Spesa condivisa",
                            isOn: splitFieldBinding(
                                id: item.id,
                                keyPath: \.isShared,
                                fallback: item.isShared
                            )
                        )
                            .disabled(selectedAccount?.familyID != nil)
                            .onChange(of: item.isShared) { _, _ in normalizeSplitSelections() }
                    }
                    .padding(.vertical, 4)
                }

                Button("Aggiungi parziale", systemImage: "plus") { addSplit() }

                LabeledContent("Residuo nella categoria principale") {
                    Text(Money(cents: max(0, (parsedAmount.map { Money(decimal: $0).cents } ?? 0) - splitTotal.cents)).euroFormatted)
                        .monospacedDigit()
                        .foregroundStyle(splitTotal > Money(decimal: parsedAmount ?? 0) ? .red : .secondary)
                }
            }
        } header: {
            Text("Categorie")
        } footer: {
            if splitsEnabled {
                Text("Ogni parziale viene sottratto dalla categoria principale e può restare personale oppure essere condiviso con la famiglia.")
            }
        }
    }

    private func addSplit() {
        splitDrafts.append(MovementSplitEditorDraft(
            id: "movement-split-\(UUID().uuidString.lowercased())",
            amountText: "",
            category: nil,
            beneficiary: nil,
            isShared: selectedAccount?.familyID != nil || isShared
        ))
    }

    private func splitFieldBinding<Value>(
        id: String,
        keyPath: WritableKeyPath<MovementSplitEditorDraft, Value>,
        fallback: Value
    ) -> Binding<Value> {
        Binding(
            get: {
                splitDrafts.first(where: { $0.id == id })?[keyPath: keyPath] ?? fallback
            },
            set: { value in
                guard let index = splitDrafts.firstIndex(where: { $0.id == id }) else { return }
                splitDrafts[index][keyPath: keyPath] = value
            }
        )
    }

    private func splitDirectoryRow(title: String, value: String) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(value)
                .foregroundStyle(.secondary)
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private func splitDirectorySheetContent(_ context: SplitDirectorySheetContext) -> some View {
        switch context.kind {
        case .category:
            DirectorySelectionView(
                title: "Categoria parziale",
                prompt: "Inserisci categoria",
                items: splitCategories(for: context.split),
                kind: .category(.expense),
                scope: splitScope(for: context.split),
                selection: splitFieldBinding(
                    id: context.split.id,
                    keyPath: \.category,
                    fallback: context.split.category
                )
            )
        case .beneficiary:
            DirectorySelectionView(
                title: "Beneficiario parziale",
                prompt: "Inserisci beneficiario",
                items: splitBeneficiaries(for: context.split),
                kind: .beneficiary,
                scope: splitScope(for: context.split),
                selection: splitFieldBinding(
                    id: context.split.id,
                    keyPath: \.beneficiary,
                    fallback: context.split.beneficiary
                )
            )
        }
    }

    private func splitScope(for split: MovementSplitEditorDraft) -> DirectoryScope {
        selectedAccount?.familyID != nil || split.isShared ? .family : .personal
    }

    private func splitCategories(for split: MovementSplitEditorDraft) -> [LedgerDirectoryItem] {
        (options?.categories ?? []).filter {
            ($0.movementType == nil || $0.movementType == .expense)
                && (splitScope(for: split) == .family || $0.scope == .personal)
        }
    }

    private func splitBeneficiaries(for split: MovementSplitEditorDraft) -> [LedgerDirectoryItem] {
        (options?.beneficiaries ?? []).filter {
            splitScope(for: split) == .family || $0.scope == .personal
        }
    }

    private enum FocusField: Hashable {
        case amount
        case description
        case comments
    }

    private enum ComposerMode: String, CaseIterable {
        case expense
        case income
        case transfer

        var label: String {
            switch self {
            case .expense: "Spesa"
            case .income: "Entrata"
            case .transfer: "Giro fondi"
            }
        }

        var movementKind: MovementKind? {
            switch self {
            case .expense: .expense
            case .income: .income
            case .transfer: nil
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

    private static let installmentProviders = ["PayPal", "Klarna", "Scalapay", "Amazon", "Altro"]
}

private struct MovementSplitEditorDraft: Identifiable, Equatable {
    let id: String
    var amountText: String
    var category: LedgerDirectoryItem?
    var beneficiary: LedgerDirectoryItem?
    var isShared: Bool
}

private struct SplitDirectorySheetContext: Identifiable {
    enum Kind: String {
        case category
        case beneficiary
    }

    let split: MovementSplitEditorDraft
    let kind: Kind

    var id: String { "\(split.id)-\(kind.rawValue)" }
}

private struct DirectorySelectionView: View {
    enum Kind {
        case category(MovementKind)
        case beneficiary
        case sender
        case tag

        var defaultColor: String? {
            switch self {
            case .category(.income): "#3f7650"
            case .category(.expense): "#c64e2f"
            case .tag: "#c64e2f"
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
        case .tag: "tag"
        }
    }
}
