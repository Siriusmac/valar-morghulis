import SwiftUI

struct ReimbursementComposerView: View {
    let appModel: AppModel

    @Environment(\.dismiss) private var dismiss
    @State private var counterpartID: UUID?
    @State private var amountText = ""
    @State private var fromAccountID = ""
    @State private var toAccountID = ""
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var notificationMessage: String?
    @State private var multiSelections: [String: MultiSelection] = [:]

    var body: some View {
        NavigationStack {
            Group {
                if let workspace, let snapshot, let balance {
                    if isMultiMemberDebt(workspace: workspace, balance: balance) {
                        multiMemberForm(workspace: workspace, snapshot: snapshot, balance: balance)
                    } else if activeFamilyMemberCount > 2 {
                        ContentUnavailableView(
                            "Rimborso non necessario",
                            systemImage: "checkmark.circle",
                            description: Text("Nelle famiglie con più membri il rimborso viene avviato dalla persona che deve saldare il proprio debito.")
                        )
                    } else {
                        reimbursementForm(workspace: workspace, snapshot: snapshot, balance: balance)
                    }
                } else {
                    ContentUnavailableView(
                        "Rimborso non disponibile",
                        systemImage: "scale.3d",
                        description: Text("Attendi il caricamento dei dati della famiglia.")
                    )
                }
            }
            .navigationTitle("Registra rimborso")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annulla") { dismiss() }.disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Invia") { save() }.disabled(!canSave || isSaving)
                }
            }
            .task { prepareDefaults() }
            .alert("Rimborso non registrato", isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "Riprova tra poco.")
            }
            .alert("Rimborso registrato", isPresented: Binding(
                get: { notificationMessage != nil },
                set: { if !$0 { notificationMessage = nil } }
            )) {
                Button("OK") { dismiss() }
            } message: {
                Text(notificationMessage ?? "Il rimborso è stato salvato.")
            }
            .interactiveDismissDisabled(isSaving)
        }
        #if os(iOS)
        .presentationDetents([.large])
        #endif
    }

    private var activeFamilyMemberCount: Int {
        appModel.activeFamily?.memberCount ?? 0
    }

    private func reimbursementForm(
        workspace: FamilyWorkspace,
        snapshot: LedgerSnapshot,
        balance: Money
    ) -> some View {
        Form {
            Section {
                Label(reimbursementLabel(workspace: workspace, balance: balance), systemImage: "scale.3d")
                    .font(.headline)
                LabeledContent("Saldo attuale") {
                    Text(Money(cents: abs(balance.cents)).euroFormatted)
                        .font(.title3.bold().monospacedDigit())
                }
            }

            let counterparts = counterpartMembers(in: workspace)
            if counterparts.count > 1 {
                Section("Membro coinvolto") {
                    Picker("Membro", selection: $counterpartID) {
                        ForEach(counterparts) { member in
                            Text(member.displayName).tag(Optional(member.id))
                        }
                    }
                    .onChange(of: counterpartID) { _, _ in selectDefaultAccounts() }
                }
            }

            Section {
                TextField("Importo", text: $amountText, prompt: Text("0,00 €"))
                    #if os(iOS)
                    .keyboardType(.decimalPad)
                    #endif

                Picker("Conto di origine del debitore", selection: $fromAccountID) {
                    Text("Da specificare dal debitore").tag("")
                    ForEach(debtorAccounts(workspace: workspace, snapshot: snapshot, balance: balance), id: \.id) {
                        Text($0.label).tag($0.id)
                    }
                }

                Picker("Conto di destinazione", selection: $toAccountID) {
                    Text("Da specificare dal creditore").tag("")
                    ForEach(creditorAccounts(workspace: workspace, snapshot: snapshot, balance: balance), id: \.id) {
                        Text($0.label).tag($0.id)
                    }
                }
            } header: {
                Text("Rimborso")
            } footer: {
                Text("L’app registra soltanto la compensazione contabile: non esegue un trasferimento bancario.")
            }

            Section {
                Label("Degli altri membri sono visibili soltanto i nomi dei conti autorizzati.", systemImage: "lock.fill")
                Text("Il rimborso aggiornerà i saldi solo dopo la conferma della controparte, che potrà completare il proprio conto se manca.")
            }
            .font(.footnote)
            .foregroundStyle(.secondary)

            if isSaving {
                Section { ProgressView("Invio per conferma…") }
            }
        }
        .formStyle(.grouped)
    }

    private func multiMemberForm(
        workspace: FamilyWorkspace,
        snapshot: LedgerSnapshot,
        balance: Money
    ) -> some View {
        let plan = reimbursementPlan(workspace: workspace, snapshot: snapshot)
        return Form {
            Section {
                Label("Ripartisci il rimborso", systemImage: "person.2.badge.gearshape")
                    .font(.headline)
                LabeledContent("Da rimborsare") {
                    Text(Money(cents: abs(balance.cents)).euroFormatted)
                        .font(.title3.bold().monospacedDigit())
                }
                Text("Scegli uno o più membri creditori. Ogni persona confermerà soltanto il rimborso che la riguarda.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("Il tuo conto di origine") {
                Picker("Conto", selection: $fromAccountID) {
                    Text("Nessun conto selezionato").tag("")
                    ForEach(personalAccounts(ownerID: workspace.profile.id, workspace: workspace, snapshot: snapshot), id: \.id) {
                        Text($0.label).tag($0.id)
                    }
                }
            }

            if plan.isEmpty {
                ContentUnavailableView(
                    "Nessun credito disponibile",
                    systemImage: "checkmark.circle",
                    description: Text("I crediti risultano già coperti oppure ci sono rimborsi in attesa.")
                )
            } else {
                ForEach(plan) { item in
                    multiRecipientSection(item, workspace: workspace, snapshot: snapshot)
                }
            }

            Section {
                LabeledContent("Totale selezionato") {
                    Text(selectedMultiTotal.euroFormatted).bold().monospacedDigit()
                }
                if !multiSelectionIsValid, selectedMultiTotal > .zero {
                    Label(
                        "Gli importi non possono superare il debito totale o il credito disponibile.",
                        systemImage: "exclamationmark.triangle.fill"
                    )
                    .foregroundStyle(.red)
                }
            } footer: {
                Text("I rimborsi sono separati e aggiornano i saldi soltanto dopo le rispettive conferme.")
            }

            if isSaving {
                Section { ProgressView("Invio dei rimborsi…") }
            }
        }
        .formStyle(.grouped)
    }

    @ViewBuilder
    private func multiRecipientSection(
        _ item: ReimbursementPlanItem,
        workspace: FamilyWorkspace,
        snapshot: LedgerSnapshot
    ) -> some View {
        let memberName = workspace.members(for: appModel.selectedFamilyID)
            .first { $0.id.uuidString.caseInsensitiveCompare(item.memberID) == .orderedSame }?.displayName
            ?? "Membro"
        let accounts = personalAccounts(
            ownerID: UUID(uuidString: item.memberID) ?? UUID(),
            workspace: workspace,
            snapshot: snapshot
        )
        Section {
            Toggle(isOn: multiSelectedBinding(item.memberID)) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(memberName).bold()
                    Text("Credito disponibile: \(item.availableCredit.euroFormatted)")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }

            if multiSelections[item.memberID]?.selected == true {
                TextField("Importo", text: multiAmountBinding(item.memberID), prompt: Text("0,00 €"))
                    #if os(iOS)
                    .keyboardType(.decimalPad)
                    #endif
                Picker("Conto di destinazione", selection: multiDestinationBinding(item.memberID)) {
                    Text("Lo specifica il destinatario").tag("")
                    ForEach(accounts, id: \.id) { Text($0.label).tag($0.id) }
                }
            }
        } header: {
            Text("Destinatario")
        }
    }

    private var workspace: FamilyWorkspace? {
        guard case .loaded(let workspace) = appModel.workspaceState else { return nil }
        return workspace
    }

    private var snapshot: LedgerSnapshot? {
        guard case .loaded(let snapshot) = appModel.ledgerState else { return nil }
        return snapshot
    }

    private var balance: Money? {
        snapshot.map { LedgerCalculations.sharedBalance(in: $0) }
    }

    private var parsedAmount: Decimal? {
        let text = amountText.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalized = text.contains(",")
            ? text.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".")
            : text
        guard let value = Decimal(string: normalized), value > 0 else { return nil }
        return value
    }

    private var canSave: Bool {
        guard let workspace, let balance else { return false }
        if isMultiMemberDebt(workspace: workspace, balance: balance) {
            return multiSelectionIsValid
        }
        return counterpartID != nil && parsedAmount != nil
    }

    private func prepareDefaults() {
        guard let workspace, let snapshot, let balance else { return }
        if isMultiMemberDebt(workspace: workspace, balance: balance) {
            fromAccountID = personalAccounts(ownerID: workspace.profile.id, workspace: workspace, snapshot: snapshot).first?.id ?? ""
            if multiSelections.isEmpty {
                multiSelections = Dictionary(uniqueKeysWithValues: reimbursementPlan(workspace: workspace, snapshot: snapshot).map { item in
                    let destination = workspace.reimbursementAccounts.first {
                        $0.familyID == appModel.selectedFamilyID
                            && $0.ownerID.uuidString.caseInsensitiveCompare(item.memberID) == .orderedSame
                    }?.accountID ?? ""
                    return (item.memberID, MultiSelection(
                        reimbursementID: "reimbursement-\(UUID().uuidString.lowercased())",
                        selected: true,
                        amountText: item.suggestedAmount.decimal.description.replacingOccurrences(of: ".", with: ","),
                        toAccountID: destination
                    ))
                })
            }
            return
        }
        counterpartID = counterpartMembers(in: workspace).first?.id
        amountText = NSDecimalNumber(decimal: abs(balance.decimal)).stringValue.replacingOccurrences(of: ".", with: ",")
        selectDefaultAccounts()
    }

    private func selectDefaultAccounts() {
        guard let workspace, let snapshot, let balance else { return }
        fromAccountID = debtorAccounts(workspace: workspace, snapshot: snapshot, balance: balance).first?.id ?? ""
        toAccountID = creditorAccounts(workspace: workspace, snapshot: snapshot, balance: balance).first?.id ?? ""
    }

    private func counterpartMembers(in workspace: FamilyWorkspace) -> [FamilyMemberSummary] {
        workspace.members(for: appModel.selectedFamilyID).filter { $0.id != workspace.profile.id }
    }

    private func reimbursementLabel(workspace: FamilyWorkspace, balance: Money) -> String {
        let otherName = counterpartMembers(in: workspace).first { $0.id == counterpartID }?.displayName ?? "la famiglia"
        return balance < .zero ? "Tu rimborsi \(otherName)" : "\(otherName) rimborsa te"
    }

    private func debtorAccounts(workspace: FamilyWorkspace, snapshot: LedgerSnapshot, balance: Money) -> [AccountOption] {
        guard let counterpartID else { return [] }
        let ownerID = balance < .zero ? workspace.profile.id : counterpartID
        return personalAccounts(ownerID: ownerID, workspace: workspace, snapshot: snapshot)
    }

    private func creditorAccounts(workspace: FamilyWorkspace, snapshot: LedgerSnapshot, balance: Money) -> [AccountOption] {
        guard let counterpartID else { return [] }
        let ownerID = balance < .zero ? counterpartID : workspace.profile.id
        var values = personalAccounts(ownerID: ownerID, workspace: workspace, snapshot: snapshot)
        values += snapshot.accounts.filter { $0.familyID != nil }.map {
            AccountOption(id: $0.id, label: "\($0.name) · Condiviso")
        }
        return values
    }

    private func personalAccounts(ownerID: UUID, workspace: FamilyWorkspace, snapshot: LedgerSnapshot) -> [AccountOption] {
        if ownerID == workspace.profile.id {
            return snapshot.accounts.filter { $0.familyID == nil }.map {
                AccountOption(id: $0.id, label: $0.institution.isEmpty ? $0.name : "\($0.name) · \($0.institution)")
            }
        }
        return workspace.reimbursementAccounts
            .filter { $0.familyID == appModel.selectedFamilyID && $0.ownerID == ownerID }
            .map { AccountOption(id: $0.accountID, label: $0.name) }
    }

    private func save() {
        guard
            let workspace,
            let counterpartID,
            let amount = parsedAmount,
            let balance
        else { return }
        if isMultiMemberDebt(workspace: workspace, balance: balance) {
            saveMultiple(workspace: workspace)
            return
        }
        let currentID = workspace.profile.id
        let draft = ReimbursementDraft(
            id: "reimbursement-\(UUID().uuidString.lowercased())",
            groupID: nil,
            amount: amount,
            counterpartID: counterpartID,
            fromID: balance < .zero ? currentID : counterpartID,
            toID: balance < .zero ? counterpartID : currentID,
            fromAccountID: fromAccountID.isEmpty ? nil : fromAccountID,
            toAccountID: toAccountID.isEmpty ? nil : toAccountID,
            date: Date()
        )
        isSaving = true
        Task {
            do {
                let result = try await appModel.createReimbursement(draft)
                if result == .notificationFailed {
                    notificationMessage = "Il rimborso è stato salvato, ma la notifica push non è stata inviata. I dati contabili non verranno duplicati riprovando più tardi."
                    isSaving = false
                } else {
                    dismiss()
                }
            } catch is CancellationError {
                isSaving = false
            } catch {
                errorMessage = error.localizedDescription
                isSaving = false
            }
        }
    }

    private func saveMultiple(workspace: FamilyWorkspace) {
        let selected = multiSelections.compactMap { memberID, selection -> (String, MultiSelection, Decimal)? in
            guard selection.selected, let amount = parsedAmount(selection.amountText) else { return nil }
            return (memberID, selection, amount)
        }
        guard !selected.isEmpty, multiSelectionIsValid else { return }
        let groupID = selected.count > 1 ? "reimbursement-group-\(UUID().uuidString.lowercased())" : nil
        let date = Date()
        let drafts = selected.compactMap { memberID, selection, amount -> ReimbursementDraft? in
            guard let recipientID = UUID(uuidString: memberID) else { return nil }
            return ReimbursementDraft(
                id: selection.reimbursementID,
                groupID: groupID,
                amount: amount,
                counterpartID: recipientID,
                fromID: workspace.profile.id,
                toID: recipientID,
                fromAccountID: fromAccountID.isEmpty ? nil : fromAccountID,
                toAccountID: selection.toAccountID.isEmpty ? nil : selection.toAccountID,
                date: date
            )
        }
        guard drafts.count == selected.count else { return }
        isSaving = true
        Task {
            do {
                let result = try await appModel.createReimbursements(drafts)
                if result == .notificationFailed {
                    notificationMessage = "I rimborsi sono stati salvati, ma una o più notifiche push non sono state inviate."
                    isSaving = false
                } else {
                    dismiss()
                }
            } catch is CancellationError {
                isSaving = false
            } catch {
                errorMessage = error.localizedDescription
                isSaving = false
            }
        }
    }

    private func isMultiMemberDebt(workspace: FamilyWorkspace, balance: Money) -> Bool {
        workspace.members(for: appModel.selectedFamilyID).count > 2 && balance < .zero
    }

    private func reimbursementPlan(workspace: FamilyWorkspace, snapshot: LedgerSnapshot) -> [ReimbursementPlanItem] {
        LedgerCalculations.reimbursementPlan(
            in: snapshot,
            memberIDs: workspace.members(for: appModel.selectedFamilyID).map { $0.id.uuidString.lowercased() }
        )
    }

    private var selectedMultiTotal: Money {
        multiSelections.values.reduce(.zero) { total, selection in
            guard selection.selected, let amount = parsedAmount(selection.amountText) else { return total }
            return total + Money(decimal: amount)
        }
    }

    private var multiSelectionIsValid: Bool {
        guard let workspace, let snapshot else { return false }
        let plan = reimbursementPlan(workspace: workspace, snapshot: snapshot)
        let limits = Dictionary(uniqueKeysWithValues: plan.map { ($0.memberID.lowercased(), $0.availableCredit) })
        let maximum = plan.reduce(Money.zero) { $0 + $1.suggestedAmount }
        let selected = multiSelections.filter { $0.value.selected }
        guard !selected.isEmpty, selectedMultiTotal > .zero, selectedMultiTotal <= maximum else { return false }
        return selected.allSatisfy { memberID, selection in
            guard let amount = parsedAmount(selection.amountText) else { return false }
            return Money(decimal: amount) <= limits[memberID.lowercased(), default: .zero]
        }
    }

    private func parsedAmount(_ text: String) -> Decimal? {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalized = text.contains(",")
            ? text.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".")
            : text
        guard let value = Decimal(string: normalized), value > 0 else { return nil }
        return value
    }

    private func multiSelectedBinding(_ memberID: String) -> Binding<Bool> {
        Binding(
            get: { multiSelections[memberID]?.selected ?? false },
            set: { multiSelections[memberID]?.selected = $0 }
        )
    }

    private func multiAmountBinding(_ memberID: String) -> Binding<String> {
        Binding(
            get: { multiSelections[memberID]?.amountText ?? "" },
            set: { multiSelections[memberID]?.amountText = $0 }
        )
    }

    private func multiDestinationBinding(_ memberID: String) -> Binding<String> {
        Binding(
            get: { multiSelections[memberID]?.toAccountID ?? "" },
            set: { multiSelections[memberID]?.toAccountID = $0 }
        )
    }

    private struct AccountOption: Identifiable {
        let id: String
        let label: String
    }

    private struct MultiSelection: Equatable {
        let reimbursementID: String
        var selected: Bool
        var amountText: String
        var toAccountID: String
    }
}
