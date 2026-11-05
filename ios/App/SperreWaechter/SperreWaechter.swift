import DeviceActivity
import ManagedSettings

/// Hebt die Ablenkungs-Sperre zum Ende des Fokus-Blocks auf – auch wenn AntonOS dann geschlossen ist.
/// AntonOS meldet dafür bei jedem Start der Sperre einen Zeitraum bis zum Ende an (AntonSperre.swift).
class SperreWaechter: DeviceActivityMonitor {
    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        guard activity == SperreStand.activity else { return }
        // Wurde inzwischen ein neuer, längerer Block gestartet, bleibt die Sperre
        if SperreStand.endAt > 0, !SperreStand.isOver, SperreStand.endAt / 1000 - Date().timeIntervalSince1970 > 60 { return }
        SperreStand.clear()
    }
}
