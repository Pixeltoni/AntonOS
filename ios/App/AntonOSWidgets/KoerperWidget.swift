import AppIntents
import SwiftUI
import WidgetKit

/* ---------- Körpertraining schnell eintragen ----------
   Zeigt die Übungen des Körpertrainings aus dem Stand der App (`WidgetSnapshot.bodyweight`,
   src/lib/bodyweight.ts) mit dem heutigen Stand. „+20“ trägt einen Satz mit 20 Wiederholungen ein,
   „−“ nimmt so viele wieder weg. Jeder Tipp landet als Aktion `reps` in der Warteschlange; die App
   hängt die Sätze an das Körpertraining von heute an (`resolveRepsEntries`). Bis dahin zählt
   `WidgetStore.load` die Tipps schon mit. Im kleinen Widget wählt man die Übung selbst aus. */

struct LogRepsIntent: AppIntent {
    static let title: LocalizedStringResource = "Wiederholungen eintragen"
    static let isDiscoverable: Bool = false

    @Parameter(title: "Übung") var exerciseID: String
    @Parameter(title: "Wiederholungen") var reps: Int

    init() {}

    init(id: String, reps: Int) {
        self.exerciseID = id
        self.reps = reps
    }

    func perform() async throws -> some IntentResult {
        WidgetStore.enqueue(kind: "reps", id: exerciseID, done: true, amount: Double(reps))
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

/// Übung zur Auswahl beim Bearbeiten des Widgets
struct BodyExerciseEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Übung"
    static let defaultQuery = BodyExerciseQuery()

    let id: String
    let name: String

    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
}

struct BodyExerciseQuery: EntityQuery {
    private func all() -> [BodyExerciseEntity] {
        (WidgetStore.load()?.bodyweight?.exercises ?? []).map { BodyExerciseEntity(id: $0.id, name: $0.name) }
    }

    func entities(for identifiers: [String]) async throws -> [BodyExerciseEntity] {
        all().filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [BodyExerciseEntity] { all() }

    func defaultResult() async -> BodyExerciseEntity? { all().first }
}

struct KoerperConfigIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Körpertraining"
    static let description = IntentDescription("Welche Übung oben steht (im kleinen Widget die einzige).")

    @Parameter(title: "Übung") var exercise: BodyExerciseEntity?

    init() {}
}

struct KoerperEntry: TimelineEntry {
    let date: Date
    let body: WBody?
    var empty = false
    var exerciseID: String? = nil

    /// Gewählte Übung zuerst, dann die übrigen in Plan-Reihenfolge
    var ordered: [WBodyExercise] {
        let list = body?.exercises ?? []
        guard let exerciseID, let i = list.firstIndex(where: { $0.id == exerciseID }) else { return list }
        var rest = list
        let chosen = rest.remove(at: i)
        return [chosen] + rest
    }
}

struct KoerperProvider: AppIntentTimelineProvider {
    private func entry(preview: Bool, id: String?) -> KoerperEntry {
        if preview { return KoerperEntry(date: Date(), body: Snapshot.preview.bodyweight, exerciseID: id) }
        guard let snap = WidgetStore.load() else { return KoerperEntry(date: Date(), body: Snapshot.preview.bodyweight, empty: true) }
        return KoerperEntry(date: Date(), body: snap.bodyweight, exerciseID: id)
    }

    func placeholder(in context: Context) -> KoerperEntry { KoerperEntry(date: Date(), body: Snapshot.preview.bodyweight) }

    func snapshot(for configuration: KoerperConfigIntent, in context: Context) async -> KoerperEntry {
        entry(preview: context.isPreview, id: configuration.exercise?.id)
    }

    func timeline(for configuration: KoerperConfigIntent, in context: Context) async -> Timeline<KoerperEntry> {
        let now = Date()
        let current = entry(preview: false, id: configuration.exercise?.id)
        // Um Mitternacht neu lesen, dann fängt „heute“ wieder bei null an
        let midnight = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: now)) ?? now.addingTimeInterval(3600)
        return Timeline(entries: [current], policy: .after(midnight.addingTimeInterval(5)))
    }
}

private let koerperColor = Color.orange

/// „+20“ bzw. „−“
private struct RepsButton: View {
    let exercise: WBodyExercise
    let minus: Bool
    var big = false

