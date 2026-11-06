import Foundation
import SwiftUI
import WidgetKit

/// Gemeinsamer Speicher mit der App (App Group). Die App legt dort den Stand ab
/// (siehe src/lib/widgets.ts und ios/App/App/AntonWidgets.swift).
enum WidgetStore {
    static let group = "group.io.github.pixeltoni.antonos"
    static let snapshotKey = "widgets.snapshot"
    static let actionsKey = "widgets.actions"

    static var defaults: UserDefaults? { UserDefaults(suiteName: group) }

    /// Stand der App, darüber die im Widget abgehakten Einträge, die die App noch nicht übernommen hat
    static func load() -> Snapshot? {
        guard let raw = defaults?.string(forKey: snapshotKey), let data = raw.data(using: .utf8),
              var snap = try? JSONDecoder().decode(Snapshot.self, from: data) else { return nil }
        let today = dayString(Date())
        if snap.day != today {
            // Neuer Tag, App noch nicht geöffnet: Tageswerte zurücksetzen
            let gap = max(1, min(7, daysUntil(today, from: date(fromDay: snap.day) ?? Date()) ?? 1))
            snap.habits = snap.habits.map { h in
                var h = h
                // Serie hält nur, wenn der letzte Tag des Stands erledigt war und genau ein Tag vergangen ist
                if !h.done || gap > 1 { h.streak = 0 }
                h.done = false
                h.amount = 0
                if let week = h.week { h.week = Array((week + Array(repeating: false, count: gap)).suffix(7)) }
                return h
            }
            snap.rings = snap.rings.map { var r = $0; r.share = 0; r.text = "–"; return r }
            snap.ringsClosed = false
            snap.tasks = snap.tasks.filter { !$0.done }
            snap.bodyweight?.newDay(gap: gap)
        }
        for action in pendingActions() {
            switch action.kind {
            case "task":
                if let i = snap.tasks.firstIndex(where: { $0.id == action.id }), snap.tasks[i].done != action.done {
                    snap.tasks[i].done = action.done
                    snap.tasksOpen += action.done ? -1 : 1
                }
            case "shopping":
                if let i = snap.shopping.firstIndex(where: { $0.id == action.id }), snap.shopping[i].done != action.done {
                    snap.shopping[i].done = action.done
                    snap.shoppingOpen += action.done ? -1 : 1
                }
            case "habit":
                if action.day == today, let i = snap.habits.firstIndex(where: { $0.id == action.id }) {
                    snap.habits[i].apply(action)
                }
            case "reps":
                if action.day == today, let amount = action.amount { snap.bodyweight?.add(id: action.id, reps: amount) }
            case "card":
                // Gewusst: weg damit; „Nochmal“: kommt hinten noch einmal dran
                if var cards = snap.cards, let i = cards.firstIndex(where: { $0.id == action.id }) {
                    let card = cards.remove(at: i)
                    if action.done {
                        snap.cardsDue = max(0, (snap.cardsDue ?? 1) - 1)
                    } else {
                        cards.append(card)
                    }
                    snap.cards = cards
                }
            default: break
            }
        }
        return snap
    }

    static func pendingActions() -> [WidgetAction] {
        guard let raw = defaults?.string(forKey: actionsKey), let data = raw.data(using: .utf8) else { return [] }
        return ((try? JSONDecoder().decode([WidgetAction].self, from: data)) ?? []).sorted { $0.at < $1.at }
    }

    /// Merkt sich einen Tipp im Widget; die App übernimmt ihn beim nächsten Öffnen.
    static func enqueue(kind: String, id: String, done: Bool, amount: Double? = nil) {
        var list = pendingActions()
        list.append(WidgetAction(kind: kind, id: id, done: done, day: dayString(Date()), at: Date().timeIntervalSince1970 * 1000, amount: amount))
        if let data = try? JSONEncoder().encode(list.suffix(200)), let raw = String(data: data, encoding: .utf8) {
            defaults?.set(raw, forKey: actionsKey)
        }
    }

    static func dayString(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    static func date(fromDay day: String) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    /// Ganze Tage von heute bis `day`
    static func daysUntil(_ day: String, from now: Date) -> Int? {
        guard let target = date(fromDay: day) else { return nil }
        return Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: now), to: target).day
    }
}

struct WidgetAction: Codable {
    var kind: String
    var id: String
    var done: Bool
    var day: String
    var at: Double
    /// Nur Mengen-Gewohnheiten: gewünschte Tagesmenge nach dem Tipp; bei `reps`: Wiederholungen dieses Tipps
    var amount: Double? = nil
}

/* ---------- Stand aus der App (gleiche Felder wie WidgetSnapshot in src/lib/widgets.ts) ---------- */

