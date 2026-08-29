import SwiftUI

struct ContactsView: View {
    let appModel: AppModel

    @State private var invitationPresented = false
    @State private var review: CommissionedPurchaseSummary?
    @State private var removing: ContactSummary?
    @State private var invitationToWithdraw: ContactInvitationSummary?
    @State private var errorMessage: String?

    var body: some View {
        GeometryReader { geometry in
            content(persistentActions: usesPersistentActions(geometry.size))
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Invita contatto", systemImage: "person.badge.plus") { invitationPresented = true }
                    .labelStyle(.titleAndIcon)
            }
        }
        .sheet(isPresented: $invitationPresented) { ContactInvitationView(appModel: appModel) }
        .sheet(item: $review) { CommissionedPurchaseReviewView(appModel: appModel, purchase: $0) }
        .confirmationDialog("Rimuovere il contatto?", isPresented: Binding(
            get: { removing != nil }, set: { if !$0 { removing = nil } }
        ), titleVisibility: .visible) {
            Button("Rimuovi dai contatti", role: .destructive) {
                guard let contact = removing else { return }
                Task { do { try await appModel.removeContact(contact) } catch { errorMessage = error.localizedDescription } }
            }
            Button("Annulla", role: .cancel) { removing = nil }
        } message: { Text("I movimenti che vi coinvolgono resteranno nella contabilità di entrambi.") }
        .confirmationDialog("Ritirare l’invito?", isPresented: Binding(
            get: { invitationToWithdraw != nil }, set: { if !$0 { invitationToWithdraw = nil } }
        ), titleVisibility: .visible) {
            Button("Ritira invito", role: .destructive) {
                guard let invitation = invitationToWithdraw else { return }
                invitationToWithdraw = nil
                Task {
                    do { try await appModel.withdrawContactInvitation(invitation.id) }
                    catch { errorMessage = error.localizedDescription }
                }
            }
            Button("Annulla", role: .cancel) { invitationToWithdraw = nil }
        } message: {
            Text("Il link non sarà più valido. Le richieste d’acquisto ancora pendenti collegate all’invito verranno annullate.")
        }
        .alert("Operazione non riuscita", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button("OK", role: .cancel) { errorMessage = nil }
        } message: { Text(errorMessage ?? "Riprova tra poco.") }
    }

    @ViewBuilder private func content(persistentActions: Bool) -> some View {
        switch (appModel.workspaceState, appModel.ledgerState) {
        case (.loaded(let workspace), .loaded(let snapshot)):
            let contacts = resolvedContacts(workspace)
            let incoming = workspace.commissionedPurchases.filter { $0.recipientID == workspace.profile.id && $0.status == .pending }
            List {
                if !incoming.isEmpty {
                    Section("Richieste da confermare") {
                        ForEach(incoming) { purchase in
                            Button { review = purchase } label: {
                                LabeledContent {
                                    Text(purchase.amount.euroFormatted).fontWeight(.semibold)
                                } label: {
                                    Label(purchase.description, systemImage: "bag.badge.questionmark")
                                }
                            }
                        }
                    }
                }
                Section {
                    ForEach(contacts) { contact in
                        let purchaseIDs = Set(workspace.commissionedPurchases.filter {
                            $0.payerID == contact.id || $0.recipientID == contact.id
                        }.map(\.id))
                        if persistentActions {
                            HStack {
                                NavigationLink { ContactMovementsView(snapshot: snapshot, contact: contact, purchaseIDs: purchaseIDs) } label: { contactLabel(contact) }
                                if contact.source == .friend {
                                    Button(role: .destructive) { removing = contact } label: { Image(systemName: "trash") }
                                        .buttonStyle(.borderless).help("Rimuovi \(contact.displayName)")
                                }
                            }
                        } else {
                            NavigationLink { ContactMovementsView(snapshot: snapshot, contact: contact, purchaseIDs: purchaseIDs) } label: { contactLabel(contact) }
                                .swipeActions(edge: .trailing) {
                                    if contact.source == .friend { Button("Elimina", systemImage: "trash", role: .destructive) { removing = contact } }
                                }
                        }
                    }
                } header: { Text("La tua cerchia") } footer: { Text("I familiari sono disponibili automaticamente e sono indicati dall’icona della famiglia.") }
                if !workspace.contactInvitations.isEmpty {
                    Section("Inviti in attesa") {
                        ForEach(workspace.contactInvitations) { invite in
                            HStack {
                                Label(invite.email, systemImage: "envelope.badge")
                                Spacer()
                                Button("Ritira", role: .destructive) { invitationToWithdraw = invite }
                                    .buttonStyle(.borderless)
                            }
                        }
                    }
                }
            }
        case (.failed(let message), _), (_, .failed(let message)):
            ContentUnavailableView("Contatti non disponibili", systemImage: "wifi.exclamationmark", description: Text(message))
        default:
            ProgressView("Caricamento contatti…").frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func resolvedContacts(_ workspace: FamilyWorkspace) -> [ContactSummary] {
        var result = Dictionary(uniqueKeysWithValues: workspace.contacts.map { ($0.id, $0) })
        let familyNames = Dictionary(uniqueKeysWithValues: workspace.families.map { ($0.id, $0.name) })
        for member in workspace.members where member.id != workspace.profile.id {
            let names = member.familyID.flatMap { familyNames[$0] }.map { [$0] } ?? []
            result[member.id] = ContactSummary(id: member.id, displayName: member.displayName, email: member.email, source: .family, familyNames: names)
        }
        return result.values.sorted { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }
    }

    private func contactLabel(_ contact: ContactSummary) -> some View {
        Label {
            VStack(alignment: .leading) {
                Text(contact.displayName)
                Text(contact.source == .family ? "Famiglia · \(contact.familyNames.joined(separator: ", "))" : contact.email ?? "Contatto")
                    .font(.caption).foregroundStyle(.secondary)
            }
        } icon: { Image(systemName: contact.source == .family ? "person.2.fill" : "person.crop.circle") }
    }

    private func usesPersistentActions(_ size: CGSize) -> Bool {
        #if os(macOS)
        true
        #else
        UIDevice.current.userInterfaceIdiom == .pad && size.width > size.height
        #endif
    }
}

private struct ContactInvitationView: View {
    let appModel: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var saving = false
    @State private var errorMessage: String?
    var body: some View {
        NavigationStack { Form { Section("Nuovo contatto") { emailField } } .navigationTitle("Invita contatto").toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Annulla") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button("Invia") { Task { saving = true; do { _ = try await appModel.inviteContact(email: email); dismiss() } catch { errorMessage = error.localizedDescription; saving = false } } }.disabled(saving || !email.contains("@")) }
        } }.alert("Invito non inviato", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) { Button("OK", role: .cancel) {} } message: { Text(errorMessage ?? "Riprova.") }
    }
    @ViewBuilder private var emailField: some View {
        #if os(iOS)
        TextField("Email", text: $email).textContentType(.emailAddress).textInputAutocapitalization(.never).keyboardType(.emailAddress)
        #else
        TextField("Email", text: $email).textContentType(.emailAddress)
        #endif
    }
}

