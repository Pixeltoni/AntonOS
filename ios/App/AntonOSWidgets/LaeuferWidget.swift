import SwiftUI
import WidgetKit

/* ---------- Läufer: bewegtes Strichmännchen ----------
   Widgets können nicht animieren, ein Sekunden-Zähler tickt aber live weiter. Die Schrift
   „AntonLaeufer“ (scripts/laeufer-font.py) versteckt Stunden, Minuten und Doppelpunkte und
   macht aus den Sekunden 00–59 je ein Bild: Das Männchen läuft einmal pro Minute hin und zurück,
   mit einem Bild pro Sekunde. */

struct LaeuferEntry: TimelineEntry {
    let date: Date
}

struct LaeuferProvider: TimelineProvider {
    func placeholder(in context: Context) -> LaeuferEntry { LaeuferEntry(date: Date()) }

    func getSnapshot(in context: Context, completion: @escaping (LaeuferEntry) -> Void) {
        completion(LaeuferEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LaeuferEntry>) -> Void) {
        // Der Zähler läuft ab Mitternacht (höchstens zweistellige Stunden); danach neu anfangen
        let now = Date()
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: now)) ?? now.addingTimeInterval(86400)
        completion(Timeline(entries: [LaeuferEntry(date: now)], policy: .after(tomorrow)))
    }
}

/// Zeigt einen ab Mitternacht laufenden Sekunden-Zähler in einer Sekunden-Schrift (60 Bilder, 2,2 : 1)
struct SekundenBild: View {
    let font: String
    let date: Date
    var color: Color = .primary
    var label: String

    var body: some View {
        GeometryReader { geo in
            // Ein Bild ist 2,2-mal so breit wie hoch
            let size = max(1, min(geo.size.height, geo.size.width / 2.2) * 0.96)
            Text(Calendar.current.startOfDay(for: date), style: .timer)
                .font(.custom(font, fixedSize: size))
                .lineLimit(1)
                .multilineTextAlignment(.center)
                .foregroundStyle(color)
                .widgetAccentable()
                .frame(width: geo.size.width, height: geo.size.height)
        }
        .accessibilityElement()
        .accessibilityLabel(label)
    }
}

struct LaeuferView: View {
    @Environment(\.widgetFamily) private var family
    let entry: LaeuferEntry

    var body: some View {
        SekundenBild(font: "AntonLaeufer-Regular", date: entry.date,
                     color: family == .accessoryRectangular ? .primary : .orange,
                     label: "Laufendes Strichmännchen")
    }
}

struct LaeuferWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AntonOSLaeufer", provider: LaeuferProvider()) { entry in
            LaeuferView(entry: entry).widgetBackground()
        }
        .configurationDisplayName("Läufer")
        .description("Ein Strichmännchen, das über deinen Sperrbildschirm läuft.")
        .supportedFamilies([.accessoryRectangular, .systemSmall, .systemMedium])
    }
}
