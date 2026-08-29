import SwiftUI

struct ReimbursementsView: View {
    let appModel: AppModel

    @State private var section = Section.expected
    @State private var reviewPurchase: CommissionedPurchaseSummary?

    var body: some View {
        Group {
            if case .loaded(let workspace) = appModel.workspaceState,
               case .loaded(let snapshot) = appModel.ledgerState {
                let reimbursements = snapshot.reimbursements
                    .filter { section.includes($0, currentUserID: snapshot.currentUserID) }
                    .sorted { $0.date > $1.date }
                let commissioned = workspace.commissionedPurchases
                    .filter { $0.reimbursementID == nil && section.includes($0, currentUserID: snapshot.currentUserID) }
                    .sorted { $0.purchaseDate > $1.purchaseDate }

                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        Picker("Tipo di rimborso", selection: $section) {
                            ForEach(Section.allCases) { value in
                                Text(value.title).tag(value)
                            }
                        }
                        .pickerStyle(.segmented)

                        if reimbursements.isEmpty && commissioned.isEmpty {
                            ContentUnavailableView(
                                "Nessun rimborso \(section.emptyLabel)",
                                systemImage: "hand.raised.fingers.spread",
                                description: Text("I movimenti compariranno qui quando verranno registrati.")
                            )
                            .frame(maxWidth: .infinity, minHeight: 320)
                        } else {
                            LazyVStack(spacing: 12) {
                                ForEach(reimbursements) { reimbursement in
                                    ReimbursementReviewCard(
                                        reimbursement: reimbursement,
                                        snapshot: snapshot,
                                        workspace: workspace,
                                        appModel: appModel
                                    )
                                }
                                ForEach(commissioned) { purchase in
                                    CommissionedReimbursementCard(
                                        purchase: purchase,
                                        currentUserID: snapshot.currentUserID,
                                        onReview: { reviewPurchase = purchase }
                                    )
                                }
                            }
                        }
                    }
                    .padding()
                }
            } else {
                ProgressView("Caricamento rimborsi…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .sheet(item: $reviewPurchase) {
            CommissionedPurchaseReviewView(appModel: appModel, purchase: $0)
        }
    }

    private enum Section: String, CaseIterable, Identifiable {
        case expected
        case owed

        var id: String { rawValue }
        var title: String { self == .expected ? "Attesi" : "Dovuti" }
        var emptyLabel: String { self == .expected ? "atteso" : "dovuto" }

        func includes(_ reimbursement: LedgerReimbursement, currentUserID: String) -> Bool {
            let value = self == .expected ? reimbursement.toID : reimbursement.fromID
            return value.caseInsensitiveCompare(currentUserID) == .orderedSame
        }

        func includes(_ purchase: CommissionedPurchaseSummary, currentUserID: String) -> Bool {
            guard let userID = UUID(uuidString: currentUserID) else { return false }
            return self == .expected ? purchase.payerID == userID : purchase.recipientID == userID
        }
    }
}

private struct CommissionedReimbursementCard: View {
    let purchase: CommissionedPurchaseSummary
    let currentUserID: String
    let onReview: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label(purchase.description, systemImage: "hand.raised.fingers.spread")
                    .font(.headline)
                Spacer()
                Text(purchase.amount.euroFormatted).font(.headline.monospacedDigit())
            }
            Text(statusLabel).font(.footnote).foregroundStyle(.secondary)
            if purchase.status == .pending, isRecipient {
                Button("Conferma e cataloga", systemImage: "checkmark") { onReview() }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
            }
        }
        .padding(18)
        .liquidGlassSurface()
        .opacity(purchase.status == .rejected ? 0.7 : 1)
    }

    private var isRecipient: Bool {
        purchase.recipientID?.uuidString.caseInsensitiveCompare(currentUserID) == .orderedSame
    }

    private var statusLabel: String {
        switch purchase.status {
        case .pending: "In attesa di conferma"
        case .confirmed: "Confermato e registrato"
        case .rejected: "Rifiutato"
        }
    }
}
