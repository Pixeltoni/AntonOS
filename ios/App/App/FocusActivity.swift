import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// Live-Aktivität des Fokus-Timers, der Satzpause beim Training und geführter Routinen (Sperrbildschirm und Dynamic Island).
/// Gehört zur App und zur Widget-Erweiterung – Felder gleich halten mit `FocusActivityState` in src/lib/native.ts.
@available(iOS 16.1, *)
struct FocusActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// Kurs oder Modus, z. B. „Analysis“; in der Pause „Pause“
        var label: String
        /// Modus-Symbol (Emoji)
        var icon: String
        /// Farbe #RRGGBB
        var colorHex: String
        /// fokus, pause, lange-pause, satzpause oder routine
        var phase: String
        var startAt: Date
        var endAt: Date
        var paused: Bool
        /// Restzeit beim Pausieren
        var leftSeconds: Int
        var round: Int
        var rounds: Int
        /// Satzpause: „Als Nächstes: Bankdrücken · Satz 3 von 4“; Routine: nächste Schritte mit Uhrzeit, je Zeile „07:16 🗓️ Plan ansehen“
        var detail: String?
        /// Satzpause: „Ziel: 62,5 kg × 8“; Routine: aktueller Schritt, z. B. „🚿 Duschen“
        var goal: String?
    }

    var name: String = "Fokus"
}
#endif