struct Snapshot: Codable {
    var version: Int
    var at: Double
    var day: String
    var alarm: WAlarm?
    var rings: [WRing]
    var ringsClosed: Bool
    var agenda: [WAgenda]
    var tasks: [WTask]
    var tasksOpen: Int
    var habits: [WHabit]
    var training: WTraining?
    var exam: WCountdown?
    var trip: WCountdown?
    var budget: WBudget?
    var shopping: [WShopping]
    var shoppingOpen: Int
    /// Fällige Lernkarten (optional, damit ältere Stände lesbar bleiben)
    var cards: [WCard]?
    var cardsDue: Int?
    /// Körpertraining zum schnellen Eintragen (optional, damit ältere Stände lesbar bleiben)
    var bodyweight: WBody?
}

struct WAlarmRing: Codable {
    var at: Double
    var title: String
    var repeatText: String
    var sound: String

    var date: Date { Date(timeIntervalSince1970: at / 1000) }

    enum CodingKeys: String, CodingKey {
        case at, title, sound
        case repeatText = "repeat"
    }
}

struct WAlarm: Codable {
    var rings: [WAlarmRing]

    /// Nächste Weckzeit nach `now` – mit Titel, Wiederholung und Ton ihres Weckers
    func next(after now: Date) -> WAlarmRing? {
        rings.first { $0.date > now }
    }
}

struct WRing: Codable {
    var label: String
    var share: Double
    var text: String
    var color: String
    var track: String
}

struct WAgenda: Codable {
    var day: String
    var title: String
    var time: String
    var endTime: String
    var color: String
    var kind: String
    var location: String
    var endsAt: Double

    var end: Date { Date(timeIntervalSince1970: endsAt / 1000) }
    var timeText: String {
        if time.isEmpty { return "ganztägig" }
        return endTime.isEmpty ? time : "\(time)–\(endTime)"
    }
}

struct WTask: Codable {
    var id: String
    var title: String
    var done: Bool
    var overdue: Bool
    var dueLabel: String
}

struct WHabit: Codable {
    var id: String
    var name: String
    var icon: String
    var done: Bool
    var amount: Double
    var target: Double
    var unit: String
    var streak: Int
    /// Menge pro Tipp (optional, damit ältere Stände lesbar bleiben)
    var step: Double?
    /// Erledigt an den letzten 7 Tagen, heute zuletzt
    var week: [Bool]?

    /// Anteil von heute, 0…1
    var share: Double {
        if done { return 1 }
        return target > 0 ? min(max(amount / target, 0), 1) : 0
    }

    var isAmount: Bool { target > 0 }

    /// Menge, die ein Tipp im Widget hinzufügt
    var tapStep: Double {
        if let step, step > 0 { return step }
        return target >= 20 ? 5 : target >= 4 ? 1 : max(target / 4, 0.1)
    }

    /// Was ein Tipp bewirkt: Mengen bekommen eine Portion dazu, sonst umschalten (erledigt → zurück)
    var tapIntent: ToggleItemIntent {
        if isAmount && !done {
            let next = (min(amount + tapStep, target) * 1000).rounded() / 1000
            return ToggleItemIntent(kind: "habit", id: id, done: next >= target, amount: next)
        }
        return ToggleItemIntent(kind: "habit", id: id, done: !done, amount: isAmount ? 0 : nil)
    }

    /// „1,5 / 2 l“
    var amountText: String {
        let unitText = unit.isEmpty ? "" : " \(unit)"
        return "\(Fmt.number(done ? max(amount, target) : amount))/\(Fmt.number(target))\(unitText)"
    }

    /// Tipp aus dem Widget übernehmen (Serie und Woche gleich mitziehen)
    mutating func apply(_ action: WidgetAction) {
        let was = done
        if isAmount, let wanted = action.amount {
            amount = max(0, wanted)
            done = amount >= target
        } else {
            done = action.done
            if isAmount { amount = action.done ? target : 0 }
        }
        if done != was { streak = max(0, streak + (done ? 1 : -1)) }
        if var week, !week.isEmpty {
            week[week.count - 1] = done
            self.week = week
        }
    }
}

struct WTraining: Codable {
    var title: String
    var detail: String
    var fromPlan: Bool
    var doneToday: Bool
    var weekDone: Int
    var weekGoal: Int
}

struct WCountdown: Codable {
    var kind: String
    var title: String
    var date: String
    var time: String
    var color: String
}

struct WBudget: Codable {
    var month: String
    var available: Double
    var budget: Double
    var spent: Double
    var perDay: Double
}

struct WShopping: Codable {
    var id: String
    var name: String
    var amount: String
    var done: Bool
}

