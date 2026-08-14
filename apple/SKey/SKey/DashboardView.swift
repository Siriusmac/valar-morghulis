import Foundation
import SwiftUI

struct DashboardView: View {
    let appModel: AppModel

    var body: some View {
        workspaceContent
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
                summaryGrid(workspace)
                accountsSection(workspace)
                nextStepCard

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

    private func welcomeHeader(_ profile: UserProfile) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Ciao, \(profile.displayName)")
                .font(.largeTitle.bold())
            Text("Il tuo account è collegato ai dati esistenti di Valar Morghulis.")
                .foregroundStyle(.secondary)
        }
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
        }
        .padding(18)
        .liquidGlassSurface()
    }

    private func summaryGrid(_ workspace: FamilyWorkspace) -> some View {
        LiquidGlassGroup(spacing: 14) {
            LazyVGrid(
                columns: [GridItem(.adaptive(minimum: 150), spacing: 14)],
                spacing: 14
            ) {
                SummaryCard(
                    title: "Famiglie",
                    value: workspace.families.formattedCount,
                    systemImage: "house.and.flag"
                )

                SummaryCard(
                    title: "Componenti",
                    value: (appModel.activeFamily?.memberCount ?? 1).formatted(),
                    systemImage: "person.2"
                )

                SummaryCard(
                    title: "Ruolo",
                    value: appModel.activeFamily?.role.label ?? "Personale",
                    systemImage: "person.badge.key"
                )

                SummaryCard(
                    title: "Conti",
                    value: activeAccounts(in: workspace).formattedCount,
                    systemImage: "wallet.bifold"
                )
            }
        }
    }

    private func accountsSection(_ workspace: FamilyWorkspace) -> some View {
        let accounts = activeAccounts(in: workspace)

        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Conti")
                    .font(.title2.bold())
                Spacer()
                Text("Saldo iniziale")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 0) {
                if accounts.isEmpty {
                    ContentUnavailableView {
                        Label("Nessun conto", systemImage: "wallet.bifold")
                    } description: {
                        Text(appModel.activeFamily == nil
                             ? "Non risultano ancora conti personali salvati."
                             : "Questa famiglia non ha ancora un conto condiviso.")
                    }
                    .frame(minHeight: 150)
                } else {
                    ForEach(Array(accounts.enumerated()), id: \.element.id) { index, account in
                        AccountRow(account: account)

                        if index < accounts.count - 1 {
                            Divider()
                                .padding(.leading, 48)
                        }
                    }
                }
            }
            .padding(.horizontal, 18)
            .liquidGlassSurface()

            Text("Il saldo calcolato verrà mostrato dopo il collegamento di movimenti, giroconti e rimborsi.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var nextStepCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Nuovo movimento attivo", systemImage: "plus.circle.fill")
                .font(.headline)
                .foregroundStyle(.green)

            Text("Puoi registrare spese ed entrate personali o familiari con il pulsante +. Conti, categorie, beneficiari e mittenti provengono dai tuoi dati esistenti.")
                .foregroundStyle(.secondary)

            Text("Parziali, tag e rateizzazione verranno aggiunti nel prossimo ampliamento del modulo.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding(18)
        .liquidGlassSurface(tint: .green.opacity(0.16))
    }

    private var workspaceDescription: String {
        if let family = appModel.activeFamily {
            return "Stai consultando i dati condivisi di \(family.name)."
        }

        return "Stai consultando soltanto la tua contabilità personale."
    }

    private func activeAccounts(in workspace: FamilyWorkspace) -> [AccountSummary] {
        workspace.accounts(for: appModel.selectedFamilyID)
    }

}

private struct AccountRow: View {
    let account: AccountSummary

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

            Text(account.openingBalance.euroFormatted)
                .font(.headline.monospacedDigit())
                .foregroundStyle(account.openingBalance < 0 ? .red : .primary)
        }
        .padding(.vertical, 14)
    }
}

private struct SummaryCard: View {
    let title: String
    let value: String
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: systemImage)
                .font(.title2)
                .foregroundStyle(.green)

            Text(value)
                .font(.title2.bold())
                .lineLimit(1)
                .minimumScaleFactor(0.75)

            Text(title)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .liquidGlassSurface()
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

private extension Decimal {
    var euroFormatted: String {
        NSDecimalNumber(decimal: self).doubleValue.formatted(
            .currency(code: "EUR")
                .locale(Locale(identifier: "it_IT"))
        )
    }
}

private extension Collection {
    var formattedCount: String {
        count.formatted()
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
            selectedFamilyID: familyID
        )
    )
}