    var body: some View {
        Button(intent: LogRepsIntent(id: exercise.id, reps: minus ? -exercise.stepInt : exercise.stepInt)) {
            Group {
                if minus {
                    Image(systemName: "minus")
                } else {
                    Text("+\(exercise.stepInt)").lineLimit(1).minimumScaleFactor(0.7)
                }
            }
            .font((big ? Font.subheadline : Font.caption).weight(.bold))
            .foregroundStyle(minus ? Color.primary : Color.white)
            .frame(maxWidth: minus ? nil : .infinity)
            .frame(width: minus ? (big ? 34 : 28) : nil, height: big ? 34 : 28)
            .padding(.horizontal, minus ? 0 : 6)
            .background(minus ? Color.primary.opacity(0.12) : koerperColor, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(minus ? "\(exercise.stepInt) \(exercise.unit) weniger" : "\(exercise.stepInt) \(exercise.unit) eintragen")
    }
}

/// Die letzten 7 Tage als kleine Balken, heute zuletzt
private struct WeekBars: View {
    let week: [Double]
    var height: CGFloat = 18

    var body: some View {
        let top = max(week.max() ?? 0, 1)
        HStack(alignment: .bottom, spacing: 3) {
            ForEach(Array(week.enumerated()), id: \.offset) { i, v in
                RoundedRectangle(cornerRadius: 2)
                    .fill(v > 0 ? koerperColor.opacity(i == week.count - 1 ? 1 : 0.55) : Color.secondary.opacity(0.2))
                    .frame(height: v > 0 ? max(3, height * CGFloat(v / top)) : 3)
            }
        }
        .frame(height: height, alignment: .bottom)
    }
}

/// Keine Übung ohne Gewicht im Plan
private struct NoPlanHint: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: "figure.strengthtraining.functional").font(.title3).foregroundStyle(koerperColor)
            Text("Noch kein Körpertraining").font(.caption.weight(.semibold))
            Text("In AntonOS unter Training anlegen.").font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/// Eine Zeile im mittleren und großen Widget
private struct KoerperRow: View {
    let exercise: WBodyExercise
    var showWeek = false

    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                Text(exercise.name).font(.caption.weight(.semibold)).lineLimit(1)
                Text(exercise.today > 0 ? "\(Fmt.number(exercise.today)) \(exercise.unit) heute" : "heute noch nichts")
                    .font(.caption2)
                    .foregroundStyle(exercise.today > 0 ? koerperColor : Color.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            if showWeek { WeekBars(week: exercise.week, height: 16).frame(width: 52) }
            if exercise.today > 0 { RepsButton(exercise: exercise, minus: true) }
            RepsButton(exercise: exercise, minus: false).frame(width: 52)
        }
    }
}

struct KoerperView: View {
    @Environment(\.widgetFamily) private var family
    let entry: KoerperEntry

    var body: some View {
        let list = entry.ordered
        VStack(alignment: .leading, spacing: family == .systemSmall ? 4 : 8) {
            Caption(text: entry.body?.name ?? "Körpertraining", icon: "figure.strengthtraining.functional", color: koerperColor)
            if entry.empty {
                EmptyHint()
            } else if let ex = list.first {
                if family == .systemSmall {
                    small(ex)
                } else {
                    let rows = Array(list.prefix(family == .systemLarge ? 6 : 3))
                    ForEach(rows, id: \.id) { KoerperRow(exercise: $0, showWeek: family == .systemLarge) }
                    Spacer(minLength: 0)
                }
            } else {
                NoPlanHint()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    @ViewBuilder
    private func small(_ ex: WBodyExercise) -> some View {
        Text(ex.name).font(.subheadline.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.7)
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text(Fmt.number(ex.today)).font(.system(size: 30, weight: .bold, design: .rounded)).foregroundStyle(koerperColor).contentTransition(.numericText())
            Text("\(ex.unit) heute").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
        WeekBars(week: ex.week, height: 14)
        Spacer(minLength: 0)
        HStack(spacing: 6) {
            if ex.today > 0 { RepsButton(exercise: ex, minus: true, big: true) }
            RepsButton(exercise: ex, minus: false, big: true)
        }
    }
}

struct KoerperWidget: Widget {
    static let kind = "AntonOSKoerper"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: Self.kind, intent: KoerperConfigIntent.self, provider: KoerperProvider()) { entry in
            KoerperView(entry: entry).widgetBackground(tint: koerperColor).widgetURL(AppLink.page("training"))
        }
        .configurationDisplayName("Körpertraining")
        .description("Liegestütze & Co. mit einem Tipp eintragen – nur Wiederholungen, kein Gewicht.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
