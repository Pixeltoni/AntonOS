import SwiftUI
import WidgetKit
import AppIntents

/* ---------- Zeitleiste: alle Widgets lesen denselben Stand der App ---------- */

struct SnapshotEntry: TimelineEntry {
    let date: Date
    let snapshot: Snapshot
    /// Die App hat noch keinen Stand abgelegt
    var empty = false
    var target: CountdownTarget = .automatic
}

enum Timelines {
    static func make(target: CountdownTarget = .automatic) -> Timeline<SnapshotEntry> {
        let now = Date()
        guard let snap = WidgetStore.load() else {
            return Timeline(entries: [SnapshotEntry(date: now, snapshot: .preview, empty: true, target: target)], policy: .after(now.addingTimeInterval(3600)))
        }
        let dates = [now] + snap.changes(after: now)
        let entries = dates.map { SnapshotEntry(date: $0, snapshot: snap, target: target) }
        return Timeline(entries: entries, policy: .after(now.addingTimeInterval(6 * 3600)))
    }

    static func current(preview: Bool, target: CountdownTarget = .automatic) -> SnapshotEntry {
        if preview { return SnapshotEntry(date: Date(), snapshot: .preview, target: target) }
        if let snap = WidgetStore.load() { return SnapshotEntry(date: Date(), snapshot: snap, target: target) }
        return SnapshotEntry(date: Date(), snapshot: .preview, empty: true, target: target)
    }
}

struct SnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry { SnapshotEntry(date: Date(), snapshot: .preview) }

    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        completion(Timelines.current(preview: context.isPreview))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        completion(Timelines.make())
    }
}

struct CountdownProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry { SnapshotEntry(date: Date(), snapshot: .preview) }

    func snapshot(for configuration: CountdownConfigIntent, in context: Context) async -> SnapshotEntry {
        Timelines.current(preview: context.isPreview, target: configuration.target)
    }

    func timeline(for configuration: CountdownConfigIntent, in context: Context) async -> Timeline<SnapshotEntry> {
        Timelines.make(target: configuration.target)
    }
}

/* ---------- Bausteine ---------- */

/// Hintergrund nur auf dem Homescreen; auf dem Sperrbildschirm zeichnet iOS selbst.
/// Gleicher Look wie die App (Design 2026): ruhiger Farbverlauf in der Farbe des Widgets,
/// darüber Milchglas mit heller Kante. In den Modi „Getönt“ und „Klar“ ersetzt iOS ihn selbst.
struct WidgetBackground: ViewModifier {
    @Environment(\.widgetFamily) private var family
    var color: Color? = nil
    /// Farbe des Bereichs, wie die Karten in der App
    var tint: Color? = nil
    /// Dunkle Hero-Karte (Ringe, wie Wallet und Ringe in der App)
    var hero = false

    @ViewBuilder
    func body(content: Content) -> some View {
        switch family {
        case .accessoryCircular, .accessoryRectangular, .accessoryInline:
            content.containerBackground(for: .widget) { Color.clear }
        default:
            if hero {
                content.containerBackground(for: .widget) { HeroBackground() }
            } else if let color {
                content.containerBackground(for: .widget) { color }
            } else if let tint {
                content.containerBackground(for: .widget) { MeshBackground(tint: tint) }
            } else {
                content.containerBackground(.background, for: .widget)
            }
        }
    }
}

/// Farbverlauf wie der Hintergrund der App: Bereichsfarbe oben links, zweite Farbe unten rechts
struct MeshBackground: View {
    @Environment(\.colorScheme) private var scheme
    let tint: Color

    var body: some View {
        let dark = scheme == .dark
        ZStack {
            Color(uiColor: .systemBackground)
            RadialGradient(colors: [tint.opacity(dark ? 0.42 : 0.30), .clear], center: .topLeading, startRadius: 0, endRadius: 230)
            RadialGradient(colors: [(dark ? Color(hex: "#5e5ce6") : Color(hex: "#ff9ec4")).opacity(dark ? 0.26 : 0.22), .clear], center: .bottomTrailing, startRadius: 0, endRadius: 210)
            // Milchglas: zarter Schimmer oben und helle Kante
            LinearGradient(colors: [Color.white.opacity(dark ? 0.06 : 0.35), .clear], startPoint: .top, endPoint: .center)
            ContainerRelativeShape()
                .stroke(LinearGradient(colors: [Color.white.opacity(dark ? 0.18 : 0.7), Color.white.opacity(0), Color.white.opacity(dark ? 0.08 : 0.3)], startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 2)
        }
    }
}

/// Dunkler Verlauf der Hero-Karten in der App
struct HeroBackground: View {
    var body: some View {
        ZStack {
            RadialGradient(colors: [Color(hex: "#3b3560"), Color(hex: "#1d1b33"), Color(hex: "#0d0c18")], center: .topTrailing, startRadius: 0, endRadius: 260)
            ContainerRelativeShape()
                .stroke(LinearGradient(colors: [Color.white.opacity(0.22), Color.white.opacity(0)], startPoint: .top, endPoint: .center), lineWidth: 2)
        }
    }
}

extension View {
    func widgetBackground(_ color: Color? = nil, tint: Color? = nil, hero: Bool = false) -> some View { modifier(WidgetBackground(color: color, tint: tint, hero: hero)) }
}

struct Caption: View {
    let text: String
    var icon: String? = nil
    var color: Color = .secondary

