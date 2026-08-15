import SwiftUI

#if os(macOS)
struct NativeSettingsView: View {
    let appModel: AppModel

    var body: some View {
        TabView {
            AccountSettingsView(appModel: appModel)
            .tabItem {
                Label("Account", systemImage: "person.crop.circle")
            }
        }
        .frame(width: 620, height: 720)
    }
}
#endif
