import AppIntents
import SwiftUI
import WidgetKit

/* ---------- Haustier „Knubbel“ (Tamagotchi) ----------
   Bewegt sich wie der Läufer per Sekunden-Schrift (scripts/haustier-font.py), je Laune eine Schrift.
   Die Laune hängt nur am Füttern: Der Knopf im Widget (FeedPetIntent) merkt sich die Zeit im
   gemeinsamen Speicher, daraus folgen Essen → Party → froh → normal → Hunger → traurig → krank (ab 24 h)
   → tot (nach 48 h). Füttern macht ihn wieder gesund; nach dem Tod schlüpft per Knopf ein neues Ei. Nachts schläft er. */

enum TierZustand {
    static let fedKey = "tier.gefuettert"
    static let bornKey = "tier.geboren"
    static let mealsKey = "tier.mahlzeiten"

    /// Letzte Mahlzeit; beim allerersten Mal gilt er als vor einer Stunde gefüttert
    static func lastFed(now: Date = Date()) -> Date {
        let d = WidgetStore.defaults
        if let t = d?.object(forKey: fedKey) as? Double { return Date(timeIntervalSince1970: t) }
        let start = now.addingTimeInterval(-3600)
        d?.set(start.timeIntervalSince1970, forKey: fedKey)
        if d?.object(forKey: bornKey) == nil { d?.set(now.timeIntervalSince1970, forKey: bornKey) }
        return start
    }

    static func born(now: Date = Date()) -> Date {
        if let t = WidgetStore.defaults?.object(forKey: bornKey) as? Double { return Date(timeIntervalSince1970: t) }
        WidgetStore.defaults?.set(now.timeIntervalSince1970, forKey: bornKey)
        return now
    }

    static var meals: Int { WidgetStore.defaults?.integer(forKey: mealsKey) ?? 0 }

    /// Neues Ei: Alter und Mahlzeiten von vorn
    static func hatch(now: Date = Date()) {
        WidgetStore.defaults?.set(now.timeIntervalSince1970, forKey: bornKey)
        WidgetStore.defaults?.set(now.addingTimeInterval(-3600).timeIntervalSince1970, forKey: fedKey)
        WidgetStore.defaults?.set(0, forKey: mealsKey)
    }

    static func feed(now: Date = Date()) {
        _ = born(now: now)
        WidgetStore.defaults?.set(now.timeIntervalSince1970, forKey: fedKey)
        WidgetStore.defaults?.set(meals + 1, forKey: mealsKey)
    }
}

enum TierLaune: String {
    case essen, party, froh, normal, hunger, traurig, krank, tot, schlaf

    var font: String {
        switch self {
        case .essen: "AntonTierEssen-Regular"
        case .party: "AntonTierParty-Regular"
        case .froh: "AntonTierFroh-Regular"
        case .normal: "AntonTierNormal-Regular"
        case .hunger: "AntonTierHunger-Regular"
        case .traurig: "AntonTierTraurig-Regular"
        case .krank: "AntonTierKrank-Regular"
        case .tot: "AntonTierTot-Regular"
        case .schlaf: "AntonTierSchlaf-Regular"
        }
    }

    var text: String {
        switch self {
        case .essen: "Mampf, mampf!"
        case .party: "Danke! Knubbel ist satt"
        case .froh: "Knubbel ist gut gelaunt"
        case .normal: "Knubbel bummelt herum"
        case .hunger: "Knubbel hat Hunger"
        case .traurig: "Knubbel ist sehr hungrig"
        case .krank: "Knubbel ist krank! Füttern hilft"
        case .tot: "Knubbel ist gestorben"
        case .schlaf: "Knubbel schläft"
        }
    }

    var color: Color {
        switch self {
        case .essen: .red
        case .party: .pink
        case .froh: .orange
        case .normal: .teal
        case .hunger: .brown
        case .traurig: .indigo
        case .krank: .green
        case .tot: .gray
        case .schlaf: .purple
        }
    }

    /// Grenzen ab der letzten Mahlzeit (Sekunden)
    static let eatEnd: TimeInterval = 60
    static let partyEnd: TimeInterval = 5 * 60
    static let frohEnd: TimeInterval = 3 * 3600
    static let normalEnd: TimeInterval = 8 * 3600
    static let hungerEnd: TimeInterval = 16 * 3600
    static let sickStart: TimeInterval = 24 * 3600
    static let deathAfter: TimeInterval = 48 * 3600

