import Charts
import SwiftUI

struct CategoryDonutChart: View {
    let title: String
    let totals: [LedgerCategoryTotal]
    let tone: Color

    private var total: Money {
        totals.reduce(.zero) { $0 + $1.amount }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text(title)
                    .font(.headline)
                Spacer()
                Text(total.euroFormatted)
                    .font(.subheadline.bold().monospacedDigit())
                    .foregroundStyle(tone)
            }

            if totals.isEmpty {
                ContentUnavailableView(
                    "Nessun dato",
                    systemImage: "chart.pie",
                    description: Text("Non risultano importi per il mese selezionato.")
                )
                .frame(maxWidth: .infinity, minHeight: 170)
            } else {
                #if os(macOS)
                HStack(alignment: .center, spacing: 28) {
                    donut
                        .frame(width: 220, height: 190, alignment: .leading)
                    macLegend
                        .frame(maxWidth: 430, alignment: .leading)
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                #else
                donut
                    .frame(height: 190)
                touchLegend
                #endif
            }
        }
        .padding(.vertical, 8)
    }

    private var donut: some View {
        Chart(totals) { item in
            SectorMark(
                angle: .value("Importo", item.amount.cents),
                innerRadius: .ratio(0.62),
                angularInset: 1
            )
            .cornerRadius(3)
            .foregroundStyle(chartColor(for: item))
            .accessibilityLabel(item.name)
            .accessibilityValue("\(percentage(of: item))%, \(item.amount.euroFormatted)")
        }
        .chartLegend(.hidden)
        .accessibilityLabel(title)
    }

    private var touchLegend: some View {
        VStack(alignment: .leading, spacing: 9) {
            ForEach(totals) { item in
                HStack(spacing: 8) {
                    legendColor(for: item)
                    Text(item.name)
                        .lineLimit(1)
                    Spacer()
                    Text("\(percentage(of: item))%")
                        .fontWeight(.semibold)
                    Text(item.amount.euroFormatted)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                .font(.caption)
            }
        }
    }

    #if os(macOS)
    private var macLegend: some View {
        Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 10) {
            ForEach(totals) { item in
                GridRow {
                    HStack(spacing: 8) {
                        legendColor(for: item)
                        Text(item.name)
                            .lineLimit(1)
                    }
                    .frame(width: 170, alignment: .leading)
                    Text("\(percentage(of: item))%")
                        .fontWeight(.semibold)
                        .monospacedDigit()
                    Text(item.amount.euroFormatted)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                .font(.caption)
            }
        }
    }
    #endif

    private func legendColor(for item: LedgerCategoryTotal) -> some View {
        Circle()
            .fill(chartColor(for: item))
            .frame(width: 10, height: 10)
            .accessibilityHidden(true)
    }

    private func percentage(of item: LedgerCategoryTotal) -> Int {
        guard total.cents > 0 else { return 0 }
        return Int((Double(item.amount.cents) / Double(total.cents) * 100).rounded())
    }

    private func chartColor(for item: LedgerCategoryTotal) -> Color {
        item.color.flatMap { Color(hex: $0) } ?? (item.id == "other" ? .secondary : tone)
    }
}

struct SharedMonthlyChart: View {
    enum Mode: String, CaseIterable, Identifiable {
        case daily
        case members

        var id: String { rawValue }

        var title: String {
            switch self {
            case .daily: "Per giorno"
            case .members: "Per persona"
            }
        }
    }

    let snapshot: LedgerSnapshot
    let members: [FamilyMemberSummary]
    let currentUserID: UUID

    @Binding var mode: Mode
    @Binding var month: String

    private var daysInMonth: Int {
        guard let date = Self.monthParser.date(from: month) else { return 31 }
        return Calendar.current.range(of: .day, in: .month, for: date)?.count ?? 31
    }

    private var dailyTotals: [LedgerDailyTotal] {
        LedgerCalculations.dailySharedExpenseTotals(
            in: snapshot,
            month: month,
            days: daysInMonth
        )
    }

    private var memberTotals: [MemberChartItem] {
        let totals = LedgerCalculations.sharedExpensesByMember(
            in: snapshot,
            memberIDs: members.map { $0.id.uuidString },
            month: month
        )
        let byID = Dictionary(uniqueKeysWithValues: totals.map { ($0.memberID, $0.amount) })
        return members.map {
            MemberChartItem(
                member: $0,
                amount: byID[$0.id.uuidString.lowercased(), default: .zero]
            )
        }
    }

