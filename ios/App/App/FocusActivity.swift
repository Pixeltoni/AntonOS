import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// Live-Aktivität des Fokus-Timers (Sperrbildschirm und Dynamic Island).
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
        /// fokus, pause, lange-pause
        var phase: String
        var startAt: Date
        var endAt: Date
        var paused: Bool
        /// Restzeit beim Pausieren
        var leftSeconds: Int
        var round: Int
        var rounds: Int
    }

    var name: String = "Fokus"
}
#endif
