import SwiftUI
import UniformTypeIdentifiers

struct AccountSettingsView: View {
    let appModel: AppModel

    @State private var firstName = ""
    @State private var lastName = ""
    @State private var email = ""
    @State private var password = ""
    @State private var passwordConfirmation = ""
    @State private var familyName = ""
    @State private var invitationEmail = ""
    @State private var newFamilyName = ""
    @State private var createsSharedAccount = false
    @State private var newAccountName = "Conto famiglia"
    @State private var newAccountInstitution = ""
    @State private var newAccountBalance = "0"
    @State private var showsCreateFamily = false
    @State private var showsDeleteFamily = false
    @State private var showsDeleteAccount = false
    @State private var preserveFamilyData = true
    @State private var familyConfirmation = ""
    @State private var accountConfirmation = ""
    @State private var busyAction: Action?
    @State private var message: Feedback?
    @State private var exportDocument: AccountExportDocument?
    @State private var showsExporter = false
    @State private var exportFormat = AccountExportFormat.json
    @State private var invitationToWithdraw: FamilyInvitationSummary?

    var body: some View {
        Group {
            switch appModel.workspaceState {
            case .idle, .loading:
                ProgressView("Caricamento account…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let error):
                ContentUnavailableView {
                    Label("Account non disponibile", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(error)
                } actions: {
                    Button("Riprova") { Task { await appModel.reloadWorkspace() } }
                }
            case .loaded(let workspace):
                settingsForm(workspace)
            }
        }
        .alert(item: $message) { feedback in
            Alert(
                title: Text(feedback.isError ? "Operazione non riuscita" : "Operazione completata"),
                message: Text(feedback.text),
                dismissButton: .default(Text("OK"))
            )
        }
        .confirmationDialog("Ritirare l’invito?", isPresented: Binding(
            get: { invitationToWithdraw != nil },
            set: { if !$0 { invitationToWithdraw = nil } }
        ), titleVisibility: .visible) {
            Button("Ritira invito", role: .destructive) {
                guard let invitation = invitationToWithdraw else { return }
                invitationToWithdraw = nil
                run(.invitation, success: "Invito ritirato.") {
                    try await appModel.withdrawInvitation(invitation.id)
                }
            }
            Button("Annulla", role: .cancel) { invitationToWithdraw = nil }
        } message: {
            Text("Il link già ricevuto non potrà più essere utilizzato.")
        }
        .fileExporter(
            isPresented: $showsExporter,
            document: exportDocument,
            contentType: exportFormat.contentType,
            defaultFilename: "skey-account-\(Self.exportDate.string(from: Date()))"
        ) { result in
            if case .failure(let error) = result {
                message = Feedback(text: error.localizedDescription, isError: true)
            }
        }
    }

    private func settingsForm(_ workspace: FamilyWorkspace) -> some View {
        Form {
            profileSection(workspace.profile)
            workspaceSection(workspace)
            securitySection(workspace.profile)

            if let family = appModel.activeFamily {
                familySection(family, workspace: workspace)
            } else {
                Section("Contabilità personale") {
                    Label("Questo spazio è visibile soltanto a te.", systemImage: "lock.fill")
                    Text("Puoi creare una famiglia senza perdere conti e movimenti personali.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            createFamilySection
            deleteAccountSection
        }
        .formStyle(.grouped)
        .task(id: workspace.profile.id) { populate(from: workspace) }
        .onChange(of: appModel.selectedFamilyID) { _, _ in populate(from: workspace) }
        .disabled(busyAction != nil)
    }

    private func profileSection(_ profile: UserProfile) -> some View {
        Section {
            TextField("Nome", text: $firstName)
                .textContentType(.givenName)
            TextField("Cognome", text: $lastName)
                .textContentType(.familyName)
            Button("Salva dati personali", systemImage: "person.crop.circle.badge.checkmark") {
                run(.profile, success: "Nome e cognome aggiornati.") {
                    try await appModel.updateProfile(firstName: firstName, lastName: lastName)
                }
            }
            .disabled(firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                      || lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        } header: {
            Text("Dati personali")
        } footer: {
            Text("Il nome è visibile ai membri delle tue famiglie.")
        }
    }

    private func workspaceSection(_ workspace: FamilyWorkspace) -> some View {
        Section("Le tue famiglie") {
            workspaceButton(id: nil, title: "Solo personale", subtitle: "Movimenti privati")
            ForEach(workspace.families) { family in
                workspaceButton(id: family.id, title: family.name, subtitle: family.role.label)
            }
        }
    }

    private func workspaceButton(id: UUID?, title: String, subtitle: String) -> some View {
        Button {
            appModel.selectFamily(id)
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).foregroundStyle(.primary)
                    Text(subtitle).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if appModel.selectedFamilyID == id {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                }
            }
        }
    }

    private func securitySection(_ profile: UserProfile) -> some View {
        Section {
            TextField("Nuova email", text: $email)
                .textContentType(.emailAddress)
                #if os(iOS)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                #endif
            Button("Cambia email", systemImage: "envelope") {
                run(.email, success: "Controlla le caselle email per confermare il nuovo indirizzo.") {
                    try await appModel.updateEmail(email)
                }
            }
            .disabled(email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == profile.email.lowercased())

            SecureField("Nuova password", text: $password)
                .textContentType(.newPassword)
            SecureField("Conferma password", text: $passwordConfirmation)
                .textContentType(.newPassword)
            Button("Aggiorna password", systemImage: "key.fill") {
                guard password == passwordConfirmation else {
                    message = Feedback(text: "Le password non coincidono.", isError: true)
                    return
                }
                run(.password, success: "Password aggiornata.") {
                    try await appModel.updatePassword(password)
                    password = ""
                    passwordConfirmation = ""
                }
            }
            .disabled(password.count < 8 || passwordConfirmation.count < 8)
        } header: {
            Text("Accesso e sicurezza")
        } footer: {
            Text("La nuova password deve contenere almeno 8 caratteri.")
        }
    }

    @ViewBuilder
    private func familySection(_ family: FamilySummary, workspace: FamilyWorkspace) -> some View {
        Section {
            ForEach(workspace.members(for: family.id)) { member in
                LabeledContent {
                    if let email = member.email { Text(email).foregroundStyle(.secondary) }
                } label: {
                    Label(member.displayName, systemImage: "person.fill")
                }
            }

            if family.role == .admin {
                TextField("Nome della famiglia", text: $familyName)
                Button("Salva nome") {
                    run(.family, success: "Nome della famiglia aggiornato.") {
                        try await appModel.renameActiveFamily(familyName)
                    }
                }
                .disabled(familyName.trimmingCharacters(in: .whitespacesAndNewlines) == family.name)

                TextField("Email del nuovo membro", text: $invitationEmail)
                    .textContentType(.emailAddress)
                    #if os(iOS)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    #endif
                Button("Invia invito", systemImage: "paperplane.fill") {
                    let destination = invitationEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                    run(.invitation, success: "Invito inviato a \(destination).") {
                        try await appModel.inviteMember(destination)
                        invitationEmail = ""
                    }
                }
                .disabled(!invitationEmail.contains("@"))

                let invitations = workspace.invitations.filter { $0.familyID == family.id }
                if invitations.isEmpty {
                    Text("Non ci sono inviti in attesa o rifiutati.")
                        .font(.footnote).foregroundStyle(.secondary)
                } else {
                    ForEach(invitations) { invitation in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(invitation.email)
                                Text(invitation.status.label).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if invitation.status == .declined {
                                Button("Elimina", role: .destructive) {
                                    run(.invitation, success: "Invito rimosso.") {
                                        try await appModel.deleteInvitation(invitation.id)
                                    }
                                }
                            } else {
                                HStack {
                                    Button("Reinvia") {
                                        run(.invitation, success: "Invito reinviato.") {
                                            try await appModel.inviteMember(invitation.email)
                                        }
                                    }
                                    if invitation.status == .pending {
                                        Button("Ritira", role: .destructive) {
                                            invitationToWithdraw = invitation
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                Text("Solo un amministratore può cambiare il nome o invitare nuovi membri.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        } header: {
            Text(family.role == .admin ? "Amministra \(family.name)" : family.name)
        } footer: {
            Text("Il tuo ruolo è \(family.role.label.lowercased()).")
        }

        if family.role == .admin {
            Section {
                DisclosureGroup("Elimina questa famiglia", isExpanded: $showsDeleteFamily) {
                    Toggle("Conserva come personali i dati registrati da ciascun membro", isOn: $preserveFamilyData)
                    TextField("Scrivi ELIMINA", text: $familyConfirmation)
                    Button("Elimina famiglia", role: .destructive) {
                        run(.deleteFamily, success: "Famiglia eliminata.") {
                            try await appModel.deleteActiveFamily(preservingAuthoredData: preserveFamilyData)
                            familyConfirmation = ""
                            showsDeleteFamily = false
                        }
                    }
                    .disabled(familyConfirmation != "ELIMINA")
                }
            } footer: {
                Text("La famiglia, i conti condivisi e gli inviti saranno rimossi per tutti i membri.")
            }
        }
    }

    private var createFamilySection: some View {
        Section {
            DisclosureGroup("Crea un’altra famiglia", isExpanded: $showsCreateFamily) {
                TextField("Nome della nuova famiglia", text: $newFamilyName)
                Toggle("Aggiungi un conto condiviso", isOn: $createsSharedAccount)
                if createsSharedAccount {
                    TextField("Nome conto", text: $newAccountName)
                    TextField("Banca o descrizione", text: $newAccountInstitution)
                    TextField("Saldo iniziale", text: $newAccountBalance)
                        #if os(iOS)
                        .keyboardType(.decimalPad)
                        #endif
                }
                Button("Crea e apri famiglia", systemImage: "plus.circle.fill") {
                    let draft = CreateFamilyDraft(
                        name: newFamilyName,
                        createsSharedAccount: createsSharedAccount,
                        accountName: newAccountName,
                        institution: newAccountInstitution,
                        openingBalance: decimal(from: newAccountBalance) ?? 0
                    )
                    run(.createFamily, success: "Nuova famiglia creata.") {
                        try await appModel.createFamily(draft)
                        resetNewFamily()
                    }
                }
                .disabled(newFamilyName.trimmingCharacters(in: .whitespacesAndNewlines).count < 2
                          || (createsSharedAccount && newAccountName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
            }
        } footer: {
            Text("Ne diventerai automaticamente amministratore.")
        }
    }

    private var deleteAccountSection: some View {
        Section {
            Picker("Formato esportazione", selection: $exportFormat) {
                ForEach(AccountExportFormat.allCases) { format in
                    Text(format.label).tag(format)
                }
            }
            Button("Esporta tutti i dati", systemImage: "square.and.arrow.up") {
                run(.export, success: "") {
                    let data = try await appModel.exportAccountData()
                    exportDocument = try AccountExportDocument(
                        jsonData: data,
                        format: exportFormat
                    )
                    showsExporter = true
                }
            }

            DisclosureGroup("Elimina account", isExpanded: $showsDeleteAccount) {
                Text("Questa operazione cancella il profilo e i dati collegati e non può essere annullata.")
                    .font(.footnote).foregroundStyle(.secondary)
                TextField("Scrivi ELIMINA", text: $accountConfirmation)
                Button("Elimina definitivamente l’account", role: .destructive) {
                    run(.deleteAccount, success: "Account eliminato.") {
                        try await appModel.deleteAccount()
                    }
                }
                .disabled(accountConfirmation != "ELIMINA")
            }
        } header: {
            Text("Zona pericolosa")
        }
    }

    private func populate(from workspace: FamilyWorkspace) {
        firstName = workspace.profile.firstName ?? ""
        lastName = workspace.profile.lastName ?? ""
        email = workspace.profile.email
        familyName = appModel.activeFamily?.name ?? ""
    }

    private func resetNewFamily() {
        newFamilyName = ""
        createsSharedAccount = false
        newAccountName = "Conto famiglia"
        newAccountInstitution = ""
        newAccountBalance = "0"
        showsCreateFamily = false
    }

    private func decimal(from text: String) -> Decimal? {
        let normalized = text.contains(",")
            ? text.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".")
            : text
        return Decimal(string: normalized.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private func run(
        _ action: Action,
        success: String,
        operation: @escaping @MainActor () async throws -> Void
    ) {
        guard busyAction == nil else { return }
        busyAction = action
        Task {
            do {
                try await operation()
                if !success.isEmpty {
                    message = Feedback(text: success, isError: false)
                }
            } catch is CancellationError {
                // The enclosing view is going away.
            } catch {
                message = Feedback(text: error.localizedDescription, isError: true)
            }
            busyAction = nil
        }
    }

    private enum Action { case profile, email, password, family, invitation, createFamily, deleteFamily, export, deleteAccount }
    private struct Feedback: Identifiable {
        let id = UUID()
        let text: String
        let isError: Bool
    }

    private static let exportDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}

private struct AccountExportDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json, .commaSeparatedText, .xml] }
    let data: Data

    init(jsonData: Data, format: AccountExportFormat) throws {
        data = try AccountExportSerializer.serialize(jsonData, as: format)
    }

    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}

private enum AccountExportFormat: String, CaseIterable, Identifiable {
    case json, csv, xml
    var id: String { rawValue }
    var label: String { rawValue.uppercased() }
    var contentType: UTType {
        switch self {
        case .json: .json
        case .csv: .commaSeparatedText
        case .xml: .xml
        }
    }
}

nonisolated private enum AccountExportSerializer {
    static func serialize(_ jsonData: Data, as format: AccountExportFormat) throws -> Data {
        guard format != .json else { return jsonData }
        let object = try JSONSerialization.jsonObject(with: jsonData)
        switch format {
        case .json:
            return jsonData
        case .xml:
            return Data("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\(xml(name: "sKeyExport", value: object))".utf8)
        case .csv:
            return Data(("\u{FEFF}" + csv(from: object)).utf8)
        }
    }

    private static func xml(name: String, value: Any) -> String {
        let safeName = xmlName(name)
        if value is NSNull { return "<\(safeName)/>" }
        if let values = value as? [Any] {
            return "<\(safeName)>\(values.map { xml(name: "elemento", value: $0) }.joined())</\(safeName)>"
        }
        if let values = value as? [String: Any] {
            return "<\(safeName)>\(values.keys.sorted().map { xml(name: $0, value: values[$0] as Any) }.joined())</\(safeName)>"
        }
        return "<\(safeName)>\(escapeXML(String(describing: value)))</\(safeName)>"
    }

    private static func xmlName(_ value: String) -> String {
        let safe = value.map { $0.isLetter || $0.isNumber || "_.-".contains($0) ? $0 : "_" }
        let text = String(safe)
        guard let first = text.first, first.isLetter || first == "_" else { return "campo_\(text)" }
        return text
    }

    private static func escapeXML(_ value: String) -> String {
        value.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&apos;")
    }

    private static func csv(from object: Any) -> String {
        guard let root = object as? [String: Any] else { return "" }
        var rows = [["sezione", "famiglia_id", "tipo", "id", "nome", "data"]]
        if let profile = root["profile"] as? [String: Any] {
            rows.append(["profilo", "", "utente", text(profile["id"]), text(profile["full_name"]), json(profile)])
        }
        rows.append(["metadati", "", "esportazione", "", "", text(root["exportedAt"])])
        if let personal = root["personalData"] as? [String: Any] {
            appendSnapshot(personal, section: "personale", familyID: "", rows: &rows)
        }
        for family in root["families"] as? [[String: Any]] ?? [] {
            let familyID = text(family["id"])
            rows.append(["famiglia", familyID, "famiglia", familyID, text(family["name"]), json(["role": family["role"] as Any])])
            rows.append(["famiglia", familyID, "dati_privati_famiglia", "", "", json(family["privateData"] as Any)])
            for account in family["accounts"] as? [[String: Any]] ?? [] {
                rows.append(["famiglia", familyID, "conto", text(account["id"]), text(account["name"]), json(account)])
            }
            for record in family["sharedRecords"] as? [[String: Any]] ?? [] {
                let details = record["data"] as? [String: Any] ?? [:]
                rows.append(["famiglia", familyID, text(record["record_type"]), text(record["record_id"]), text(details["name"] ?? details["description"]), json(record["data"] as Any)])
            }
        }
        return rows.map { $0.map(quote).joined(separator: ",") }.joined(separator: "\r\n")
    }

    private static func appendSnapshot(_ snapshot: [String: Any], section: String, familyID: String, rows: inout [[String]]) {
        for key in snapshot.keys.sorted() {
            if let values = snapshot[key] as? [Any] {
                for value in values {
                    let record = value as? [String: Any] ?? [:]
                    rows.append([section, familyID, key, text(record["id"]), text(record["name"] ?? record["description"]), json(value)])
                }
            } else {
                rows.append([section, familyID, key, "", "", json(snapshot[key] as Any)])
            }
        }
    }

    private static func text(_ value: Any?) -> String {
        guard let value, !(value is NSNull) else { return "" }
        return String(describing: value)
    }

    private static func json(_ value: Any) -> String {
        guard JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        else { return text(value) }
        return String(data: data, encoding: .utf8) ?? ""
    }

    private static func quote(_ value: String) -> String {
        "\"\(value.replacingOccurrences(of: "\"", with: "\"\""))\""
    }
}
