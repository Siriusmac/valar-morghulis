import SwiftUI

struct LoginView: View {
    let appModel: AppModel

    @State private var email = ""
    @State private var password = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @FocusState private var focusedField: Field?

    private enum Field {
        case email
        case password
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                brand
                loginCard
                privacyNote
            }
            .frame(maxWidth: 440)
            .padding(.horizontal, 20)
            .padding(.vertical, 40)
            .frame(maxWidth: .infinity)
        }
        .background(Color.secondary.opacity(0.06))
    }

    private var brand: some View {
        VStack(spacing: 12) {
            Image(systemName: "key.fill")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(.green)
                .frame(width: 72, height: 72)
                .liquidGlassSurface(cornerRadius: 36, tint: .green.opacity(0.14))

            Text("sKey")
                .font(.largeTitle.bold())

            Text("La contabilità personale e familiare, in un unico posto.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    private var loginCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Accedi")
                    .font(.title2.bold())
                Text("Usa l’account già registrato su Valar Morghulis.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 14) {
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .emailEntryTraits()
                    .focused($focusedField, equals: .email)
                    .onSubmit { focusedField = .password }
                    .accessibilityIdentifier("login.email")

                SecureField("Password", text: $password)
                    .textContentType(.password)
                    .passwordEntryTraits()
                    .focused($focusedField, equals: .password)
                    .onSubmit { submitIfPossible() }
                    .accessibilityIdentifier("login.password")
            }
            .textFieldStyle(.roundedBorder)

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .accessibilityIdentifier("login.error")
            }

            Button(action: submitIfPossible) {
                HStack(spacing: 10) {
                    if isSubmitting {
                        ProgressView()
                            .controlSize(.small)
                    }
                    Text(isSubmitting ? "Accesso in corso…" : "Accedi")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
            }
            .liquidGlassProminentButton()
            .tint(.green)
            .controlSize(.large)
            .disabled(!canSubmit)
            .accessibilityIdentifier("login.submit")
        }
        .padding(24)
        .liquidGlassSurface(cornerRadius: 22)
    }

    private var privacyNote: some View {
        Label {
            Text("I tuoi dati sono protetti e accessibili soltanto agli utenti autorizzati.")
        } icon: {
            Image(systemName: "lock.shield")
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
    }

    private var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !password.isEmpty
            && !isSubmitting
    }

    private func submitIfPossible() {
        guard canSubmit else { return }

        focusedField = nil
        errorMessage = nil
        isSubmitting = true

        Task {
            defer { isSubmitting = false }

            do {
                try await appModel.signIn(email: email, password: password)
            } catch is CancellationError {
                return
            } catch {
                errorMessage = AppModel.userFacingMessage(for: error)
            }
        }
    }
}

private extension View {
    @ViewBuilder
    func emailEntryTraits() -> some View {
        #if os(iOS)
        textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.next)
        #else
        self
        #endif
    }

    @ViewBuilder
    func passwordEntryTraits() -> some View {
        #if os(iOS)
        submitLabel(.go)
        #else
        self
        #endif
    }
}

#Preview("Accesso") {
    LoginView(appModel: AppModel(previewState: .signedOut))
}
