import SwiftUI

struct ReimbursementsView: View {
    let appModel: AppModel

    @State private var section = Section.expected

    var body: some View {
        Group {
            if case .loaded(let workspace) = appModel.workspaceState,
               case .loaded(let snapshot) = appModel.ledgerState {
                let reimbursements = snapshot.reimbursements
                    .filter { section.includes($0, currentUserID: snapshot.currentUserID) }
                    .sorted { $0.date > $1.date }

                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        Picker("Tipo di rimborso", selection: $section) {
                            ForEach(Section.allCases) { value in
                                Text(value.title).tag(value)
                            }
                        }
                        .pickerStyle(.segmented)

                        if reimbursements.isEmpty {
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
    }
}
