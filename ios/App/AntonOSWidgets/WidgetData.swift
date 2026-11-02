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
            snap.habits = snap.habits.map { var h = $0; h.done = false; h.amount = 0; return h }
            snap.rings = snap.rings.map { var r = $0; r.share = 0; r.text = "–"; return r }
            snap.ringsClosed = false
            snap.tasks = snap.tasks.filter { !$0.done }
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
                    snap.habits[i].done = action.done
                    if snap.habits[i].target > 0 { snap.habits[i].amount = action.done ? snap.habits[i].target : 0 }
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
    static func enqueue(kind: String, id: String, done: Bool) {
        var list = pendingActions()
        list.append(WidgetAction(kind: kind, id: id, done: done, day: dayString(Date()), at: Date().timeIntervalSince1970 * 1000))
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
                WHabit(id: "a", name: "Lesen", icon: "📖", done: true, amount: 0, target: 0, unit: "", streak: 12),
                WHabit(id: "b", name: "Vitamine", icon: "💊", done: true, amount: 0, target: 0, unit: "", streak: 4),
                WHabit(id: "c", name: "Wasser", icon: "💧", done: false, amount: 1, target: 2, unit: "l", streak: 0),
                WHabit(id: "d", name: "Meditieren", icon: "🧘", done: false, amount: 0, target: 0, unit: "", streak: 0),
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
            shoppingOpen: 3
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