    var body: some View {
        HStack(spacing: 4) {
            if let icon { Image(systemName: icon).foregroundStyle(color) }
            Text(text.uppercased()).tracking(0.4).foregroundStyle(icon == nil ? color : Color.secondary)
        }
        .font(.system(size: 11, weight: .bold))
        .lineLimit(1)
    }
}

/// Hinweis, solange die App noch keinen Stand abgelegt hat
struct EmptyHint: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: "arrow.up.forward.app").font(.title3).foregroundStyle(.blue)
            Text("AntonOS einmal öffnen").font(.caption.weight(.semibold))
            Text("Dann erscheinen hier deine Daten.").font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct RingsView: View {
    let rings: [WRing]
    var lineWidth: CGFloat = 10
    var monochrome = false

    var body: some View {
        ZStack {
            ForEach(Array(rings.prefix(3).enumerated()), id: \.offset) { index, ring in
                let inset = CGFloat(index) * (lineWidth + 2) + lineWidth / 2
                Circle()
                    .stroke(monochrome ? Color.primary.opacity(0.2) : Color(hex: ring.track), lineWidth: lineWidth)
                    .padding(inset)
                Circle()
                    .trim(from: 0, to: CGFloat(min(max(ring.share, 0), 1)))
                    .stroke(monochrome ? Color.primary : Color(hex: ring.color), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .padding(inset)
            }
        }
        .aspectRatio(1, contentMode: .fit)
    }
}

struct TaskRow: View {
    let task: WTask

    var body: some View {
        Button(intent: ToggleItemIntent(kind: "task", id: task.id, done: !task.done)) {
            HStack(spacing: 7) {
                Image(systemName: task.done ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 17))
                    .foregroundStyle(task.done ? Color.green : (task.overdue ? Color.red : Color.secondary))
                Text(task.title)
                    .font(.caption.weight(.medium))
                    .strikethrough(task.done)
                    .foregroundStyle(task.done ? Color.secondary : Color.primary)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
        }
        .buttonStyle(.plain)
    }
}

struct AgendaRow: View {
    let item: WAgenda
    let now: Date

    var body: some View {
        HStack(spacing: 7) {
            RoundedRectangle(cornerRadius: 2).fill(Color(hex: item.color)).frame(width: 3)
            VStack(alignment: .leading, spacing: 1) {
                Text(item.title).font(.caption.weight(.semibold)).lineLimit(1)
                Text(subtitle).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private var subtitle: String {
        var parts: [String] = []
        if item.day != WidgetStore.dayString(now) { parts.append("Morgen") }
        parts.append(item.timeText)
        if !item.location.isEmpty { parts.append(item.location) }
        return parts.joined(separator: " · ")
    }
}

/* ---------- 1 Nächster Wecker ---------- */

struct AlarmView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    var body: some View {
        let ring = entry.snapshot.alarm?.next(after: entry.date)
        let next = ring?.date
        switch family {
        case .accessoryInline:
            if let next {
                Label(Fmt.time(next), systemImage: "alarm.fill")
            } else {
                Label("Kein Wecker", systemImage: "alarm")
            }
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 1) {
                    Image(systemName: "alarm.fill").font(.system(size: 12)).widgetAccentable()
                    Text(next.map { Fmt.time($0) } ?? "Aus")
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                }
                .padding(4)
            }
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 0) {
                Label("Wecker", systemImage: "alarm.fill").font(.caption.weight(.semibold)).widgetAccentable()
                Text(next.map { Fmt.time($0) } ?? "Aus").font(.system(size: 26, weight: .semibold, design: .rounded))
                if let next, let alarm = ring {
                    Text("\(Fmt.dayLabel(next, now: entry.date)) · \(alarm.title)").font(.caption).lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        default:
            VStack(alignment: .leading, spacing: 2) {
                Caption(text: "Wecker", icon: "alarm.fill", color: .orange)
                Spacer(minLength: 0)
                if entry.empty {
                    EmptyHint()
                } else if let next, let alarm = ring {
                    Text(Fmt.time(next))
                        .font(.system(size: 42, weight: .semibold, design: .rounded))
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    Text("\(Fmt.dayLabel(next, now: entry.date)) · \(alarm.repeatText)")
                        .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    Spacer(minLength: 0)
                    Label(alarm.sound, systemImage: "music.note")
                        .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                } else {
                    Text("Kein Wecker").font(.headline)
                    Text("Tippen zum Stellen").font(.caption).foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

struct AlarmWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AntonOSAlarm", provider: SnapshotProvider()) { entry in
            AlarmView(entry: entry).widgetBackground(tint: .orange).widgetURL(AppLink.page("wecker"))
        }
        .configurationDisplayName("Nächster Wecker")
        .description("Wann dein nächster AntonOS-Wecker klingelt.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

/* ---------- 2 Aktivitätsringe ---------- */

struct RingsWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    var body: some View {
        let rings = entry.snapshot.rings
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                RingsView(rings: rings, lineWidth: 5, monochrome: true).padding(3).widgetAccentable()
            }
        case .accessoryRectangular:
            HStack(spacing: 8) {
                RingsView(rings: rings, lineWidth: 5, monochrome: true).widgetAccentable()
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(rings.prefix(3).enumerated()), id: \.offset) { _, ring in
                        Text("\(ring.label) \(ring.text)").font(.caption2).lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }
        default:
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 10) {
                    RingsView(rings: rings, lineWidth: 11)
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(rings.prefix(3).enumerated()), id: \.offset) { _, ring in
                            Text(ring.text)
                                .font(.system(size: 12, weight: .semibold, design: .rounded))
                                .foregroundStyle(Color(hex: ring.color))
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                        }
                    }
                }
                Spacer(minLength: 0)
                Text(entry.snapshot.ringsClosed ? "Alle Ringe geschlossen 🎉" : rings.map(\.label).joined(separator: " · "))
                    .font(.caption2)
                    .foregroundStyle(Color.gray)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

struct RingsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AntonOSRings", provider: SnapshotProvider()) { entry in
            RingsWidgetView(entry: entry).widgetBackground(hero: true).widgetURL(AppLink.page("gewohnheiten"))
        }
        .configurationDisplayName("Aktivitätsringe")
        .description("Deine drei Ringe mit dem Stand von heute.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
    }
}

/* ---------- 3 Heute: Termine und Aufgaben ---------- */

struct TodayView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    var body: some View {
        let large = family == .systemLarge
        let agenda = Array(entry.snapshot.upcoming(at: entry.date).prefix(large ? 5 : 3))
        let tasks = Array(entry.snapshot.tasks.prefix(large ? 6 : 3))
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("\(Fmt.weekday(entry.date)), \(Fmt.longDay(entry.date))")
                    .font(.system(.subheadline, design: .rounded, weight: .bold))
                    .lineLimit(1)
                Spacer()
                Text("HEUTE").font(.system(size: 11, weight: .semibold)).foregroundStyle(.red)
            }
            if entry.empty {
                EmptyHint()
            } else if large {
                Caption(text: "Termine", icon: "calendar", color: .red)
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(agenda.enumerated()), id: \.offset) { _, item in AgendaRow(item: item, now: entry.date) }
                    if agenda.isEmpty { Text("Keine Termine mehr").font(.caption).foregroundStyle(.secondary) }
                }
                Divider()
                Caption(text: "Aufgaben · \(entry.snapshot.tasksOpen) offen", icon: "checklist", color: .blue)
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(tasks, id: \.id) { TaskRow(task: $0) }
                    if tasks.isEmpty { Text("Alles erledigt 🎉").font(.caption).foregroundStyle(.secondary) }
                }
                Spacer(minLength: 0)
            } else {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(Array(agenda.enumerated()), id: \.offset) { _, item in AgendaRow(item: item, now: entry.date) }
                        if agenda.isEmpty { Text("Keine Termine mehr").font(.caption).foregroundStyle(.secondary) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Divider()
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(tasks, id: \.id) { TaskRow(task: $0) }
                        if tasks.isEmpty { Text("Alles erledigt 🎉").font(.caption).foregroundStyle(.secondary) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AntonOSToday", provider: SnapshotProvider()) { entry in
            TodayView(entry: entry).widgetBackground(tint: .blue).widgetURL(AppLink.page("kalender"))
        }
        .configurationDisplayName("Heute")
        .description("Nächste Termine und Aufgaben für heute – zum Abhaken.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

/* ---------- 4 Gewohnheiten ---------- */

/// Farbe der Gewohnheiten wie in der App (Mini-Ringe auf der Gewohnheiten-Seite)
enum HabitStyle {
    static let accent = Color(hex: "#00B8D4")
    static let track = Color(hex: "#00B8D4").opacity(0.18)
    /// Wochentage der letzten 7 Tage, heute zuletzt („M D M D F S S“)
    static func weekLetters(_ now: Date) -> [String] {
        let letters = ["S", "M", "D", "M", "D", "F", "S"]
        let cal = Calendar.current
        return (0..<7).map { i in
            let day = cal.date(byAdding: .day, value: i - 6, to: now) ?? now
            return letters[(cal.component(.weekday, from: day) - 1) % 7]
        }
    }
}

extension Snapshot {
    var habitsDone: Int { habits.filter(\.done).count }
    /// Längste laufende Serie
    var bestHabit: WHabit? { habits.filter { $0.streak >= 2 }.max { $0.streak < $1.streak } }

    /// Passt nicht alles hinein, kommen offene Gewohnheiten zuerst (sonst Reihenfolge wie in der App)
    func habitSlots(_ count: Int) -> [WHabit] {
        if habits.count <= count { return habits }
        return Array((habits.filter { !$0.done } + habits.filter(\.done)).prefix(count))
    }
}

/// Runder Knopf: Ring zeigt den Tagesstand, erledigt ist er gefüllt mit Haken
struct HabitCheck: View {
    let habit: WHabit
    var size: CGFloat = 30

    var body: some View {
        let line = max(2.5, size / 11)
        ZStack {
            if habit.done {
                Circle().fill(HabitStyle.accent)
                Image(systemName: "checkmark").font(.system(size: size * 0.42, weight: .heavy)).foregroundStyle(Color.white)
            } else {
                Circle().stroke(HabitStyle.track, lineWidth: line)
                if habit.share > 0 {
                    Circle()
                        .trim(from: 0, to: CGFloat(habit.share))
                        .stroke(HabitStyle.accent, style: StrokeStyle(lineWidth: line, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                }
                Text(habit.icon.isEmpty ? "•" : habit.icon).font(.system(size: size * 0.46))
            }
        }
        .frame(width: size, height: size)
    }
}

/// Punkte der letzten 7 Tage, heute zuletzt und umrandet
struct WeekDots: View {
    let week: [Bool]
    var dot: CGFloat = 6

    var body: some View {
        HStack(spacing: dot * 0.55) {
            ForEach(Array(week.suffix(7).enumerated()), id: \.offset) { index, on in
                Circle()
                    .fill(on ? HabitStyle.accent : Color.secondary.opacity(0.2))
                    .frame(width: dot, height: dot)
                    .overlay {
                        if index == min(week.count, 7) - 1 {
                            Circle().stroke(HabitStyle.accent.opacity(0.8), lineWidth: 1).frame(width: dot + 3, height: dot + 3)
                        }
                    }
                    .frame(width: dot + 3, height: dot + 3)
            }
        }
    }
}

/// Zeile mit Knopf, Name, Stand und Woche – der ganze Streifen ist zum Tippen
struct HabitLine: View {
    let habit: WHabit
    var check: CGFloat = 28
    var showWeek = true

    var detail: String {
        var parts: [String] = []
        if habit.isAmount { parts.append(habit.amountText) } else if habit.done { parts.append("Erledigt") } else { parts.append("Offen") }
        if habit.streak > 0 { parts.append("🔥 \(habit.streak)") }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        Button(intent: habit.tapIntent) {
            HStack(spacing: 8) {
                HabitCheck(habit: habit, size: check)
                VStack(alignment: .leading, spacing: 0) {
                    Text(habit.done && !habit.icon.isEmpty ? "\(habit.icon) \(habit.name)" : habit.name)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(habit.done ? Color.secondary : Color.primary)
                        .lineLimit(1)
                    Text(detail)
                        .font(.system(size: 10.5, weight: .medium, design: .rounded))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 4)
                if showWeek, let week = habit.week, !week.isEmpty {
                    WeekDots(week: week)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Großer Ring „3/5“ für den Tagesstand
struct HabitSummaryRing: View {
    let done: Int
    let total: Int
    var size: CGFloat = 76

    var body: some View {
        let line = size / 8.5
        let share = total > 0 ? Double(done) / Double(total) : 0
        ZStack {
            Circle().stroke(HabitStyle.track, lineWidth: line)
            Circle()
                .trim(from: 0, to: CGFloat(share))
                .stroke(HabitStyle.accent, style: StrokeStyle(lineWidth: line, lineCap: .round))
                .rotationEffect(.degrees(-90))
            if total > 0 && done == total {
                Image(systemName: "checkmark").font(.system(size: size * 0.32, weight: .heavy)).foregroundStyle(HabitStyle.accent)
            } else {
                Text("\(done)/\(total)")
                    .font(.system(size: size * 0.26, weight: .bold, design: .rounded))
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                    .padding(line)
            }
        }
        .frame(width: size, height: size)
    }
}

struct HabitsView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    var snap: Snapshot { entry.snapshot }

    var statusText: String {
        let open = snap.habits.count - snap.habitsDone
        if open == 0 { return "Alles erledigt 🎉" }
        return open == 1 ? "Noch 1 offen" : "Noch \(open) offen"
    }

    var body: some View {
        switch family {
        case .accessoryCircular:
            if entry.empty {
                ZStack { AccessoryWidgetBackground(); Image(systemName: "checkmark.seal.fill").font(.title3) }
            } else {
                circular
            }
        case .accessoryRectangular:
            if entry.empty {
                VStack(alignment: .leading, spacing: 1) {
                    Label("Gewohnheiten", systemImage: "checkmark.seal.fill").font(.headline).widgetAccentable()
                    Text("AntonOS einmal öffnen").font(.caption)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                rectangular
            }
        case .accessoryInline:
            Text(entry.empty ? "AntonOS öffnen" : snap.habits.isEmpty ? "Keine Gewohnheiten" : "✓ \(snap.habitsDone)/\(snap.habits.count) Gewohnheiten")
        default:
            VStack(alignment: .leading, spacing: 8) {
                header
                if entry.empty {
                    EmptyHint()
                } else if snap.habits.isEmpty {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Noch keine Gewohnheiten").font(.caption.weight(.semibold))
                        Text("In AntonOS anlegen – dann hakst du sie hier ab.").font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                } else if family == .systemSmall {
                    small
                } else if family == .systemLarge {
                    large
                } else {
                    medium
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    var header: some View {
        HStack {
            Caption(text: "Gewohnheiten", icon: "checkmark.seal.fill", color: HabitStyle.accent)
            Spacer(minLength: 4)
            if !entry.empty && !snap.habits.isEmpty && family != .systemMedium {
                Text("\(snap.habitsDone)/\(snap.habits.count)")
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundStyle(snap.habitsDone == snap.habits.count ? HabitStyle.accent : Color.secondary)
            }
        }
    }

    /// Bis zu 6 Knöpfe im Raster, darunter die beste Serie
    var small: some View {
        let more = snap.habits.count > 6
        let shown = snap.habitSlots(more ? 5 : 6)
        let rows = stride(from: 0, to: max(shown.count + (more ? 1 : 0), 1), by: 3).map { $0 }
        return VStack(alignment: .leading, spacing: 0) {
            Spacer(minLength: 0)
            VStack(spacing: 8) {
                ForEach(rows, id: \.self) { start in
                    HStack(spacing: 0) {
                        ForEach(start..<start + 3, id: \.self) { i in
                            Group {
                                if i < shown.count {
                                    Button(intent: shown[i].tapIntent) { HabitCheck(habit: shown[i], size: 38) }.buttonStyle(.plain)
                                } else if more && i == shown.count {
                                    Text("+\(snap.habits.count - shown.count)")
                                        .font(.system(size: 13, weight: .bold, design: .rounded))
                                        .foregroundStyle(.secondary)
                                        .frame(width: 38, height: 38)
                                        .background(Circle().fill(Color.secondary.opacity(0.12)))
                                } else {
                                    Color.clear.frame(width: 38, height: 38)
                                }
                            }
                            .frame(maxWidth: .infinity)
                        }
                    }
                }
            }
            Spacer(minLength: 0)
            Group {
                if let best = snap.bestHabit, snap.habitsDone < snap.habits.count {
                    Text("🔥 \(best.streak) Tage \(best.name)")
                } else {
                    Text(statusText)
                }
            }
            .font(.caption2.weight(.medium))
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        }
    }

    /// Ring mit Tagesstand links, vier Gewohnheiten mit Woche rechts
    var medium: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(spacing: 6) {
                HabitSummaryRing(done: snap.habitsDone, total: snap.habits.count, size: 72)
                Text(statusText)
                    .font(.system(size: 10.5, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(width: 84)
            VStack(alignment: .leading, spacing: 4) {
                ForEach(snap.habitSlots(4), id: \.id) { HabitLine(habit: $0, check: 24) }
                Spacer(minLength: 0)
            }
        }
        .frame(maxHeight: .infinity)
    }

    /// Ring, Fortschritt und bis zu 6 Gewohnheiten mit Wochenübersicht
    var large: some View {
        let shown = snap.habitSlots(6)
        let rest = snap.habits.count - shown.count
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                HabitSummaryRing(done: snap.habitsDone, total: snap.habits.count, size: 58)
                VStack(alignment: .leading, spacing: 2) {
                    Text(statusText).font(.system(.subheadline, design: .rounded, weight: .bold))
                    if let best = snap.bestHabit {
                        Text("🔥 Beste Serie: \(best.icon) \(best.name), \(best.streak) Tage").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                    } else {
                        Text("Tippe auf eine Gewohnheit zum Abhaken").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }
            HStack {
                Text("HEUTE").font(.system(size: 9, weight: .bold)).foregroundStyle(.secondary)
                Spacer()
                HStack(spacing: 6 * 0.55) {
                    ForEach(Array(HabitStyle.weekLetters(entry.date).enumerated()), id: \.offset) { index, letter in
                        Text(letter)
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(index == 6 ? HabitStyle.accent : Color.secondary)
                            .frame(width: 9)
                    }
                }
            }
            .padding(.bottom, -6)
            VStack(alignment: .leading, spacing: 6) {
                ForEach(shown, id: \.id) { HabitLine(habit: $0, check: 30) }
            }
            Spacer(minLength: 0)
            if rest > 0 {
                Text("+ \(rest) weitere in der App").font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    var circular: some View {
        let total = max(snap.habits.count, 1)
        return Gauge(value: Double(snap.habitsDone), in: 0...Double(total)) {
            Image(systemName: "checkmark.seal.fill")
        } currentValueLabel: {
            Text("\(snap.habitsDone)/\(snap.habits.count)").font(.system(size: 13, weight: .bold, design: .rounded))
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .widgetAccentable()
    }

    var rectangular: some View {
        let open = snap.habits.filter { !$0.done }
        return VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 4) {
                Image(systemName: "checkmark.seal.fill")
                Text("Gewohnheiten \(snap.habitsDone)/\(snap.habits.count)")
            }
            .font(.headline)
            .widgetAccentable()
            if open.isEmpty {
                Text(snap.habits.isEmpty ? "Noch keine angelegt" : "Alles erledigt 🎉").font(.caption)
            } else {
                Text(open.prefix(3).map { $0.icon.isEmpty ? $0.name : "\($0.icon) \($0.name)" }.joined(separator: " · "))
                    .font(.caption)
                    .lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct HabitsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AntonOSHabits", provider: SnapshotProvider()) { entry in
            HabitsView(entry: entry).widgetBackground(tint: HabitStyle.accent).widgetURL(AppLink.page("gewohnheiten"))
        }
        .configurationDisplayName("Gewohnheiten")
        .description("Tagesstand, Serien und die letzten 7 Tage – mit einem Tipp abhaken, Mengen Portion für Portion.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

/* ---------- 5 Training ---------- */

struct TrainingView: View {
    let entry: SnapshotEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Caption(text: "Training", icon: "dumbbell.fill", color: .green)
            if entry.empty {
                EmptyHint()
            } else if let t = entry.snapshot.training {
                Spacer(minLength: 0)
                Text(t.title).font(.title3.weight(.bold)).lineLimit(1).minimumScaleFactor(0.7)
                if !t.detail.isEmpty {
                    Text(t.detail).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
                }
                if t.doneToday {
                    Label("Erledigt", systemImage: "checkmark.circle.fill").font(.caption2.weight(.semibold)).foregroundStyle(.green)
                } else if t.fromPlan {
                    Text("Als Nächstes laut Plan").font(.caption2).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                if t.weekGoal > 0 {
                    HStack(spacing: 3) {
                        ForEach(0..<min(t.weekGoal, 7), id: \.self) { i in
                            Capsule().fill(i < t.weekDone ? Color.green : Color.secondary.opacity(0.25)).frame(height: 6)
                        }
                    }
                    Text("\(t.weekDone) von \(t.weekGoal) diese Woche").font(.caption2).foregroundStyle(.secondary)
                }
            } else {
                Spacer(minLength: 0)
                Text("Kein Training geplant").font(.subheadline.weight(.semibold))
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct TrainingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AntonOSTraining", provider: SnapshotProvider()) { entry in
            TrainingView(entry: entry).widgetBackground(tint: .green).widgetURL(AppLink.page("training"))
        }
        .configurationDisplayName("Training heute")
        .description("Was im Training dran ist und dein Wochenstand.")
        .supportedFamilies([.systemSmall])
    }
}

/* ---------- 6 Countdown ---------- */

struct CountdownView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    private var item: WCountdown? {
        let s = entry.snapshot
        switch entry.target {
        case .exam: return s.exam
        case .trip: return s.trip
        case .automatic:
            guard let exam = s.exam else { return s.trip }
            guard let trip = s.trip else { return exam }
            return trip.date < exam.date ? trip : exam
        }
    }

    var body: some View {
        let item = self.item
        let days = item.flatMap { WidgetStore.daysUntil($0.date, from: entry.date) }
        let isTrip = item?.kind == "trip"
        let label = isTrip ? "Nächste Reise" : "Nächste Prüfung"
        let number = days.map { $0 <= 0 ? "Heute" : "\($0)" } ?? "–"
        switch family {
        case .accessoryInline:
            if let item, let days {
                Text(days <= 0 ? "\(item.title) heute" : "\(item.title) in \(days) T.")
            } else {
                Text("Kein Countdown")
            }
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Text(number).font(.system(size: (days ?? 1) <= 0 ? 12 : 20, weight: .semibold, design: .rounded)).minimumScaleFactor(0.5)
                    Text((days ?? 0) == 1 ? "Tag" : "Tage").font(.system(size: 9, weight: .semibold))
                }
            }
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 0) {
                Text(label).font(.caption.weight(.semibold)).widgetAccentable()
                Text(item?.title ?? "Nichts geplant").font(.headline).lineLimit(1)
                if let days { Text(days <= 0 ? "Heute" : "in \(days) \(days == 1 ? "Tag" : "Tagen")").font(.caption) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        default:
            VStack(alignment: .leading, spacing: 2) {
                Caption(text: label, icon: isTrip ? "airplane" : "graduationcap.fill", color: item.map { Color(hex: $0.color) } ?? .orange)
                if entry.empty {
                    EmptyHint()
                } else if let item, let days {
                    Spacer(minLength: 0)
                    HStack(alignment: .firstTextBaseline, spacing: 5) {
                        Text(number).font(.system(size: 44, weight: .semibold, design: .rounded)).minimumScaleFactor(0.5).lineLimit(1)
                        if days > 0 { Text(days == 1 ? "Tag" : "Tage").font(.headline) }
                    }
                    Text(item.title).font(.subheadline.weight(.semibold)).lineLimit(2)
                    if let date = WidgetStore.date(fromDay: item.date) {
                        Text(item.time.isEmpty ? Fmt.dayMonth(date) : "\(Fmt.dayMonth(date)) · \(item.time)")
                            .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                    }
                } else {
                    Spacer(minLength: 0)
                    Text("Nichts geplant").font(.subheadline.weight(.semibold))
                    Spacer(minLength: 0)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

struct CountdownWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "AntonOSCountdown", intent: CountdownConfigIntent.self, provider: CountdownProvider()) { entry in
            CountdownView(entry: entry).widgetBackground(tint: .orange).widgetURL(AppLink.page(entry.snapshot.exam != nil && entry.target != .trip ? "pruefungen" : "reisen"))
        }
        .configurationDisplayName("Countdown")
        .description("Tage bis zur nächsten Prüfung oder Reise. Lange drücken zum Auswählen.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

/* ---------- 7 Budget ---------- */

struct BudgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    var body: some View {
        let b = entry.snapshot.budget
        let share = (b?.budget ?? 0) > 0 ? min(max((b?.spent ?? 0) / (b?.budget ?? 1), 0), 1) : 0
        switch family {
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Text("Budget \(b?.month ?? "")").font(.caption.weight(.semibold)).widgetAccentable()
                Text(b.map { Fmt.money($0.available) } ?? "–").font(.headline)
                if let b, b.budget > 0 { ProgressView(value: share).tint(Color.primary) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        default:
            VStack(alignment: .leading, spacing: 2) {
                Caption(text: b?.month ?? "Budget", icon: "eurosign.circle.fill", color: .orange)
                if entry.empty {
                    EmptyHint()
                } else if let b {
                    Spacer(minLength: 0)
                    Text(Fmt.money(b.available))
                        .font(.system(size: 30, weight: .semibold, design: .rounded))
                        .foregroundStyle(b.available < 0 ? Color.red : Color.primary)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                    Text(b.budget > 0 ? "übrig von \(Fmt.money(b.budget))" : "Saldo diesen Monat").font(.caption).foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    if b.budget > 0 {
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Color.secondary.opacity(0.2))
                                Capsule().fill(share >= 0.9 ? Color.red : Color.orange).frame(width: geo.size.width * share)
                            }
                        }
                        .frame(height: 8)
                        Text("≈ \(Fmt.money(b.perDay)) pro Tag").font(.caption2).foregroundStyle(.secondary)
                    }
                } else {
                    Spacer(minLength: 0)
                    Text("Kein Budget").font(.subheadline.weight(.semibold))
                    Spacer(minLength: 0)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

struct BudgetWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AntonOSBudget", provider: SnapshotProvider()) { entry in
            BudgetView(entry: entry).widgetBackground(tint: .orange).widgetURL(AppLink.page("finanzen"))
        }
        .configurationDisplayName("Budget")
        .description("Wie viel vom Monatsbudget noch übrig ist.")
        .supportedFamilies([.systemSmall, .accessoryRectangular])
    }
}

/* ---------- 8 Einkaufsliste ---------- */

struct ShoppingRow: View {
    let item: WShopping

    var body: some View {
        Button(intent: ToggleItemIntent(kind: "shopping", id: item.id, done: !item.done)) {
            HStack(spacing: 6) {
                Image(systemName: item.done ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 17))
                    .foregroundStyle(item.done ? Color.green : Color.secondary)
                Text(item.amount.isEmpty ? item.name : "\(item.amount) \(item.name)")
                    .font(.caption)
                    .strikethrough(item.done)
                    .foregroundStyle(item.done ? Color.secondary : Color.primary)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
        }
        .buttonStyle(.plain)
    }
}

struct ShoppingView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    var body: some View {
        let items = Array(entry.snapshot.shopping.prefix(family == .systemLarge ? 12 : 6))
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Caption(text: "Einkaufsliste", icon: "cart.fill", color: .green)
                Spacer()
                Text("\(entry.snapshot.shoppingOpen) offen").font(.caption2).foregroundStyle(.secondary)
            }
            if entry.empty {
                EmptyHint()
            } else if items.isEmpty {
                Text("Liste ist leer").font(.caption).foregroundStyle(.secondary)
                Spacer(minLength: 0)
            } else {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], alignment: .leading, spacing: family == .systemLarge ? 10 : 7) {
                    ForEach(items, id: \.id) { ShoppingRow(item: $0) }
                }
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct ShoppingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AntonOSShopping", provider: SnapshotProvider()) { entry in
            ShoppingView(entry: entry).widgetBackground(tint: .green).widgetURL(AppLink.page("einkauf"))
        }
        .configurationDisplayName("Einkaufsliste")
        .description("Offene Einträge zum Abhaken im Laden.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

/* ---------- 9 Sperrbildschirm: nächster Termin ---------- */

struct NextEventView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    var body: some View {
        let next = entry.snapshot.upcoming(at: entry.date).first { !$0.time.isEmpty } ?? entry.snapshot.upcoming(at: entry.date).first
        let prefix = next.map { $0.day == WidgetStore.dayString(entry.date) ? "" : "Morgen " } ?? ""
        switch family {
        case .accessoryInline:
            if let next {
                Label("\(prefix)\(next.time.isEmpty ? "" : next.time + " ")\(next.title)", systemImage: "calendar")
            } else {
                Label("Keine Termine", systemImage: "calendar")
            }
        default:
            VStack(alignment: .leading, spacing: 0) {
                Label(next.map { "\(prefix)\($0.timeText)" } ?? "Kalender", systemImage: "calendar")
                    .font(.caption.weight(.semibold))
                    .widgetAccentable()
                Text(next?.title ?? "Keine Termine mehr").font(.headline).lineLimit(1)
                if let next, !next.location.isEmpty { Text(next.location).font(.caption).lineLimit(1) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct NextEventWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AntonOSNextEvent", provider: SnapshotProvider()) { entry in
            NextEventView(entry: entry).widgetBackground(tint: .red).widgetURL(AppLink.page("kalender"))
        }
        .configurationDisplayName("Nächster Termin")
        .description("Der nächste Termin auf dem Sperrbildschirm, auch über der Uhr.")
        .supportedFamilies([.accessoryInline, .accessoryRectangular])
    }
}

/* ---------- Alle Widgets ---------- */

@main
struct AntonOSWidgetBundle: WidgetBundle {
    var body: some Widget {
        AlarmWidget()
        RingsWidget()
        TodayWidget()
        HabitsWidget()
        TrainingWidget()
        CountdownWidget()
        BudgetWidget()
        ShoppingWidget()
        NextEventWidget()
        LaeuferWidget()
        HaustierWidget()
        KartenWidget()
        KoerperWidget()
        LichtWidget()
        FocusLiveActivity()
        if #available(iOS 18.0, *) {
            QuickAddControl()
            FocusControl()
            LichtControl()
        }
    }
}
