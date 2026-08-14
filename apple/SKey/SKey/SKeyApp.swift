//
//  SKeyApp.swift
//  SKey
//
//  Created by Simone Miotto on 13/08/2026.
//

import SwiftUI

@main
struct SKeyApp: App {
    @State private var appModel = AppModel()

    var body: some Scene {
        WindowGroup {
            ContentView(appModel: appModel)
        }

        #if os(macOS)
        Settings {
            NativeSettingsView(email: currentEmail)
        }
        #endif
    }

    private var currentEmail: String? {
        guard case .signedIn(let email) = appModel.sessionState else { return nil }
        return email
    }
}
