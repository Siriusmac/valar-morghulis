import SwiftUI

#if os(macOS)
struct NativeSettingsView: View {
    let email: String?

    var body: some View {
        TabView {
            Form {
                Section("Account") {
                    LabeledContent("Email", value: email ?? "Non disponibile")
                }

                Section("Applicazione") {
                    LabeledContent("Nome", value: "sKey")
                    LabeledContent("Valuta", value: "Euro")
                    LabeledContent("Formato date", value: "Italiano")
                }
            }
            .formStyle(.grouped)
            .tabItem {
                Label("Generali", systemImage: "gearshape")
            }
        }
        .frame(width: 480, height: 300)
    }
}
#endif
