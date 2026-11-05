import Foundation
import ManagedSettings
import FamilyControls
import DeviceActivity

/// Ablenkungs-Sperre im Fokus – gemeinsamer Stand für die App (Plugin `AntonSperre`) und die drei
/// Erweiterungen SperreAnsicht (Knubbel auf dem Sperrbildschirm), SperreKnopf (Knöpfe dort) und
/// SperreWaechter (hebt die Sperre zum Ende des Fokus-Blocks auf, auch wenn AntonOS geschlossen ist).
/// Alles liegt in der App Group, die Sperre selbst setzt iOS über die Bildschirmzeit (ManagedSettings).
@available(iOS 16.0, *)
enum SperreStand {
    static let group = "group.io.github.pixeltoni.antonos"
    static let storeName = ManagedSettingsStore.Name("antonos.fokus")
    static let activity = DeviceActivityName("antonos.fokus")

    private static let selectionKey = "sperre.auswahl"
    private static let endKey = "sperre.ende"
    private static let labelKey = "sperre.titel"
    private static let attemptsKey = "sperre.versuche"
    private static let lastAttemptKey = "sperre.letzterVersuch"

    static var defaults: UserDefaults { UserDefaults(suiteName: group) ?? .standard }
    static var store: ManagedSettingsStore { ManagedSettingsStore(named: storeName) }

    /// Die in der Bildschirmzeit ausgewählten Apps, Kategorien und Webseiten
    static var selection: FamilyActivitySelection {
        get {
            guard let data = defaults.data(forKey: selectionKey),
                  let value = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data) else { return FamilyActivitySelection() }
            return value
        }
        set {
            if let data = try? JSONEncoder().encode(newValue) { defaults.set(data, forKey: selectionKey) }
        }
    }

    /// Ende des laufenden Fokus-Blocks (ms seit 1970, 0 = keine Sperre)
    static var endAt: Double {
        get { defaults.double(forKey: endKey) }
        set { defaults.set(newValue, forKey: endKey) }
    }

    /// z. B. „Lernen · Analysis“
    static var label: String {
        get { defaults.string(forKey: labelKey) ?? "Fokus" }
        set { defaults.set(newValue, forKey: labelKey) }
    }

    static var isOver: Bool { endAt <= Date().timeIntervalSince1970 * 1000 }

    /// Restminuten, aufgerundet
    static var minutesLeft: Int {
        let left = endAt / 1000 - Date().timeIntervalSince1970
        return left <= 0 ? 0 : Int((left / 60).rounded(.up))
    }

    /// Sperrt die ausgewählten Apps bis `endAt`
    static func apply(endAt: Double, label: String) {
        self.endAt = endAt
        self.label = label
        let s = selection
        let shield = store.shield
        shield.applications = s.applicationTokens.isEmpty ? nil : s.applicationTokens
        shield.applicationCategories = s.categoryTokens.isEmpty ? nil : .specific(s.categoryTokens)
        shield.webDomains = s.webDomainTokens.isEmpty ? nil : s.webDomainTokens
        shield.webDomainCategories = s.categoryTokens.isEmpty ? nil : .specific(s.categoryTokens)
    }

    /// Hebt die Sperre auf
    static func clear() {
        endAt = 0
        store.clearAllSettings()
    }

    /* ---------- Versuche, trotzdem eine gesperrte App zu öffnen ---------- */

    /// Merkt sich einen Versuch – nicht doppelt, wenn iOS die Sperre kurz hintereinander neu zeichnet
    static func countAttempt(app: String?) {
        let now = Date().timeIntervalSince1970 * 1000
        let last = defaults.dictionary(forKey: lastAttemptKey)
        if let at = last?["at"] as? Double, let name = last?["app"] as? String, name == (app ?? ""), now - at < 8000 { return }
        defaults.set(["at": now, "app": app ?? ""], forKey: lastAttemptKey)
        var list = defaults.array(forKey: attemptsKey) as? [[String: Any]] ?? []
        list.append(["at": now, "app": app ?? ""])
        defaults.set(Array(list.suffix(200)), forKey: attemptsKey)
    }

    /// Alle Versuche seit dem letzten Abholen – werden dabei gelöscht
    static func takeAttempts() -> [[String: Any]] {
        let list = defaults.array(forKey: attemptsKey) as? [[String: Any]] ?? []
        defaults.removeObject(forKey: attemptsKey)
        return list
    }
}
