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

    var body: some Scene {
        WindowGroup {
            ContentView(appModel: appModel)
        }

        #if os(macOS)
        Settings {
            NativeSettingsView(appModel: appModel)
        }
        #endif
    }

}
