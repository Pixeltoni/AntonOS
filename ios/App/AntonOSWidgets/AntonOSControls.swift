import AppIntents
import SwiftUI
import WidgetKit

/* ---------- 10 Kontrollzentrum, Sperrbildschirm und Aktionstaste (ab iOS 18) ---------- */

@available(iOS 18.0, *)
struct QuickAddControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "io.github.pixeltoni.antonos.quickadd") {
            ControlWidgetButton(action: OpenURLIntent(AppLink.assistant)) {
                Label("Schnell-Eintrag", systemImage: "plus.circle.fill")
            }
        }
        .displayName("Schnell-Eintrag")
        .description("Öffnet Daywerk direkt mit der Assistentin zum Eintragen.")
    }
}

@available(iOS 18.0, *)
struct FocusControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "io.github.pixeltoni.antonos.focus") {
            ControlWidgetButton(action: OpenURLIntent(AppLink.focus)) {
                Label("Fokus starten", systemImage: "timer")
            }
        }
        .displayName("Fokus starten")
        .description("Öffnet Daywerk und startet eine Fokus-Sitzung.")
    }
}
