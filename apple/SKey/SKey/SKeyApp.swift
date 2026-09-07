//
//  SKeyApp.swift
//  SKey
//
//  Created by Simone Miotto on 13/08/2026.
//

import SwiftUI

@main
struct SKeyApp: App {
    #if os(iOS)
    @UIApplicationDelegateAdaptor(SKeyAppDelegate.self) private var appDelegate
    #elseif os(macOS)
    @NSApplicationDelegateAdaptor(SKeyAppDelegate.self) private var appDelegate
    #endif

    @State private var appModel = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView(appModel: appModel)
                .onChange(of: scenePhase, initial: true) { _, phase in
                    Task { await appModel.setForeground(phase == .active) }
                }
        }

        #if os(macOS)
        Settings {
            NativeSettingsView(appModel: appModel)
        }
        #endif
    }

}
