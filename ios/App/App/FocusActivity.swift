import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// Live-Aktivität des Fokus-Timers und der Satzpause beim Training (Sperrbildschirm und Dynamic Island).
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
        /// fokus, pause, lange-pause oder satzpause
        var phase: String
        var startAt: Date
        var endAt: Date
        var paused: Bool
        /// Restzeit beim Pausieren
        var leftSeconds: Int
        var round: Int
        var rounds: Int
        /// Satzpause: „Als Nächstes: Bankdrücken · Satz 3 von 4“
        var detail: String?
        /// Satzpause: „Ziel: 62,5 kg × 8“
        var goal: String?
    }

    var name: String = "Fokus"
}
#endif
