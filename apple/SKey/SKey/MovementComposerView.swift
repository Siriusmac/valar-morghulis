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
    @State private var romanContactID: UUID?
    @State private var romanParticipants: [RomanParticipantDraft] = []
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
    @State private var commissionedPurchase = false
    @State private var reimbursementPurchase = false
    @State private var commissionedRecipientID: UUID?
    @State private var commissionedInviteEmail = ""
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
                composerModePicker(options: options)

                amountField
            } header: {
                Text("Movimento")
            } footer: {
                if submitted, parsedAmount == nil {
                    Text("Inserisci un importo maggiore di zero.")
                        .foregroundStyle(.red)
                }
            }

            Section {
                if isDebtCompensationMovement {
                    LabeledContent("Origine contabile", value: CommissionedPurchaseAccounting.debtCompensationAccountLabel)
                } else {
                    Picker(type == .expense ? "Conto di addebito" : "Conto di destinazione", selection: $accountID) {
                        Text("Seleziona un conto").tag("")
                        ForEach(usableAccounts(in: options)) { account in
                            Text(accountLabel(account)).tag(account.id)
                        }
                    }
                    .onChange(of: accountID) { _, _ in
                        if type == .income { isShared = selectedAccount?.familyID != nil }
                        normalizeDirectorySelections(); normalizeSplitSelections(); updateBalanceImpact()
                    }
                }

                if movement == nil, type == .expense, composerMode != .roman {
                    Toggle("Pagamento a rate", isOn: $installmentsEnabled)
                    if installmentsEnabled {
                        Picker("Intermediario", selection: $installmentProvider) {
                            ForEach(Self.installmentProviders, id: \.self) { Text($0).tag($0) }
                        }
                        if installmentProvider == "Altro" {
                            TextField("Nome intermediario", text: $customInstallmentProvider)
                        }
                        Picker("Numero di rate", selection: $installmentCount) {
                            Text("3 rate").tag(3); Text("5 rate").tag(5)
                        }
                    }
                }
            } header: {
                Text("Conto e pagamento")
            } footer: {
                if installmentsEnabled {
                    Text("L’importo indicato resta il totale; la rateizzazione gestisce soltanto gli addebiti programmati sul conto.")
                }
            }

            Section("Beneficiario e data") {
                if counterpartyRequired {
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

                DatePicker("Data", selection: $date, displayedComponents: .date)
                    .environment(\.locale, Locale(identifier: "it_IT"))
                    .onChange(of: date) { _, _ in updateBalanceImpact() }

                TextField("Descrizione", text: $descriptionText)
                    .focused($focusedField, equals: .description)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .comments }

                TextField("Commenti facoltativi", text: $comments, axis: .vertical)
                    .lineLimit(2...5)
                    .focused($focusedField, equals: .comments)
            }

            if type == .expense {
                if composerMode == .roman, movement == nil {
                    romanSplitSection
                } else {
                    splitSection
                    if movement == nil, mainAllocationExists {
                        commissionSection(options)
                    }
                }
            }

            if mainAllocationExists, !commissionedPurchase {
                Section(type == .expense ? "Acquisto" : "Classificazione") {
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
            }

            if type == .income, appModel.selectedFamilyID != nil, mainAllocationExists, !commissionedPurchase {
                Section {
                    Toggle("Entrata della famiglia", isOn: $isShared)
                        .disabled(selectedAccount?.familyID != nil || movement != nil)
                        .onChange(of: isShared) { _, newValue in
                            updateIncomeAccount(forSharedState: newValue, options: options)
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
    private func composerModePicker(options: MovementOptions) -> some View {
        if movement == nil {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(availableComposerModes, id: \.self) { mode in
                    Button {
                        composerMode = mode
                        changeComposerMode(mode, options: options)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(mode.label).font(.subheadline.weight(.semibold))
                            Text(mode.description)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.leading)
                        }
                        .frame(maxWidth: .infinity, minHeight: 68, alignment: .leading)
                        .padding(.horizontal, 10)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.bordered)
                    .tint(composerMode == mode ? mode.tint : .secondary)
                    .accessibilityLabel(mode.label)
                }
            }
        } else {
            Picker("Tipo", selection: $composerMode) {
                ForEach(availableComposerModes, id: \.self) { mode in
                    Text(mode.label).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .onChange(of: composerMode) { _, newMode in
                changeComposerMode(newMode, options: options)
            }
        }
    }

    @ViewBuilder
    private var romanSplitSection: some View {
        Section {
            Picker("Aggiungi contatto", selection: $romanContactID) {
                Text("Scegli un contatto").tag(UUID?.none)
                ForEach(availableRomanContacts) { contact in
                    Text(contact.displayName + (contact.source == .family ? " · famiglia" : ""))
                        .tag(Optional(contact.id))
                }
            }

            Button {
                guard let romanContactID else { return }
                romanParticipants.append(RomanParticipantDraft(contactID: romanContactID))
                self.romanContactID = nil
            } label: {
                Label("Aggiungi", systemImage: "person.badge.plus")
            }
            .disabled(romanContactID == nil)

            if romanParticipants.isEmpty {
                Text("Aggiungi almeno una persona. La tua quota viene ricalcolata automaticamente.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(Array(romanParticipants.enumerated()), id: \.element.id) { index, participant in
                    let contact = availableCommissionedContacts.first { $0.id == participant.contactID }
                    let share = romanShares.indices.contains(index + 1) ? romanShares[index + 1] : .zero
                    let credit = reimbursementOptions.first {
                        $0.memberID.caseInsensitiveCompare(participant.contactID.uuidString) == .orderedSame
                    }?.availableCredit ?? .zero
                    let canCompensate = contact?.source == .family && share > .zero && credit >= share

                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(contact?.displayName ?? "Contatto").font(.subheadline.weight(.semibold))
                                Text("Quota: \(share.euroFormatted)").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button(role: .destructive) {
                                romanParticipants.removeAll { $0.id == participant.id }
                            } label: {
                                Image(systemName: "trash")
                            }
                            .buttonStyle(.borderless)
                            .accessibilityLabel("Rimuovi \(contact?.displayName ?? "contatto")")
                        }

                        if contact?.source == .family {
                            Toggle("Scala la quota dal debito", isOn: romanCompensationBinding(for: participant.id))
                                .disabled(!canCompensate && !participant.compensateDebt)
                            Text(canCompensate
                                 ? "Credito disponibile: \(credit.euroFormatted)"
                                 : "Il debito disponibile non copre questa quota.")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        } else {
                            Text("Riceverà una normale richiesta di rimborso.")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                LabeledContent("La tua quota", value: romanShares.first?.euroFormatted ?? Money.zero.euroFormatted)
                Text("\(romanParticipants.count + 1) quote totali")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        } header: {
            Text("Paga alla romana")
        } footer: {
            Text("La spesa viene addebitata per intero al tuo conto. Ogni contatto confermerà e catalogherà soltanto la propria quota.")
        }
    }

    @ViewBuilder
    private func commissionSection(_ options: MovementOptions) -> some View {
        Section {
            Picker("Tipo di spesa", selection: mainPurchaseModeBinding(options: options)) {
                ForEach(PurchaseAllocationMode.allCases) { mode in
                    Text(mode.title).tag(mode)
                        .disabled(mode == .reimbursement && reimbursementOptions.isEmpty)
                }
            }
            if mainPurchaseModeBinding(options: options).wrappedValue == .shared,
               let activeFamily = appModel.activeFamily {
                Picker("Spesa condivisa con", selection: .constant(activeFamily.id)) {
                    Text(activeFamily.name).tag(activeFamily.id)
                }
            }
            if commissionedPurchase {
                if reimbursementPurchase {
                    Picker("Rimborso a", selection: $commissionedRecipientID) {
                        Text("Scegli il membro da rimborsare").tag(UUID?.none)
                        ForEach(reimbursementOptions) { item in
                            if let memberID = UUID(uuidString: item.memberID) {
                                Text("\(reimbursementMemberName(item.memberID)) · fino a \(item.availableCredit.euroFormatted)")
                                    .tag(Optional(memberID))
                            }
                        }
                    }
                    .onChange(of: commissionedRecipientID) { _, _ in prepareCommissionDirectory() }
                } else {
                    Picker("Committente", selection: $commissionedRecipientID) {
                        Text("Invita un nuovo contatto").tag(UUID?.none)
                        ForEach(availableCommissionedContacts) { contact in
                            Text(contact.displayName + (contact.source == .family ? " · famiglia" : ""))
                                .tag(Optional(contact.id))
                        }
                    }
                    .onChange(of: commissionedRecipientID) { _, recipientID in
                        if recipientID != nil { commissionedInviteEmail = "" }
                        prepareCommissionDirectory()
                    }
                    if commissionedRecipientID == nil {
                        TextField("Email da invitare", text: $commissionedInviteEmail)
#if os(iOS)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
#endif
                            .autocorrectionDisabled()
                    }
                }
            }
        } footer: {
            if reimbursementPurchase {
                Text("L’acquisto compensa il debito verso il membro scelto. Dopo la conferma, sarà lui a catalogarlo nella propria contabilità.")
            } else if commissionedPurchase {
                Text("Il committente riceverà la richiesta e catalogherà l’acquisto nella propria contabilità.")
            }
        }
    }

    private func mainPurchaseModeBinding(options: MovementOptions) -> Binding<PurchaseAllocationMode> {
        Binding(
            get: {
                if reimbursementPurchase { return .reimbursement }
                if commissionedPurchase { return .commissioned }
                return selectedAccount?.familyID != nil || isShared ? .shared : .personal
            },
            set: { mode in
                let external = mode == .commissioned || mode == .reimbursement
                commissionedPurchase = external
                reimbursementPurchase = mode == .reimbursement
                isShared = mode == .shared
                commissionedInviteEmail = ""
                commissionedRecipientID = mode == .reimbursement
                    ? reimbursementOptions.first.flatMap { UUID(uuidString: $0.memberID) }
                    : mode == .commissioned ? availableCommissionedContacts.first?.id : nil
                if mode != .shared, selectedAccount?.familyID != nil {
                    accountID = options.accounts.first { $0.familyID == nil }?.id ?? ""
                }
                if external { prepareCommissionDirectory() }
                normalizeDirectorySelections()
            }
        )
    }

    private func prepareCommissionDirectory() {
        guard let currentUserID = currentUserIDString else { return }
        category = options?.categories.first { $0.name == "Acquisti per conto terzi" && $0.scope == .personal }
            ?? LedgerDirectoryItem(
                id: "category-commissioned-\(currentUserID)", name: "Acquisti per conto terzi",
                scope: .personal, ownerID: currentUserID, movementType: .expense, color: "#687078"
            )
        let name = commissionedRecipientID.flatMap { id in
            availableCommissionedContacts.first { $0.id == id }?.displayName
        } ?? "Contatto"
        counterparty = LedgerDirectoryItem(
            id: "beneficiary-contact-\(commissionedRecipientID?.uuidString.lowercased() ?? draftID)",
            name: name, scope: .personal, ownerID: currentUserID, movementType: nil, color: nil
        )
        tag = nil
    }

    private func transferForm(_ options: MovementOptions) -> some View {
        Form {
            Section {
                composerModePicker(options: options)

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
        HStack(spacing: 8) {
            Text("€")
                .foregroundStyle(type == .income ? .green : .primary)
            #if os(iOS)
            TextField("Importo", text: $amountText, prompt: Text("0,00"))
                .keyboardType(.decimalPad)
                .focused($focusedField, equals: .amount)
            #else
            TextField("Importo", text: $amountText, prompt: Text("0,00"))
                .focused($focusedField, equals: .amount)
            #endif
        }
        .font(.system(size: 42, weight: .semibold, design: .rounded))
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity, minHeight: 72)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Importo")
    }

    private var selectedAccount: AccountSummary? {
        if accountID == CommissionedPurchaseAccounting.debtCompensationAccountID {
            return CommissionedPurchaseAccounting.debtCompensationAccount
        }
        return options?.accounts.first { $0.id == accountID }
    }

    private var isDebtCompensationMovement: Bool {
        movement?.accountID == CommissionedPurchaseAccounting.debtCompensationAccountID
    }

    private var selectedDestinationAccount: AccountSummary? {
        options?.accounts.first { $0.id == toAccountID }
    }

    private var availableCommissionedContacts: [ContactSummary] {
        guard case .loaded(let workspace) = appModel.workspaceState else { return [] }
        var contacts = Dictionary(uniqueKeysWithValues: workspace.contacts.map { ($0.id, $0) })
        let familyName = appModel.activeFamily?.name ?? "Famiglia"
        for member in workspace.members(for: appModel.selectedFamilyID) where member.id != workspace.profile.id {
            contacts[member.id] = ContactSummary(
                id: member.id, displayName: member.displayName, email: member.email,
                source: .family, familyNames: [familyName]
            )
        }
        return contacts.values.sorted { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }
    }

    private var availableRomanContacts: [ContactSummary] {
        let selected = Set(romanParticipants.map(\.contactID))
        return availableCommissionedContacts.filter { !selected.contains($0.id) }
    }

    private var romanShares: [Money] {
        guard let amount = parsedAmount else {
            return Array(repeating: .zero, count: romanParticipants.count + 1)
        }
        return LedgerCalculations.installmentAmounts(total: amount, count: romanParticipants.count + 1)
    }

    private var romanSplitDrafts: [MovementSplitEditorDraft] {
        romanParticipants.enumerated().map { index, participant in
            let share = romanShares.indices.contains(index + 1) ? romanShares[index + 1] : .zero
            return MovementSplitEditorDraft(
                id: "roman-\(participant.contactID.uuidString.lowercased())",
                amountText: NSDecimalNumber(decimal: share.decimal).stringValue.replacingOccurrences(of: ".", with: ","),
                category: nil,
                beneficiary: nil,
                tag: nil,
                isShared: false,
                isCommissioned: true,
                isReimbursement: participant.compensateDebt,
                commissionedRecipientID: participant.contactID,
                commissionedInviteEmail: ""
            )
        }
    }

    private var activeSplitDrafts: [MovementSplitEditorDraft] {
        composerMode == .roman ? romanSplitDrafts : splitDrafts
    }

    private var activeSplitsEnabled: Bool {
        composerMode == .roman || splitsEnabled
    }

    private func romanCompensationBinding(for id: UUID) -> Binding<Bool> {
        Binding(
            get: { romanParticipants.first { $0.id == id }?.compensateDebt ?? false },
            set: { value in
                guard let index = romanParticipants.firstIndex(where: { $0.id == id }) else { return }
                romanParticipants[index].compensateDebt = value
            }
        )
    }

    private var reimbursementOptions: [ReimbursementPlanItem] {
        guard
            appModel.selectedFamilyID != nil,
            case .loaded(let workspace) = appModel.workspaceState,
            case .loaded(let snapshot) = appModel.ledgerState
        else { return [] }
        return LedgerCalculations.reimbursementPlan(
            in: snapshot,
            memberIDs: workspace.members(for: appModel.selectedFamilyID).map { $0.id.uuidString.lowercased() }
        )
    }

    private func reimbursementMemberName(_ memberID: String) -> String {
        guard case .loaded(let workspace) = appModel.workspaceState else { return "Membro della famiglia" }
        return workspace.members(for: appModel.selectedFamilyID)
            .first { $0.id.uuidString.caseInsensitiveCompare(memberID) == .orderedSame }?.displayName
            ?? "Membro della famiglia"
    }

    private var availableComposerModes: [ComposerMode] {
        movement == nil ? ComposerMode.allCases : [.expense, .income]
    }

    private var effectivelyShared: Bool {
        !commissionedPurchase && (isShared || selectedAccount?.familyID != nil)
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
            && (!mainAllocationNeedsClassification || category != nil)
            && (!counterpartyRequired || counterparty != nil)
            && splitsAreValid
            && (!commissionedPurchase || validMainCommissionTarget)
            && reimbursementAmountsAreValid
            && (!hasCommissionedAllocation || !descriptionText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    private var validationMessage: String {
        if selectedAccount == nil { return "Seleziona il conto del movimento." }
        if mainAllocationNeedsClassification, category == nil { return "Seleziona o crea una categoria." }
        if counterpartyRequired, counterparty == nil { return "Seleziona o crea un \(counterpartyLabel.lowercased())." }
        if commissionedPurchase, !validMainCommissionTarget { return reimbursementPurchase ? "Seleziona il membro della famiglia da rimborsare." : "Seleziona un contatto o inserisci un indirizzo email valido." }
        if !reimbursementAmountsAreValid { return "L’importo usato come rimborso supera il credito disponibile del membro scelto." }
        if hasCommissionedAllocation, descriptionText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "Inserisci una descrizione riconoscibile per il destinatario." }
        if activeSplitsEnabled, activeSplitDrafts.isEmpty { return composerMode == .roman ? "Aggiungi almeno un contatto." : "Aggiungi almeno un parziale." }
        if activeSplitsEnabled, activeSplitDrafts.contains(where: { item in
            parsedSplitAmount(item.amountText) == nil
                || (item.isCommissioned ? !validCommissionTarget(item) : item.category == nil)
        }) {
            return "Completa ogni parziale con destinazione, categoria e importo valido."
        }
        if splitTotal > Money(decimal: parsedAmount ?? 0) {
            return "La somma dei parziali non può superare l’importo totale."
        }
        return "Controlla l’importo inserito."
    }

    private var validCommissionedInviteEmail: Bool {
        let email = commissionedInviteEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        return email.contains("@") && email.contains(".")
    }

    private var validMainCommissionTarget: Bool {
        if reimbursementPurchase {
            guard let commissionedRecipientID else { return false }
            return reimbursementOptions.contains {
                $0.memberID.caseInsensitiveCompare(commissionedRecipientID.uuidString) == .orderedSame
            }
        }
        return commissionedRecipientID != nil || validCommissionedInviteEmail
    }

    private var reimbursementAmountsAreValid: Bool {
        let limits = Dictionary(uniqueKeysWithValues: reimbursementOptions.map {
            ($0.memberID.lowercased(), $0.availableCredit)
        })
        var totals: [String: Money] = [:]
        if reimbursementPurchase, let commissionedRecipientID {
            let amount = activeSplitsEnabled ? splitRemainder : Money(decimal: parsedAmount ?? 0)
            totals[commissionedRecipientID.uuidString.lowercased(), default: .zero] = amount
        }
        for item in activeSplitDrafts where item.isReimbursement {
            guard let recipientID = item.commissionedRecipientID,
                  let amount = parsedSplitAmount(item.amountText) else { continue }
            totals[recipientID.uuidString.lowercased(), default: .zero] =
                totals[recipientID.uuidString.lowercased(), default: .zero] + Money(decimal: amount)
        }
        return totals.allSatisfy { memberID, total in total <= limits[memberID, default: .zero] }
    }

    private var hasCommissionedAllocation: Bool {
        commissionedPurchase || activeSplitDrafts.contains(where: \.isCommissioned)
    }

    private var mainAllocationExists: Bool {
        type != .expense || !activeSplitsEnabled || splitRemainder > .zero
    }

    private var mainAllocationNeedsClassification: Bool {
        mainAllocationExists && !commissionedPurchase
    }

    private var counterpartyRequired: Bool {
        if type == .income { return true }
        if !activeSplitsEnabled { return !commissionedPurchase }
        return activeSplitDrafts.contains { !$0.isCommissioned }
            || (splitRemainder > .zero && !commissionedPurchase)
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
                accountID = movement.accountID == CommissionedPurchaseAccounting.debtCompensationAccountID
                    ? movement.accountID
                    : usableAccounts(in: loaded).contains { $0.id == movement.accountID }
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
                        tag: loaded.tags.first { $0.id == split.tagID },
                        isShared: split.shared,
                        isCommissioned: split.commissionedPurchaseID != nil,
                        isReimbursement: false,
                        commissionedRecipientID: nil,
                        commissionedInviteEmail: ""
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
            isFormValid,
            let amount = parsedAmount,
            let account = selectedAccount
        else {
            return
        }

        guard let primaryCategory = category ?? resolvedSplits?.first?.category,
              let primaryCounterparty = counterparty
                ?? resolvedSplits?.compactMap(\.beneficiary).first
                ?? commissionBeneficiaryFallback
        else { return }

        isSaving = true
        focusedField = nil
        let cleanDescription = descriptionText.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanComments = comments.trimmingCharacters(in: .whitespacesAndNewlines)
        let mainCommissioned = commissionedPurchase && splitRemainder > .zero
        let allAllocationsCommissioned = (splitRemainder == .zero || mainCommissioned)
            && activeSplitDrafts.allSatisfy(\.isCommissioned)
        let reimbursementDrafts = purchaseReimbursementDrafts(account: account, description: cleanDescription)
        let draft = MovementDraft(
            id: draftID,
            type: type,
            amount: amount,
            date: date,
            description: cleanDescription.isEmpty ? primaryCategory.name : cleanDescription,
            comments: cleanComments.isEmpty ? nil : cleanComments,
            account: account,
            category: primaryCategory,
            counterparty: primaryCounterparty,
            tag: tag,
            isShared: effectivelyShared,
            splits: resolvedSplits,
            affectsAccountBalance: isDebtCompensationMovement ? false : isBeforeOpeningBalance ? affectsAccountBalance : nil,
            installment: installmentDraft,
            commissionedPurchaseID: mainCommissioned ? "commissioned-purchase-\(draftID)" : movement?.commissionedPurchaseID,
            paidByUserID: movement?.paidByUserID.flatMap(UUID.init(uuidString:)),
            excludeFromReports: allAllocationsCommissioned || movement?.excludeFromReports == true
        )

        Task {
            do {
                if movement == nil {
                    if mainCommissioned, !reimbursementPurchase {
                        let invitationID = commissionedRecipientID == nil
                            ? try await appModel.inviteContact(email: commissionedInviteEmail)
                            : nil
                        let recipientID = commissionedRecipientID
                        let contact = recipientID.flatMap { id in availableCommissionedContacts.first { $0.id == id } }
                        try await appModel.createCommissionedPurchase(CommissionedPurchaseDraft(
                            id: "commissioned-purchase-\(draftID)", recipientID: recipientID, invitationID: invitationID,
                            familyID: contact?.source == .family ? appModel.selectedFamilyID : nil,
                            reimbursementID: nil, payerMovementID: draftID, amount: splitRemainder.decimal,
                            purchaseDate: Self.dayFormatter.string(from: date), description: cleanDescription
                        ))
                    }
                    for item in activeSplitDrafts where item.isCommissioned && !item.isReimbursement {
                        guard let partialAmount = parsedSplitAmount(item.amountText) else { continue }
                        let invitationID = item.commissionedRecipientID == nil
                            ? try await appModel.inviteContact(email: item.commissionedInviteEmail)
                            : nil
                        let contact = item.commissionedRecipientID.flatMap { id in
                            availableCommissionedContacts.first { $0.id == id }
                        }
                        try await appModel.createCommissionedPurchase(CommissionedPurchaseDraft(
                            id: "commissioned-purchase-\(item.id)",
                            recipientID: item.commissionedRecipientID,
                            invitationID: invitationID,
                            familyID: contact?.source == .family ? appModel.selectedFamilyID : nil,
                            reimbursementID: nil,
                            payerMovementID: draftID,
                            amount: partialAmount,
                            purchaseDate: Self.dayFormatter.string(from: date),
                            description: cleanDescription
                        ))
                    }
                    if !reimbursementDrafts.isEmpty {
                        _ = try await appModel.createPurchaseReimbursementsForExistingMovement(reimbursementDrafts)
                    }
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

    private func purchaseReimbursementDrafts(
        account: AccountSummary,
        description: String
    ) -> [ReimbursementDraft] {
        guard movement == nil,
              case .loaded(let workspace) = appModel.workspaceState
        else { return [] }
        var allocations: [(id: String, purchaseID: String, amount: Decimal, recipientID: UUID)] = []
        if reimbursementPurchase, let commissionedRecipientID {
            let amount = activeSplitsEnabled ? splitRemainder.decimal : parsedAmount ?? 0
            if amount > 0 {
                allocations.append((
                    "reimbursement-\(UUID().uuidString.lowercased())",
                    "commissioned-purchase-\(draftID)", amount, commissionedRecipientID
                ))
            }
        }
        for item in activeSplitDrafts where item.isReimbursement {
            guard let amount = parsedSplitAmount(item.amountText),
                  let recipientID = item.commissionedRecipientID else { continue }
            allocations.append((
                "reimbursement-\(UUID().uuidString.lowercased())",
                "commissioned-purchase-\(item.id)", amount, recipientID
            ))
        }
        let groupID = allocations.count > 1 ? "reimbursement-group-\(UUID().uuidString.lowercased())" : nil
        return allocations.map { allocation in
            ReimbursementDraft(
                id: allocation.id,
                groupID: groupID,
                amount: allocation.amount,
                counterpartID: allocation.recipientID,
                fromID: workspace.profile.id,
                toID: allocation.recipientID,
                fromAccountID: account.id,
                toAccountID: nil,
                date: date,
                settlementMethod: .purchase,
                purchaseDescription: description,
                commissionedPurchaseID: allocation.purchaseID,
                payerMovementID: draftID
            )
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
            commissionedPurchase = false
            reimbursementPurchase = false
            commissionedRecipientID = nil
            commissionedInviteEmail = ""
            if mode == .roman {
                installmentsEnabled = false
                splitsEnabled = false
                splitDrafts = []
                isShared = false
                if selectedAccount?.familyID != nil {
                    accountID = options.accounts.first { $0.familyID == nil }?.id ?? ""
                }
            } else {
                romanParticipants = []
                romanContactID = nil
            }
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
            romanParticipants = []
            romanContactID = nil
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
        }
    }

    private func updateBalanceImpact() {
        affectsAccountBalance = !isBeforeOpeningBalance
    }

    private func accountLabel(_ account: AccountSummary) -> String {
        account.familyID == nil ? account.name : "\(account.name) · Famiglia"
    }

    private func usableAccounts(in options: MovementOptions) -> [AccountSummary] {
        if commissionedPurchase || activeSplitDrafts.contains(where: \.isCommissioned) {
            return options.accounts.filter { $0.familyID == nil }
        }
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
        guard activeSplitsEnabled else { return nil }
        let familyAccount = selectedAccount?.familyID != nil
        return activeSplitDrafts.compactMap { item in
            guard let amount = parsedSplitAmount(item.amountText) else { return nil }
            let category = item.isCommissioned ? commissionCategory : item.category
            guard let category else { return nil }
            return MovementSplitDraft(
                id: item.id,
                amount: amount,
                category: category,
                beneficiary: item.isCommissioned ? commissionBeneficiary(for: item) : counterparty,
                tag: item.isCommissioned ? nil : item.tag,
                isShared: !item.isCommissioned && (familyAccount || item.isShared),
                commissionedPurchaseID: item.isCommissioned ? "commissioned-purchase-\(item.id)" : nil,
                excludeFromReports: item.isCommissioned
            )
        }
    }

    private var splitTotal: Money {
        activeSplitDrafts.reduce(.zero) { total, item in
            total + Money(decimal: parsedSplitAmount(item.amountText) ?? 0)
        }
    }

    private var splitRemainder: Money {
        Money(cents: max(0, (parsedAmount.map { Money(decimal: $0).cents } ?? 0) - splitTotal.cents))
    }

    private var splitsAreValid: Bool {
        guard activeSplitsEnabled else { return true }
        guard !activeSplitDrafts.isEmpty,
              activeSplitDrafts.allSatisfy({ item in
                  parsedSplitAmount(item.amountText) != nil
                      && (item.isCommissioned ? validCommissionTarget(item) : item.category != nil)
              }),
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

    private var commissionCategory: LedgerDirectoryItem? {
        guard let currentUserID = currentUserIDString else { return nil }
        return options?.categories.first { $0.name == "Acquisti per conto terzi" && $0.scope == .personal }
            ?? LedgerDirectoryItem(
                id: "category-commissioned-\(currentUserID)", name: "Acquisti per conto terzi",
                scope: .personal, ownerID: currentUserID, movementType: .expense, color: "#687078"
            )
    }

    private func commissionBeneficiary(for item: MovementSplitEditorDraft) -> LedgerDirectoryItem? {
        guard let currentUserID = currentUserIDString else { return nil }
        let name = item.commissionedRecipientID.flatMap { id in
            availableCommissionedContacts.first { $0.id == id }?.displayName
        } ?? "Contatto"
        return LedgerDirectoryItem(
            id: "beneficiary-contact-\(item.commissionedRecipientID?.uuidString.lowercased() ?? item.id)",
            name: name, scope: .personal, ownerID: currentUserID, movementType: nil, color: nil
        )
    }

    private var commissionBeneficiaryFallback: LedgerDirectoryItem? {
        guard let item = activeSplitDrafts.first(where: \.isCommissioned) else { return nil }
        return commissionBeneficiary(for: item)
    }

    private var currentUserIDString: String? {
        guard case .loaded(let workspace) = appModel.workspaceState else { return nil }
        return workspace.profile.id.uuidString.lowercased()
    }

    private func validCommissionTarget(_ item: MovementSplitEditorDraft) -> Bool {
        if item.isReimbursement {
            guard let recipientID = item.commissionedRecipientID else { return false }
            return reimbursementOptions.contains {
                $0.memberID.caseInsensitiveCompare(recipientID.uuidString) == .orderedSame
            }
        }
        if item.commissionedRecipientID != nil { return true }
        let email = item.commissionedInviteEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        return email.contains("@") && email.contains(".")
    }

    private func splitModeBinding(for item: MovementSplitEditorDraft) -> Binding<PurchaseAllocationMode> {
        Binding(
            get: {
                guard let current = splitDrafts.first(where: { $0.id == item.id }) else { return .personal }
                if current.isReimbursement { return .reimbursement }
                if current.isCommissioned { return .commissioned }
                return selectedAccount?.familyID != nil || current.isShared ? .shared : .personal
            },
            set: { mode in
                guard let index = splitDrafts.firstIndex(where: { $0.id == item.id }) else { return }
                let external = mode == .commissioned || mode == .reimbursement
                splitDrafts[index].isCommissioned = external
                splitDrafts[index].isReimbursement = mode == .reimbursement
                splitDrafts[index].isShared = mode == .shared
                if !external {
                    splitDrafts[index].commissionedRecipientID = nil
                    splitDrafts[index].commissionedInviteEmail = ""
                } else {
                    splitDrafts[index].commissionedInviteEmail = ""
                    splitDrafts[index].commissionedRecipientID = mode == .reimbursement
                        ? reimbursementOptions.first.flatMap { UUID(uuidString: $0.memberID) }
                        : availableCommissionedContacts.first?.id
                    if mode != .shared, selectedAccount?.familyID != nil {
                        accountID = options?.accounts.first { $0.familyID == nil }?.id ?? ""
                    }
                }
            }
        )
    }

    @ViewBuilder
    private var splitSection: some View {
        Section {
            Picker("Tipo di acquisto", selection: $splitsEnabled) {
                Text("Acquisto unico").tag(false)
                Text("Acquisto multiplo").tag(true)
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

                        Picker("Tipo di spesa", selection: splitModeBinding(for: item)) {
                            ForEach(PurchaseAllocationMode.allCases) { mode in
                                Text(mode.title).tag(mode)
                                    .disabled(mode == .reimbursement && reimbursementOptions.isEmpty)
                            }
                        }

                        if item.isCommissioned {
                            if item.isReimbursement {
                                Picker(
                                    "Rimborso a",
                                    selection: splitFieldBinding(
                                        id: item.id,
                                        keyPath: \.commissionedRecipientID,
                                        fallback: item.commissionedRecipientID
                                    )
                                ) {
                                    Text("Scegli il membro da rimborsare").tag(UUID?.none)
                                    ForEach(reimbursementOptions) { option in
                                        if let memberID = UUID(uuidString: option.memberID) {
                                            Text("\(reimbursementMemberName(option.memberID)) · fino a \(option.availableCredit.euroFormatted)")
                                                .tag(Optional(memberID))
                                        }
                                    }
                                }
                            } else {
                                Picker(
                                    "Committente",
                                    selection: splitFieldBinding(
                                        id: item.id,
                                        keyPath: \.commissionedRecipientID,
                                        fallback: item.commissionedRecipientID
                                    )
                                ) {
                                    Text("Invita un nuovo contatto").tag(UUID?.none)
                                    ForEach(availableCommissionedContacts) { contact in
                                        Text(contact.displayName + (contact.source == .family ? " · famiglia" : ""))
                                            .tag(Optional(contact.id))
                                    }
                                }
                                if item.commissionedRecipientID == nil {
                                    TextField(
                                        "Email da invitare",
                                        text: splitFieldBinding(
                                            id: item.id,
                                            keyPath: \.commissionedInviteEmail,
                                            fallback: item.commissionedInviteEmail
                                        )
                                    )
#if os(iOS)
                                    .textInputAutocapitalization(.never)
                                    .keyboardType(.emailAddress)
#endif
                                    .autocorrectionDisabled()
                                }
                            }
                        } else {

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
                            splitDirectorySheet = SplitDirectorySheetContext(split: item, kind: .tag)
                        } label: {
                            splitDirectoryRow(title: "Tag", value: item.tag?.name ?? "Facoltativo")
                        }
                        .buttonStyle(.plain)

                        if splitModeBinding(for: item).wrappedValue == .shared,
                           let activeFamily = appModel.activeFamily {
                            Picker("Spesa condivisa con", selection: .constant(activeFamily.id)) {
                                Text(activeFamily.name).tag(activeFamily.id)
                            }
                        }
                        }
                    }
                    .padding(.vertical, 4)
                }

                Button("Aggiungi categoria", systemImage: "plus") { addSplit() }
                    .disabled(splitRemainder <= .zero)

                LabeledContent("Importo residuo") {
                    Text(splitRemainder.euroFormatted)
                        .monospacedDigit()
                        .foregroundStyle(splitTotal > Money(decimal: parsedAmount ?? 0) ? .red : .secondary)
                }
            }
        } header: {
            Text("Categorie")
        } footer: {
            if splitsEnabled {
                Text("Ogni riga può essere ordinaria, effettuata per un’altra persona oppure usata come rimborso. Le righe ordinarie possono essere condivise con la famiglia.")
            }
        }
    }

    private func addSplit() {
        splitDrafts.append(MovementSplitEditorDraft(
            id: "movement-split-\(UUID().uuidString.lowercased())",
            amountText: "",
            category: nil,
            beneficiary: nil,
            tag: nil,
            isShared: selectedAccount?.familyID != nil || isShared,
            isCommissioned: false,
            isReimbursement: false,
            commissionedRecipientID: nil,
            commissionedInviteEmail: ""
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
        case .tag:
            DirectorySelectionView(
                title: "Tag parziale",
                prompt: "Inserisci tag",
                items: options?.tags ?? [],
                kind: .tag,
                scope: splitScope(for: context.split),
                selection: splitFieldBinding(
                    id: context.split.id,
                    keyPath: \.tag,
                    fallback: context.split.tag
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

    private enum FocusField: Hashable {
        case amount
        case description
        case comments
    }

    private enum ComposerMode: String, CaseIterable {
        case expense
        case income
        case transfer
        case roman

        var label: String {
            switch self {
            case .expense: "Spesa"
            case .income: "Entrata"
            case .transfer: "Giro fondi"
            case .roman: "Paga alla romana"
            }
        }

        var description: String {
            switch self {
            case .expense: "Acquisto unico o multiplo per te, la famiglia o un altro utente."
            case .income: "Entrata personale o della famiglia."
            case .transfer: "Sposta fondi da un conto a un altro."
            case .roman: "Dividi una spesa occasionale in parti uguali."
            }
        }

        var tint: Color {
            switch self {
            case .expense: .red
            case .income: .green
            case .transfer: .blue
            case .roman: .orange
            }
        }

        var movementKind: MovementKind? {
            switch self {
            case .expense, .roman: .expense
            case .income: .income
            case .transfer: nil
            }
        }
    }

    private enum PurchaseAllocationMode: String, CaseIterable, Identifiable {
        case personal
        case shared
        case commissioned
        case reimbursement

        var id: String { rawValue }
        var title: String {
            switch self {
            case .personal: "Spesa personale"
            case .shared: "Spesa condivisa"
            case .commissioned: "Acquisto per conto di un’altra persona"
            case .reimbursement: "Rimborso tramite acquisto"
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
    var tag: LedgerDirectoryItem?
    var isShared: Bool
    var isCommissioned: Bool
    var isReimbursement: Bool
    var commissionedRecipientID: UUID?
    var commissionedInviteEmail: String
}

private struct RomanParticipantDraft: Identifiable, Equatable {
    let contactID: UUID
    var compensateDebt = false
    var id: UUID { contactID }
}

private struct SplitDirectorySheetContext: Identifiable {
    enum Kind: String {
        case category
        case tag
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
