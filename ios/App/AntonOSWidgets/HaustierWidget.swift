import SwiftUI
import WidgetKit

/* ---------- Haustier „Knubbel“ ----------
   Bewegt sich wie der Läufer per Sekunden-Schrift (scripts/haustier-font.py), je Laune eine Schrift.
   Die Laune kommt aus dem Stand der App: Ringe, Gewohnheiten und Tageszeit. */

enum TierLaune: String {
    case normal, froh, party, traurig, schlaf

    var font: String {
        switch self {
        case .normal: "AntonTierNormal-Regular"
        case .froh: "AntonTierFroh-Regular"
        case .party: "AntonTierParty-Regular"
        case .traurig: "AntonTierTraurig-Regular"
        case .schlaf: "AntonTierSchlaf-Regular"
        }
    }

    var text: String {
        switch self {
        case .normal: "Knubbel bummelt herum"
        case .froh: "Knubbel freut sich über deinen Tag"
        case .party: "Party! Alles geschafft"
        case .traurig: "Knubbel wartet auf deine Ringe"
        case .schlaf: "Knubbel schläft"
        }
    }

    var color: Color {
        switch self {
        case .normal: .teal
        case .froh: .orange
        case .party: .pink
        case .traurig: .indigo
        case .schlaf: .purple
        }
    }

    /// Nachts schläft Knubbel; Ringe zu oder alle Gewohnheiten erledigt → Party;
    /// halber Tag geschafft → froh; abends kaum etwas getan → traurig.
    static func aus(_ snap: Snapshot?, at date: Date) -> TierLaune {
        let hour = Calendar.current.component(.hour, from: date)
        if hour >= 23 || hour < 6 { return .schlaf }
        guard let snap else { return .normal }
        let done = snap.habits.filter(\.done).count
        if snap.ringsClosed || (!snap.habits.isEmpty && done == snap.habits.count) { return .party }
        var parts = snap.rings.map { min(max($0.share, 0), 1) }
        if !snap.habits.isEmpty { parts.append(Double(done) / Double(snap.habits.count)) }
        let progress = parts.isEmpty ? 0 : parts.reduce(0, +) / Double(parts.count)
        if progress >= 0.5 { return .froh }
        if hour >= 18 && progress < 0.25 { return .traurig }
        return .normal
    }
}

struct HaustierEntry: TimelineEntry {
    let date: Date
    let laune: TierLaune
}

struct HaustierProvider: TimelineProvider {
    func placeholder(in context: Context) -> HaustierEntry { HaustierEntry(date: Date(), laune: .froh) }

    func getSnapshot(in context: Context, completion: @escaping (HaustierEntry) -> Void) {
        let now = Date()
        completion(HaustierEntry(date: now, laune: context.isPreview ? .froh : TierLaune.aus(WidgetStore.load(), at: now)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HaustierEntry>) -> Void) {
        // Neue Einträge, wenn sich die Laune allein durch die Uhrzeit ändert (6, 18, 23 Uhr);
        // nach Mitternacht neu laden. Änderungen in der App laden ohnehin alle Widgets neu.
        let now = Date()
        let cal = Calendar.current
        let start = cal.startOfDay(for: now)
        let snap = WidgetStore.load()
        let times = [now] + [6, 18, 23].compactMap { cal.date(byAdding: .hour, value: $0, to: start) }.filter { $0 > now }
        let entries = times.map { HaustierEntry(date: $0, laune: TierLaune.aus(snap, at: $0)) }
        let tomorrow = cal.date(byAdding: .day, value: 1, to: start) ?? now.addingTimeInterval(86400)
        completion(Timeline(entries: entries, policy: .after(tomorrow.addingTimeInterval(60))))
    }
}

struct HaustierView: View {
    @Environment(\.widgetFamily) private var family
    let entry: HaustierEntry

    var body: some View {
        let bild = SekundenBild(font: entry.laune.font, date: entry.date,
                                color: family == .accessoryRectangular ? .primary : entry.laune.color,
                                label: entry.laune.text)
        switch family {
        case .accessoryRectangular:
            bild
        default:
            VStack(spacing: 6) {
                bild
                Text(entry.laune.text)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
    }
}

struct HaustierWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AntonOSHaustier", provider: HaustierProvider()) { entry in
            HaustierView(entry: entry).widgetBackground().widgetURL(AppLink.page("heute"))
        }
        .configurationDisplayName("Haustier")
        .description("Knubbel lebt auf deinem Sperrbildschirm. Seine Laune hängt an deinen Ringen und Gewohnheiten.")
        .supportedFamilies([.accessoryRectangular, .systemSmall, .systemMedium])
    }
}