    private var total: Money {
        switch mode {
        case .daily:
            dailyTotals.reduce(.zero) { $0 + $1.amount }
        case .members:
            memberTotals.reduce(.zero) { $0 + $1.amount }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Spese condivise del mese")
                        .font(.title2.bold())
                    Text("\(total.euroFormatted) complessivi")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Picker("Mese del grafico condiviso", selection: $month) {
                    ForEach(selectableMonths, id: \.self) { value in
                        Text(Self.monthLabel(value)).tag(value)
                    }
                }
                .pickerStyle(.menu)
                .accessibilityIdentifier("dashboard.shared-month")
            }

            Picker("Visualizzazione del grafico mensile", selection: $mode) {
                ForEach(Mode.allCases) { value in
                    Text(value.title).tag(value)
                }
            }
            .pickerStyle(.segmented)

            if total == .zero {
                ContentUnavailableView(
                    "Nessuna spesa condivisa",
                    systemImage: "chart.bar",
                    description: Text(emptyDescription)
                )
                .frame(maxWidth: .infinity, minHeight: 190)
            } else if mode == .daily {
                dailyChart
            } else {
                membersChart
                Text("Sono escluse le spese pagate direttamente con un conto condiviso.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(18)
        .liquidGlassSurface(tint: .green.opacity(0.1))
    }

    private var dailyChart: some View {
        Chart(dailyTotals) { item in
            BarMark(
                x: .value("Giorno", item.day),
                y: .value("Spesa", Double(item.amount.cents) / 100)
            )
            .foregroundStyle(.green.gradient)
            .accessibilityLabel("Giorno \(item.day)")
            .accessibilityValue(item.amount.euroFormatted)
        }
        .chartXAxis {
            AxisMarks(values: [1, 8, 15, 22, daysInMonth])
        }
        .chartYAxis {
            AxisMarks(position: .leading) { value in
                AxisGridLine()
                AxisValueLabel {
                    if let amount = value.as(Double.self) {
                        Text(amount, format: .currency(code: "EUR").precision(.fractionLength(0)))
                    }
                }
            }
        }
        .frame(height: 220)
        .accessibilityLabel("Spese condivise per giorno")
    }

    private var membersChart: some View {
        Chart(memberTotals) { item in
            BarMark(
                x: .value("Spesa", Double(item.amount.cents) / 100),
                y: .value("Persona", item.member.displayName)
            )
            .foregroundStyle(item.member.id == currentUserID ? Color.green : Color.mint)
            .annotation(position: .trailing) {
                Text(item.amount.euroFormatted)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            .accessibilityLabel(item.member.displayName)
            .accessibilityValue(item.amount.euroFormatted)
        }
        .chartXAxis {
            AxisMarks(position: .bottom) { value in
                AxisGridLine()
                AxisValueLabel {
                    if let amount = value.as(Double.self) {
                        Text(amount, format: .currency(code: "EUR").precision(.fractionLength(0)))
                    }
                }
            }
        }
        .frame(height: max(180, CGFloat(memberTotals.count) * 54))
        .accessibilityLabel("Spese condivise anticipate per persona")
    }

    private var selectableMonths: [String] {
        Set(snapshot.movements.map { String($0.date.prefix(7)) } + [Self.currentMonth])
            .filter { $0.count == 7 }
            .sorted(by: >)
    }

    private var emptyDescription: String {
        mode == .daily
            ? "Non risultano spese condivise nel mese selezionato."
            : "Nessun membro ha anticipato spese condivise nel mese selezionato."
    }

    private static let currentMonth: String = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM"
        return formatter.string(from: Date())
    }()

    private static let monthParser: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM"
        return formatter
    }()

    private static func monthLabel(_ value: String) -> String {
        guard let date = monthParser.date(from: value) else { return value }
        return date.formatted(
            .dateTime.month(.wide).year().locale(Locale(identifier: "it_IT"))
        ).capitalized(with: Locale(identifier: "it_IT"))
    }
}

private struct MemberChartItem: Identifiable {
    let member: FamilyMemberSummary
    let amount: Money

    var id: UUID { member.id }
}

private extension Color {
    init?(hex: String) {
        let clean = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        guard clean.count == 6, let value = UInt64(clean, radix: 16) else { return nil }
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