struct CommissionedPurchaseReviewView: View {
    let appModel: AppModel
    let purchase: CommissionedPurchaseSummary
    @Environment(\.dismiss) private var dismiss
    @State private var options: MovementOptions?
    @State private var categoryID = ""
    @State private var accountID = ""
    @State private var saving = false
    @State private var errorMessage: String?
    var body: some View {
        NavigationStack { Form {
            Section("Acquisto") { LabeledContent("Descrizione", value: purchase.description); LabeledContent("Importo", value: purchase.amount.euroFormatted) }
            if let options {
                Section("Catalogazione personale") {
                    Picker("Categoria", selection: $categoryID) { ForEach(options.categories.filter { $0.scope == .personal && $0.movementType == .expense }) { Text($0.name).tag($0.id) } }
                    if isPurchaseReimbursement {
                        LabeledContent("Origine contabile", value: CommissionedPurchaseAccounting.debtCompensationAccountLabel)
                        Text("L’acquisto entra nelle statistiche e compensa per intero il debito del pagante, senza usare un conto.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        Picker("Conto", selection: $accountID) { ForEach(options.accounts.filter { $0.familyID == nil }) { Text($0.name).tag($0.id) } }
                        Text("Il movimento entra nelle statistiche e viene addebitato al conto scelto per rimborsare chi ha effettuato l’acquisto.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }.navigationTitle("Conferma acquisto").toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Rifiuta", role: .destructive) { respond(accepted: false) } }
            ToolbarItem(placement: .confirmationAction) { Button("Conferma") { respond(accepted: true) }.disabled(saving || categoryID.isEmpty || (!isPurchaseReimbursement && accountID.isEmpty)) }
        }.task { await load() } }
        .alert("Operazione non riuscita", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) { Button("OK", role: .cancel) {} } message: { Text(errorMessage ?? "Riprova.") }
    }
    private func load() async {
        do { let loaded = try await appModel.loadMovementOptions(); options = loaded; categoryID = loaded.categories.first { $0.scope == .personal && $0.movementType == .expense }?.id ?? ""; accountID = loaded.accounts.first { $0.familyID == nil }?.id ?? "" } catch { errorMessage = error.localizedDescription }
    }
    private func respond(accepted: Bool) {
        Task { saving = true; do {
            if !accepted { try await appModel.respondToCommissionedPurchase(.init(id: purchase.id, accepted: false, movementID: nil, categoryID: nil, accountID: nil)); dismiss(); return }
            guard let options, let category = options.categories.first(where: { $0.id == categoryID }) else { return }
            let account = isPurchaseReimbursement
                ? CommissionedPurchaseAccounting.debtCompensationAccount
                : options.accounts.first(where: { $0.id == accountID })
            guard let account else { return }
            let movementID = UUID().uuidString.lowercased()
            let counterparty = LedgerDirectoryItem(id: "beneficiary-contact-\(purchase.payerID.uuidString.lowercased())", name: "Acquisto per mio conto", scope: .personal, ownerID: nil, movementType: nil, color: nil)
            try await appModel.createMovement(MovementDraft(id: movementID, type: .expense, amount: purchase.amount.decimal, date: Self.dayFormatter.date(from: purchase.purchaseDate) ?? Date(), description: purchase.description, comments: nil, account: account, category: category, counterparty: counterparty, isShared: false, affectsAccountBalance: isPurchaseReimbursement ? false : nil, commissionedPurchaseID: purchase.id, paidByUserID: purchase.payerID))
            try await appModel.respondToCommissionedPurchase(.init(id: purchase.id, accepted: true, movementID: movementID, categoryID: categoryID, accountID: account.id)); dismiss()
        } catch { errorMessage = error.localizedDescription; saving = false } }
    }
    private var isPurchaseReimbursement: Bool { purchase.reimbursementID != nil }
    private static let dayFormatter: DateFormatter = { let value = DateFormatter(); value.locale = Locale(identifier: "en_US_POSIX"); value.calendar = .current; value.dateFormat = "yyyy-MM-dd"; return value }()
}

private struct ContactMovementsView: View {
    let snapshot: LedgerSnapshot
    let contact: ContactSummary
    let purchaseIDs: Set<String>
    var body: some View {
        let movements = snapshot.movements.filter { $0.commissionedPurchaseID.map(purchaseIDs.contains) == true }.sorted { $0.date > $1.date }
        List(movements) { movement in VStack(alignment: .leading) { HStack { Text(movement.description).fontWeight(.semibold); Spacer(); Text(movement.amount.euroFormatted) }; Text(movement.date).font(.caption).foregroundStyle(.secondary) } }.navigationTitle(contact.displayName).overlay { if movements.isEmpty { ContentUnavailableView("Nessun movimento", systemImage: "list.bullet.rectangle") } }
    }
}
