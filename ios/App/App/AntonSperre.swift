import Foundation
import UIKit
import SwiftUI
import Capacitor
import FamilyControls
import ManagedSettings
import DeviceActivity

/// Ablenkungs-Sperre im Fokus (src/lib/native.ts → `AntonSperre`): Während eines Fokus-Blocks sperrt iOS
/// die ausgewählten Apps über die Bildschirmzeit. Den Sperrbildschirm mit Knubbel zeigt die Erweiterung
/// SperreAnsicht, das Ende überwacht SperreWaechter. Braucht die Berechtigung Family Controls von Apple –
/// ohne sie lässt der TestFlight-Build die Erweiterungen weg und `AntonSperre` steht nicht in der Info.plist.
@objc(AntonSperrePlugin)
public class AntonSperrePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AntonSperrePlugin"
    public let jsName = "AntonSperre"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeAttempts", returnType: CAPPluginReturnPromise),
    ]

    /// Steht nur im Build, wenn Apple die Berechtigung erteilt hat (siehe .github/workflows/ios.yml)
    private var available: Bool {
        guard #available(iOS 16.0, *) else { return false }
        return Bundle.main.object(forInfoDictionaryKey: "AntonSperre") as? Bool == true
    }

    @available(iOS 16.0, *)
    private func state() -> String {
        switch AuthorizationCenter.shared.authorizationStatus {
        case .approved: return "granted"
        case .denied: return "denied"
        default: return "prompt"
        }
    }

    @available(iOS 16.0, *)
    private func counts(_ s: FamilyActivitySelection) -> [String: Any] {
        ["apps": s.applicationTokens.count, "categories": s.categoryTokens.count, "sites": s.webDomainTokens.count]
    }

    @objc func status(_ call: CAPPluginCall) {
        guard available, #available(iOS 16.0, *) else { return call.resolve(["available": false, "state": "unavailable", "apps": 0, "categories": 0, "sites": 0, "active": false]) }
        var result = counts(SperreStand.selection)
        result["available"] = true
        result["state"] = state()
        result["active"] = SperreStand.endAt > 0 && !SperreStand.isOver
        call.resolve(result)
    }

    @objc func authorize(_ call: CAPPluginCall) {
        guard available, #available(iOS 16.0, *) else { return call.resolve(["state": "unavailable"]) }
        Task { @MainActor in
            do {
                try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
            } catch {
                // abgelehnt oder abgebrochen – der Stand sagt es
            }
            call.resolve(["state": self.state()])
        }
    }

    /// Auswahl der Apps, Kategorien und Webseiten (Liste von iOS – AntonOS sieht nur verschlüsselte Kennungen)
    @objc func pick(_ call: CAPPluginCall) {
        guard available, #available(iOS 16.0, *) else { return call.resolve(["cancelled": true, "apps": 0, "categories": 0, "sites": 0]) }
        DispatchQueue.main.async {
            var host: UIViewController?
            let view = SperreAuswahl(selection: SperreStand.selection) { picked in
                host?.dismiss(animated: true)
                guard let picked else {
                    var result = self.counts(SperreStand.selection)
                    result["cancelled"] = true
                    return call.resolve(result)
                }
                SperreStand.selection = picked
                // Läuft gerade eine Sperre, gilt die neue Auswahl sofort
                if SperreStand.endAt > 0, !SperreStand.isOver { SperreStand.apply(endAt: SperreStand.endAt, label: SperreStand.label) }
                var result = self.counts(picked)
                result["cancelled"] = false
                call.resolve(result)
            }
            let controller = UIHostingController(rootView: view)
            controller.isModalInPresentation = true
            host = controller
            self.bridge?.viewController?.present(controller, animated: true)
        }
    }

    /// Sperrt bis `endAt` (ms) und meldet das Ende bei der Bildschirmzeit an
    @objc func start(_ call: CAPPluginCall) {
        guard available, #available(iOS 16.0, *), AuthorizationCenter.shared.authorizationStatus == .approved else { return call.resolve(["ok": false]) }
        let endAt = call.getDouble("endAt") ?? 0
        let end = Date(timeIntervalSince1970: endAt / 1000)
        guard end > Date() else { return call.resolve(["ok": false]) }
        SperreStand.apply(endAt: endAt, label: call.getString("label") ?? "Fokus")
        // Zeiträume müssen mindestens 15 Minuten lang sein – bei kürzeren Blöcken beginnt er einfach früher
        let begin = min(Date(), end.addingTimeInterval(-16 * 60))
        let parts: Set<Calendar.Component> = [.hour, .minute, .second]
        let schedule = DeviceActivitySchedule(
            intervalStart: Calendar.current.dateComponents(parts, from: begin),
            intervalEnd: Calendar.current.dateComponents(parts, from: end),
            repeats: false
        )
        let center = DeviceActivityCenter()
        center.stopMonitoring([SperreStand.activity])
        do {
            try center.startMonitoring(SperreStand.activity, during: schedule)
        } catch {
            // Ohne Wächter hebt AntonOS die Sperre beim nächsten Öffnen auf
        }
        call.resolve(["ok": true])
    }

    @objc func stop(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *), available else { return call.resolve() }
        DeviceActivityCenter().stopMonitoring([SperreStand.activity])
        SperreStand.clear()
        call.resolve()
    }

    @objc func takeAttempts(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *), available else { return call.resolve(["items": []]) }
        call.resolve(["items": SperreStand.takeAttempts()])
    }
}

/// Auswahlfenster von iOS in einem eigenen Blatt mit „Abbrechen“ und „Fertig“
@available(iOS 16.0, *)
struct SperreAuswahl: View {
    @State var selection: FamilyActivitySelection
    let done: (FamilyActivitySelection?) -> Void

    var body: some View {
        NavigationView {
            FamilyActivityPicker(selection: $selection)
                .navigationTitle("Im Fokus sperren")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { done(nil) } }
                    ToolbarItem(placement: .confirmationAction) { Button("Fertig") { done(selection) }.bold() }
                }
        }
    }
}
