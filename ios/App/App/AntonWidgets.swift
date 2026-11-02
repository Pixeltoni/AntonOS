import Foundation
import Capacitor
import WidgetKit

/// Brücke zu den Homescreen-Widgets (ios/App/AntonOSWidgets): Die App legt den Stand
/// im gemeinsamen Speicher (App Group) ab und holt im Widget Abgehaktes wieder ab.
@objc(AntonWidgetsPlugin)
public class AntonWidgetsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AntonWidgetsPlugin"
    public let jsName = "AntonWidgets"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeActions", returnType: CAPPluginReturnPromise),
    ]

    /// Gleiche Namen wie `WidgetStore` in der Widget-Erweiterung
    static let group = "group.io.github.pixeltoni.antonos"
    static let snapshotKey = "widgets.snapshot"
    static let actionsKey = "widgets.actions"

    private var shared: UserDefaults? { UserDefaults(suiteName: Self.group) }

    /// `snapshot`: Stand als JSON; `applied`: bis zu diesem Zeitpunkt (ms) sind Widget-Aktionen übernommen
    @objc func update(_ call: CAPPluginCall) {
        guard let snapshot = call.getString("snapshot"), let shared else { return call.resolve() }
        shared.set(snapshot, forKey: Self.snapshotKey)
        let applied = call.getDouble("applied") ?? 0
        if applied > 0, let raw = shared.string(forKey: Self.actionsKey), let data = raw.data(using: .utf8),
           let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            let rest = list.filter { ($0["at"] as? Double ?? 0) > applied }
            if let out = try? JSONSerialization.data(withJSONObject: rest), let text = String(data: out, encoding: .utf8) {
                shared.set(text, forKey: Self.actionsKey)
            }
        }
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    /// Liefert die Warteschlange (JSON). Gelöscht wird erst mit dem nächsten `update`,
    /// damit das Widget bis dahin nicht kurz den alten Stand zeigt.
    @objc func takeActions(_ call: CAPPluginCall) {
        call.resolve(["actions": shared?.string(forKey: Self.actionsKey) ?? "[]"])
    }
}