struct WCard: Codable {
    var id: String
    var front: String
    var back: String
    var course: String
    var color: String
}

/// Übung aus dem Körpertraining (gleiche Felder wie WidgetBodyExercise in src/lib/bodyweight.ts)
struct WBodyExercise: Codable {
    var id: String
    var name: String
    var today: Double
    var step: Double
    var timed: Bool
    var week: [Double]

    var unit: String { timed ? "Sek." : "Wdh." }
    var stepInt: Int { max(1, Int(step.rounded())) }
}

struct WBody: Codable {
    var dayId: String
    var name: String
    var exercises: [WBodyExercise]

    /// Tipp im Widget, den die App noch nicht übernommen hat
    mutating func add(id: String, reps: Double) {
        guard let i = exercises.firstIndex(where: { $0.id == id }) else { return }
        exercises[i].today = max(0, exercises[i].today + reps)
        if !exercises[i].week.isEmpty { exercises[i].week[exercises[i].week.count - 1] = exercises[i].today }
    }

    /// Neuer Tag ohne App: heute bei null anfangen, Woche weiterschieben
    mutating func newDay(gap: Int) {
        exercises = exercises.map { e in
            var e = e
            e.today = 0
            e.week = Array((e.week + Array(repeating: 0, count: gap)).suffix(7))
            return e
        }
    }
}

extension Snapshot {
    /// Termine, die noch nicht vorbei sind
    func upcoming(at now: Date) -> [WAgenda] { agenda.filter { $0.end > now } }

    /// Zeitpunkte, an denen sich die Anzeige ohne die App ändert (Wecker klingelt, Termin endet)
    func changes(after now: Date) -> [Date] {
        var dates = agenda.map(\.end) + (alarm?.rings.map(\.date) ?? [])
        if let midnight = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: now)) { dates.append(midnight) }
        let limit = now.addingTimeInterval(36 * 3600)
        return Array(Set(dates.filter { $0 > now && $0 < limit })).sorted().prefix(30).map { $0 }
    }

    /// Beispiel für die Widget-Galerie und solange die App noch nichts abgelegt hat
    static var preview: Snapshot {
        let now = Date()
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: now)) ?? now
        let alarmAt = tomorrow.addingTimeInterval(6 * 3600 + 45 * 60)
        return Snapshot(
            version: 1, at: now.timeIntervalSince1970 * 1000, day: WidgetStore.dayString(now),
            alarm: WAlarm(rings: [WAlarmRing(at: alarmAt.timeIntervalSince1970 * 1000, title: "Wecker", repeatText: "Werktags", sound: "Sonnenaufgang")]),
            rings: [
                WRing(label: "Lernen", share: 0.75, text: "90/120 Min.", color: "#FA114F", track: "#3A0B12"),
                WRing(label: "Bewegung", share: 1, text: "30/30 Min.", color: "#A6FF00", track: "#163A05"),
                WRing(label: "Gewohnheiten", share: 0.5, text: "2/4", color: "#00E5FF", track: "#08303A"),
            ],
            ringsClosed: false,
            agenda: [
                WAgenda(day: WidgetStore.dayString(now), title: "Analysis II", time: "10:15", endTime: "11:45", color: "#5856D6", kind: "lecture", location: "HS 3", endsAt: now.addingTimeInterval(7200).timeIntervalSince1970 * 1000),
                WAgenda(day: WidgetStore.dayString(now), title: "Mensa mit Lea", time: "12:30", endTime: "", color: "#007AFF", kind: "event", location: "", endsAt: now.addingTimeInterval(10800).timeIntervalSince1970 * 1000),
            ],
            tasks: [
                WTask(id: "1", title: "Übungsblatt 4", done: false, overdue: false, dueLabel: "Heute"),
                WTask(id: "2", title: "Miete überweisen", done: false, overdue: true, dueLabel: "Gestern"),
                WTask(id: "3", title: "Wäsche", done: true, overdue: false, dueLabel: "Heute"),
            ],
            tasksOpen: 2,
            habits: [
                WHabit(id: "a", name: "Lesen", icon: "📖", done: true, amount: 0, target: 0, unit: "", streak: 12, step: 0, week: [true, true, true, true, true, true, true]),
                WHabit(id: "b", name: "Vitamine", icon: "💊", done: true, amount: 0, target: 0, unit: "", streak: 4, step: 0, week: [true, false, true, true, true, true, true]),
                WHabit(id: "c", name: "Wasser", icon: "💧", done: false, amount: 1.5, target: 2, unit: "l", streak: 3, step: 0.5, week: [false, true, true, false, true, true, false]),
                WHabit(id: "d", name: "Meditieren", icon: "🧘", done: false, amount: 0, target: 0, unit: "", streak: 0, step: 0, week: [true, false, false, true, false, false, false]),
                WHabit(id: "e", name: "Dehnen", icon: "🤸", done: false, amount: 0, target: 0, unit: "", streak: 1, step: 0, week: [false, false, true, false, true, true, false]),
            ],
            training: WTraining(title: "Push", detail: "Bankdrücken · Schulterdrücken · Dips", fromPlan: true, doneToday: false, weekDone: 2, weekGoal: 4),
            exam: WCountdown(kind: "exam", title: "Lineare Algebra", date: WidgetStore.dayString(now.addingTimeInterval(12 * 86400)), time: "09:00", color: "#FF9500"),
            trip: WCountdown(kind: "trip", title: "Lissabon", date: WidgetStore.dayString(now.addingTimeInterval(30 * 86400)), time: "", color: "#34C759"),
            budget: WBudget(month: "November", available: 412, budget: 650, spent: 238, perDay: 14.7),
            shopping: [
                WShopping(id: "1", name: "Haferflocken", amount: "", done: false),
                WShopping(id: "2", name: "Milch", amount: "2", done: false),
                WShopping(id: "3", name: "Bananen", amount: "", done: false),
                WShopping(id: "4", name: "Eier", amount: "10", done: true),
            ],
            shoppingOpen: 3,
            cards: [
                WCard(id: "k1", front: "Wann konvergiert eine geometrische Reihe?", back: "Genau dann, wenn |q| < 1 ist.", course: "Analysis I", color: "#FF9500"),
            ],
            cardsDue: 12,
            bodyweight: WBody(dayId: "k", name: "Körpertraining", exercises: [
                WBodyExercise(id: "ls", name: "Liegestütze", today: 45, step: 20, timed: false, week: [40, 0, 50, 45, 60, 30, 45]),
                WBodyExercise(id: "kb", name: "Kniebeugen", today: 0, step: 15, timed: false, week: [30, 30, 0, 45, 30, 45, 0]),
                WBodyExercise(id: "pl", name: "Plank (Sek.)", today: 60, step: 30, timed: true, week: [90, 0, 60, 60, 90, 0, 60]),
            ])
        )
    }
}