    static func deathDate(fed: Date) -> Date { fed.addingTimeInterval(deathAfter) }

    static func aus(fed: Date, at date: Date) -> TierLaune {
        let since = date.timeIntervalSince(fed)
        if since < eatEnd { return .essen }
        if since < partyEnd { return .party }
        if since >= deathAfter { return .tot }
        if since >= sickStart { return .krank }
        let hour = Calendar.current.component(.hour, from: date)
        if hour >= 23 || hour < 6 { return .schlaf }
        if since < frohEnd { return .froh }
        if since < normalEnd { return .normal }
        if since < hungerEnd { return .hunger }
        return .traurig
    }

    /// Satt-Anzeige: 1 direkt nach dem Essen, 0 nach 16 Stunden
    static func fullness(fed: Date, at date: Date) -> Double {
        max(0, min(1, 1 - date.timeIntervalSince(fed) / hungerEnd))
    }
}

/// Füttern-Knopf im Widget
struct FeedPetIntent: AppIntent {
    static let title: LocalizedStringResource = "Knubbel füttern"
    static let isDiscoverable: Bool = false

    init() {}

    func perform() async throws -> some IntentResult {
        TierZustand.feed()
        WidgetCenter.shared.reloadTimelines(ofKind: "AntonOSHaustier")
        return .result()
    }
}

/// Nach dem Tod: neues Ei schlüpfen lassen
struct HatchPetIntent: AppIntent {
    static let title: LocalizedStringResource = "Neues Knubbel-Ei"
    static let isDiscoverable: Bool = false

    init() {}

    func perform() async throws -> some IntentResult {
        TierZustand.hatch()
        WidgetCenter.shared.reloadTimelines(ofKind: "AntonOSHaustier")
        return .result()
    }
}

struct HaustierEntry: TimelineEntry {
    let date: Date
    let fed: Date
    let born: Date
    let meals: Int
    var laune: TierLaune { TierLaune.aus(fed: fed, at: date) }
    var fullness: Double { TierLaune.fullness(fed: fed, at: date) }
    var death: Date { TierLaune.deathDate(fed: fed) }

    /// Alter bis jetzt (bzw. bis zum Tod), z. B. „3 Tage“ oder „5 Std.“
    var ageText: String {
        let end = laune == .tot ? death : date
        let hours = max(0, Int(end.timeIntervalSince(born) / 3600))
        if hours < 24 { return "\(hours) Std." }
        let days = hours / 24
        return days == 1 ? "1 Tag" : "\(days) Tage"
    }

    var ageShort: String {
        let end = laune == .tot ? death : date
        let hours = max(0, Int(end.timeIntervalSince(born) / 3600))
        return hours < 24 ? "\(hours)h" : "\(hours / 24)T"
    }
}

struct HaustierProvider: TimelineProvider {
    func placeholder(in context: Context) -> HaustierEntry {
        let now = Date()
        return HaustierEntry(date: now, fed: now.addingTimeInterval(-3600), born: now, meals: 3)
    }

    func getSnapshot(in context: Context, completion: @escaping (HaustierEntry) -> Void) {
        if context.isPreview { completion(placeholder(in: context)); return }
        let now = Date()
        completion(HaustierEntry(date: now, fed: TierZustand.lastFed(now: now), born: TierZustand.born(now: now), meals: TierZustand.meals))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HaustierEntry>) -> Void) {
        // Einträge an jeder Grenze, an der sich die Laune ändert (Mahlzeit-Abstände, 6 und 23 Uhr)
        let now = Date()
        let fed = TierZustand.lastFed(now: now)
        let born = TierZustand.born(now: now)
        let meals = TierZustand.meals
        let cal = Calendar.current
        let today = cal.startOfDay(for: now)
        let horizon = now.addingTimeInterval(24 * 3600)
        var times = [TierLaune.eatEnd, TierLaune.partyEnd, TierLaune.frohEnd, TierLaune.normalEnd, TierLaune.hungerEnd,
                     TierLaune.sickStart, TierLaune.deathAfter].map { fed.addingTimeInterval($0) }
        for day in 0...1 {
            for hour in [6, 23] {
                if let d = cal.date(byAdding: DateComponents(day: day, hour: hour), to: today) { times.append(d) }
            }
        }
        let dates = [now] + times.filter { $0 > now && $0 < horizon }.sorted()
        let entries = dates.map { HaustierEntry(date: $0, fed: fed, born: born, meals: meals) }
        completion(Timeline(entries: entries, policy: .after(horizon)))
    }
}

