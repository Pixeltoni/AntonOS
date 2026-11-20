import Foundation
#if canImport(AlarmKit)
import AlarmKit
import AppIntents

/// Zusatzdaten jedes iPhone-Weckers. Gehört zur App und zur Widget-Erweiterung: Die Erweiterung zeigt damit
/// Schlummern und Nachklingeln als Live-Aktivität (`AlarmLiveActivity.swift`). Felder optional, damit ältere,
/// ohne Zusatzdaten gestellte Wecker weiter lesbar bleiben.
@available(iOS 26.0, *)
struct AntonAlarmMetadata: AlarmMetadata {
    /// Name des Weckers, z. B. „Wecker 06:45“
    var label: String?
    /// Mit Aufgabe: Ausschalten nur über Daywerk
    var withTask: Bool?
}

/// „Aus“ in der Live-Aktivität (nur Wecker ohne Aufgabe): beendet Schlummern bzw. Nachklingeln.
/// Läuft im App-Prozess, darum gleicher Speicher wie `AlarmStore` (UserDefaults.standard).
@available(iOS 26.0, *)
struct AntonAlarmEndCountdownIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Schlummern beenden"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Wecker")
    var alarmID: String

    init() { alarmID = "" }
    init(alarmID: String) { self.alarmID = alarmID }

    func perform() async throws -> some IntentResult {
        guard let uuid = UUID(uuidString: alarmID) else { return .result() }
        let defaults = UserDefaults.standard
        // Gleiche Schlüssel wie AlarmStore.staleKey / fallbackKey in AntonAlarm.swift. Nur lesen: Die Listen schreibt
        // allein AlarmQueue (sonst ginge ein gleichzeitig gestelltes Nachklingeln verloren). Gelöschte IDs darin
        // stören nicht – cancelFallback und der Abgleich räumen sie auf.
        let stale = defaults.stringArray(forKey: "antonAlarm.stale") ?? []
        let fallbacks = defaults.stringArray(forKey: "antonAlarm.fallback") ?? []
        if stale.contains(alarmID) || fallbacks.contains(alarmID) {
            // Veraltet oder nur zum Nachklingeln gestellt: ganz löschen
            try? AlarmManager.shared.cancel(id: uuid)
        } else {
            // Wiederholender Wecker: nur diesen Durchlauf beenden
            try? AlarmManager.shared.stop(id: uuid)
        }
        return .result()
    }
}
#endif