/* ---------- Kleinkram für die Darstellung ---------- */

extension Color {
    /// „#FA114F“ (auch kurz „#F00“); Unbekanntes wird Blau
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
        var value: UInt64 = 0
        guard s.count == 6, Scanner(string: s).scanHexInt64(&value) else {
            self = .blue
            return
        }
        self.init(red: Double((value >> 16) & 0xFF) / 255, green: Double((value >> 8) & 0xFF) / 255, blue: Double(value & 0xFF) / 255)
    }
}

enum Fmt {
    static let de = Locale(identifier: "de_DE")

    static func time(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = de
        f.dateFormat = "H:mm"
        return f.string(from: date)
    }

    /// „Heute“, „Morgen“ oder „Mi., 4. Nov.“
    static func dayLabel(_ date: Date, now: Date) -> String {
        let cal = Calendar.current
        if cal.isDate(date, inSameDayAs: now) { return "Heute" }
        if let t = cal.date(byAdding: .day, value: 1, to: now), cal.isDate(date, inSameDayAs: t) { return "Morgen" }
        let f = DateFormatter()
        f.locale = de
        f.dateFormat = "EE, d. MMM"
        return f.string(from: date)
    }

    static func weekday(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = de
        f.dateFormat = "EEEE"
        return f.string(from: date)
    }

    static func dayMonth(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = de
        f.dateFormat = "EE, d. MMM"
        return f.string(from: date)
    }

    /// „2. November“
    static func longDay(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = de
        f.dateFormat = "d. MMMM"
        return f.string(from: date)
    }

    static func money(_ value: Double) -> String {
        let f = NumberFormatter()
        f.locale = de
        f.numberStyle = .currency
        f.currencyCode = "EUR"
        f.maximumFractionDigits = abs(value) >= 100 ? 0 : 2
        return f.string(from: NSNumber(value: value)) ?? "\(value) €"
    }

    static func number(_ value: Double) -> String {
        let f = NumberFormatter()
        f.locale = de
        f.maximumFractionDigits = 2
        return f.string(from: NSNumber(value: value)) ?? "\(value)"
    }
}

/// Links zurück in die App (verarbeitet in src/components/ioswidgets.tsx)
enum AppLink {
    static func page(_ path: String) -> URL { URL(string: "antonos://open/\(path)")! }
    static let assistant = URL(string: "antonos://assistent")!
    static let focus = URL(string: "antonos://fokus-start")!
}
