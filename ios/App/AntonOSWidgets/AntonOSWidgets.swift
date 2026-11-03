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

/// Hintergrund nur auf dem Homescreen; auf dem Sperrbildschirm zeichnet iOS selbst
struct WidgetBackground: ViewModifier {
    @Environment(\.widgetFamily) private var family
    var color: Color? = nil

    @ViewBuilder
    func body(content: Content) -> some View {
        switch family {
        case .accessoryCircular, .accessoryRectangular, .accessoryInline:
            content.containerBackground(for: .widget) { Color.clear }
        default:
            if let color {
                content.containerBackground(for: .widget) { color }
            } else {
                content.containerBackground(.background, for: .widget)
            }
        }
    }
}

extension View {
    func widgetBackground(_ color: Color? = nil) -> some View { modifier(WidgetBackground(color: color)) }
}

struct Caption: View {
    let text: String
    var icon: String? = nil
    var color: Color = .secondary

    var body: some View {
        HStack(spacing: 4) {
            if let icon { Image(systemName: icon).foregroundStyle(color) }
            Text(text.uppercased()).foregroundStyle(icon == nil ? color : Color.secondary)
        }
        .font(.system(size: 11, weight: .semibold))
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
                    .font(.caption)
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
            AlarmView(entry: entry).widgetBackground().widgetURL(AppLink.page("wecker"))
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
            RingsWidgetView(entry: entry).widgetBackground(.black).widgetURL(AppLink.page("gewohnheiten"))
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
                    .font(.subheadline.weight(.bold))
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
            TodayView(entry: entry).widgetBackground().widgetURL(AppLink.page("kalender"))
        }
        .configurationDisplayName("Heute")
        .description("Nächste Termine und Aufgaben für heute – zum Abhaken.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

/* ---------- 4 Gewohnheiten ---------- */

struct HabitButton: View {
    let habit: WHabit

    var body: some View {
        Button(intent: ToggleItemIntent(kind: "habit", id: habit.id, done: !habit.done)) {
            VStack(spacing: 4) {
                ZStack {
                    if habit.done {
                        Circle().fill(Color.green)
                        Image(systemName: "checkmark").font(.system(size: 18, weight: .bold)).foregroundStyle(Color.white)
                    } else {
                        Circle().stroke(Color.secondary.opacity(0.3), lineWidth: 3)
                        if habit.target > 0 {
                            Circle()
                                .trim(from: 0, to: CGFloat(min(habit.amount / habit.target, 1)))
                                .stroke(Color.blue, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                                .rotationEffect(.degrees(-90))
                        }
                        Text(habit.icon.isEmpty ? "•" : habit.icon).font(.system(size: 20))
                    }
                }
                .frame(width: 44, height: 44)
                Text(habit.name).font(.caption2).lineLimit(1)
            }
        }
        .buttonStyle(.plain)
    }
}

struct HabitRow: View {
    let habit: WHabit

    var body: some View {
        Button(intent: ToggleItemIntent(kind: "habit", id: habit.id, done: !habit.done)) {
            HStack(spacing: 7) {
                Image(systemName: habit.done ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 17))
                    .foregroundStyle(habit.done ? Color.green : Color.secondary)
                Text("\(habit.icon) \(habit.name)").font(.caption).lineLimit(1)
                Spacer(minLength: 0)
            }
        }
        .buttonStyle(.plain)
    }
}

struct HabitsView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    var body: some View {
        let habits = entry.snapshot.habits
        let done = habits.filter(\.done).count
        let best = habits.max { $0.streak < $1.streak }
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Caption(text: "Gewohnheiten", icon: "checkmark.seal.fill", color: .green)
                Spacer()
                Text("\(done) von \(habits.count)").font(.caption2).foregroundStyle(.secondary)
            }
            if entry.empty {
                EmptyHint()
            } else if habits.isEmpty {
                Text("Noch keine Gewohnheiten").font(.caption).foregroundStyle(.secondary)
                Spacer(minLength: 0)
            } else if family == .systemSmall {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(habits.prefix(4), id: \.id) { HabitRow(habit: $0) }
                }
                Spacer(minLength: 0)
            } else {
                Spacer(minLength: 0)
                HStack(alignment: .top) {
                    ForEach(habits.prefix(4), id: \.id) { habit in
                        HabitButton(habit: habit).frame(maxWidth: .infinity)
                    }
                }
                Spacer(minLength: 0)
                if let best, best.streak >= 2 {
                    Text("🔥 \(best.name): \(best.streak) Tage in Folge").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct HabitsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AntonOSHabits", provider: SnapshotProvider()) { entry in
            HabitsView(entry: entry).widgetBackground().widgetURL(AppLink.page("gewohnheiten"))
        }
        .configurationDisplayName("Gewohnheiten")
        .description("Gewohnheiten von heute mit einem Tipp abhaken.")
        .supportedFamilies([.systemSmall, .systemMedium])
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
            TrainingView(entry: entry).widgetBackground().widgetURL(AppLink.page("training"))
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
            CountdownView(entry: entry).widgetBackground().widgetURL(AppLink.page(entry.snapshot.exam != nil && entry.target != .trip ? "pruefungen" : "reisen"))
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
            BudgetView(entry: entry).widgetBackground().widgetURL(AppLink.page("finanzen"))
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
            ShoppingView(entry: entry).widgetBackground().widgetURL(AppLink.page("einkauf"))
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
            NextEventView(entry: entry).widgetBackground().widgetURL(AppLink.page("kalender"))
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
        FocusLiveActivity()
        if #available(iOS 18.0, *) {
            QuickAddControl()
            FocusControl()
        }
    }
}