/// Füttern-Knopf, nach dem Tod „Neues Ei“
struct PetButton: View {
    let dead: Bool
    var compact = false

    var body: some View {
        if dead {
            Button(intent: HatchPetIntent()) {
                if compact {
                    Image(systemName: "oval.portrait.fill").font(.system(size: 18)).widgetAccentable()
                } else {
                    Label("Neues Ei", systemImage: "oval.portrait.fill").font(.caption.weight(.semibold))
                }
            }
            .tint(.gray)
            .accessibilityLabel("Neues Ei schlüpfen lassen")
        } else {
            Button(intent: FeedPetIntent()) {
                if compact {
                    Image(systemName: "fork.knife.circle.fill").font(.system(size: 20)).widgetAccentable()
                } else {
                    Label("Füttern", systemImage: "fork.knife").font(.caption.weight(.semibold))
                }
            }
            .tint(.red)
            .accessibilityLabel("Knubbel füttern")
        }
    }
}

/// Live laufender Countdown bis zum Tod (nur wenn krank)
struct DeathCountdown: View {
    let entry: HaustierEntry
    var prefix = true

    var body: some View {
        HStack(spacing: 2) {
            if prefix { Text("Stirbt in") }
            Text(timerInterval: entry.date...max(entry.death, entry.date.addingTimeInterval(1)), countsDown: true)
                .monospacedDigit()
        }
        .lineLimit(1)
        .minimumScaleFactor(0.6)
    }
}

struct HaustierView: View {
    @Environment(\.widgetFamily) private var family
    let entry: HaustierEntry

    var body: some View {
        let laune = entry.laune
        let dead = laune == .tot
        let bild = SekundenBild(font: laune.font, date: entry.date,
                                color: family == .accessoryRectangular ? .primary : laune.color,
                                label: laune.text)
        switch family {
        case .accessoryRectangular:
            HStack(spacing: 2) {
                bild
                VStack(spacing: 2) {
                    PetButton(dead: dead, compact: true).buttonStyle(.plain)
                    if laune == .krank {
                        Image(systemName: "cross.case.fill").font(.system(size: 9))
                        DeathCountdown(entry: entry, prefix: false).font(.system(size: 9, weight: .semibold))
                    } else {
                        Text(entry.ageShort).font(.system(size: 10, weight: .semibold))
                        if !dead {
                            Gauge(value: entry.fullness) { EmptyView() }
                                .gaugeStyle(.accessoryLinearCapacity)
                        }
                    }
                }
                .frame(width: 40)
            }
        case .systemSmall:
            VStack(spacing: 3) {
                bild
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 1) {
                        if laune == .krank {
                            DeathCountdown(entry: entry).font(.caption2.weight(.semibold)).foregroundStyle(.red)
                        } else {
                            Text(laune.text).font(.caption2).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.7)
                        }
                        Text("Alter: \(entry.ageText)").font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 2)
                    PetButton(dead: dead, compact: true).buttonStyle(.plain).foregroundStyle(dead ? .gray : .red)
                }
            }
        default:
            VStack(spacing: 6) {
                bild
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(laune.text).font(.caption.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.7)
                        if laune == .krank {
                            DeathCountdown(entry: entry).font(.caption.weight(.bold)).foregroundStyle(.red)
                        } else if !dead {
                            Gauge(value: entry.fullness) { EmptyView() }
                                .gaugeStyle(.accessoryLinearCapacity)
                                .tint(laune.color)
                        }
                        Text(dead ? "Wurde \(entry.ageText) alt · \(entry.meals) Mahlzeiten" : "Alter: \(entry.ageText) · \(entry.meals) Mahlzeiten")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    PetButton(dead: dead).buttonStyle(.borderedProminent)
                }
            }
        }
    }
}

struct HaustierWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AntonOSHaustier", provider: HaustierProvider()) { entry in
            HaustierView(entry: entry).widgetBackground()
        }
        .configurationDisplayName("Haustier")
        .description("Knubbel, dein Tamagotchi. Füttere ihn direkt im Widget, sonst wird er hungrig, krank und stirbt.")
        .supportedFamilies([.accessoryRectangular, .systemSmall, .systemMedium])
    }
}
