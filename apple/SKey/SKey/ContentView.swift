import SwiftUI

struct ContentView: View {
    let appModel: AppModel

    var body: some View {
        Group {
            switch appModel.sessionState {
            case .loading:
                ProgressView("Verifica della sessione…")
                    .controlSize(.large)
            case .signedOut:
                LoginView(appModel: appModel)
            case .signedIn(let email):
                AppShellView(appModel: appModel, email: email)
            case .configurationError(let message):
                ConfigurationErrorView(message: message)
            }
        }
        .animation(.default, value: appModel.sessionState)
    }
}

private struct ConfigurationErrorView: View {
    let message: String

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "wrench.and.screwdriver.fill")
                .font(.system(size: 42))
                .foregroundStyle(.orange)

            Text("Configurazione incompleta")
                .font(.title2.bold())

            Text(message)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Text("Controlla il file Secrets.xcconfig e ricompila l’app.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: 440)
        .padding(24)
    }
}

#Preview("Accesso") {
    ContentView(appModel: AppModel(previewState: .signedOut))
}

#Preview("Configurazione mancante") {
    ContentView(
        appModel: AppModel(
            previewState: .configurationError("Configurazione mancante.")
        )
    )
}
