import Foundation

nonisolated enum AppDestination: String, CaseIterable, Hashable, Identifiable, Sendable {
    case dashboard
    case movements
    case scheduledPayments
    case accounts
    case categories
    case counterparties
    case tags
    case contacts
    case guide

    enum Group: String, CaseIterable {
        case overview
        case organization
        case support

        var title: String {
            switch self {
            case .overview: "Contabilità"
            case .organization: "Organizzazione"
            case .support: "Supporto"
            }
        }
    }

    var id: String { rawValue }

    var title: String {
        switch self {
        case .dashboard: "Bacheca"
        case .movements: "Spese ed Entrate"
        case .scheduledPayments: "Pagamenti programmati"
        case .accounts: "Conti"
        case .categories: "Categorie"
        case .counterparties: "Beneficiari e mittenti"
        case .tags: "Tag"
        case .contacts: "Contatti"
        case .guide: "Guida"
        }
    }

    var compactTitle: String {
        switch self {
        case .movements: "Movimenti"
        case .scheduledPayments: "Programmati"
        default: title
        }
    }

    var systemImage: String {
        switch self {
        case .dashboard: "rectangle.3.group"
        case .movements: "arrow.up.arrow.down.circle"
        case .scheduledPayments: "calendar.badge.clock"
        case .accounts: "creditcard"
        case .categories: "square.grid.2x2"
        case .counterparties: "building.2"
        case .tags: "tag"
        case .contacts: "person.2"
        case .guide: "book"
        }
    }

    var group: Group {
        switch self {
        case .dashboard, .movements, .scheduledPayments, .accounts:
            .overview
        case .categories, .counterparties, .tags, .contacts:
            .organization
        case .guide:
            .support
        }
    }

    static func destinations(in group: Group) -> [AppDestination] {
        allCases.filter { $0.group == group }
    }
}
