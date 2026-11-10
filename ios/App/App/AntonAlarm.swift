import Foundation
import UIKit
import Capacitor
import UserNotifications
import AppIntents
import SwiftUI
import ActivityKit
#if canImport(AlarmKit)
import AlarmKit
#endif

/// Startet die Web-Ansicht und meldet das eigene Wecker-Plugin an (siehe Main.storyboard).
class AntonBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AntonAlarmPlugin())
        bridge?.registerPluginInstance(AntonWidgetsPlugin())
        bridge?.registerPluginInstance(AntonExtrasPlugin())
    }
}

/// Gemeinsamer Speicher zwischen Plugin und Intents (auch wenn die App im Hintergrund geweckt wird).
enum AlarmStore {
    static let defaults = UserDefaults.standard
    /// AlarmKit-ID → Wecker-ID aus AntonOS
    static let mapKey = "antonAlarm.map"
    /// AlarmKit-IDs des Nachklingelns (läuft, bis die Aufgabe gelöst ist) – früher eine einzelne ID
    static let fallbackKey = "antonAlarm.fallback"
    /// AlarmKit-ID → Einstellungen, mit denen der Wecker gestellt wurde (damit Abgleichen nichts unnötig neu stellt)
    static let signatureKey = "antonAlarm.signatures"
    /// Wecker, die beim Abgleichen gerade klingelten und danach nicht mehr gebraucht werden
    static let staleKey = "antonAlarm.stale"
    /// Gestoppter Wecker, dessen Aufgabe noch offen ist: { id, at }
    static let pendingKey = "antonAlarm.pending"
    static let stoppedNotification = Notification.Name("antonAlarmStopped")
    /// Wie oft geschlummert wurde: { jsId: [Anzahl, Zeitpunkt] }
    static let snoozeKey = "antonAlarm.snoozes"

    /// Schlummer-Zähler eines Weckers (verfällt nach zwei Stunden)
    static func snoozes(_ jsId: String) -> Int {
        guard let entry = (defaults.dictionary(forKey: snoozeKey) ?? [:])[jsId] as? [Double], entry.count == 2 else { return 0 }
        return Date().timeIntervalSince1970 - entry[1] < 2 * 3600 ? Int(entry[0]) : 0
    }

    static func setSnoozes(_ jsId: String, _ count: Int) {
        var all = defaults.dictionary(forKey: snoozeKey) ?? [:]
        all[jsId] = [Double(count), Date().timeIntervalSince1970]
        defaults.set(all, forKey: snoozeKey)
    }

    static var map: [String: String] {
        get { defaults.dictionary(forKey: mapKey) as? [String: String] ?? [:] }
        set { defaults.set(newValue, forKey: mapKey) }
    }

    static var fallbacks: [String] {
        get {
            if let list = defaults.stringArray(forKey: fallbackKey) { return list }
            if let one = defaults.string(forKey: fallbackKey) { return [one] }
            return []
        }
        set { defaults.set(newValue, forKey: fallbackKey) }
    }

    static var signatures: [String: String] {
        get { defaults.dictionary(forKey: signatureKey) as? [String: String] ?? [:] }
        set { defaults.set(newValue, forKey: signatureKey) }
    }

    static var stale: Set<String> {
        get { Set(defaults.stringArray(forKey: staleKey) ?? []) }
        set { defaults.set(Array(newValue), forKey: staleKey) }
    }

    static func markStopped(jsId: String) {
        defaults.set(["id": jsId, "at": Date().timeIntervalSince1970 * 1000, "snoozes": snoozes(jsId)], forKey: pendingKey)
    }
}

#if canImport(AlarmKit)
@available(iOS 26.0, *)
struct AntonAlarmMetadata: AlarmMetadata {}

/// Führt alle Änderungen an den iPhone-Weckern nacheinander aus. Liefen sie gleichzeitig (Abgleich aus der App,
/// „Stopp“ am Sperrbildschirm, Nachklingeln), überschrieben sie sich gegenseitig: Wecker wurden doppelt
/// gestellt oder ein Nachklingeln ging verloren und klingelte noch nach dem Lösen der Aufgabe.
@available(iOS 26.0, *)
actor AlarmQueue {
    static let shared = AlarmQueue()
    private var last: Task<Void, Never>?

    func run<T>(_ work: @escaping () async -> T) async -> T {
        let previous = last
        let task = Task { () async -> T in
            await previous?.value
            return await work()
        }
        last = Task { _ = await task.value }
        return await task.value
    }
}

@available(iOS 26.0, *)
enum AlarmScheduler {
    /// So lange nach „Stopp“ bleibt es still – danach klingelt der Wecker wieder, wenn die Aufgabe nicht gelöst ist.
    static let afterStopSeconds: TimeInterval = 60

    /// Zweiter Knopf: „Schlummern“, wenn erlaubt – sonst „Aufgabe lösen“ (bei Weckern mit Aufgabe)
    static func attributes(title: String, withTask: Bool, snooze: Bool) -> AlarmAttributes<AntonAlarmMetadata> {
        let stop = AlarmButton(text: "Stopp", textColor: .white, systemImageName: "stop.fill")
        let task = AlarmButton(text: "Aufgabe lösen", textColor: .white, systemImageName: "brain.head.profile")
        let nap = AlarmButton(text: "Schlummern", textColor: .white, systemImageName: "zzz")
        let second: AlarmButton? = snooze ? nap : (withTask ? task : nil)
        let alert = AlarmPresentation.Alert(
            title: LocalizedStringResource(stringLiteral: title),
            stopButton: stop,
            secondaryButton: second,
            secondaryButtonBehavior: second == nil ? nil : .custom
        )
        return AlarmAttributes(presentation: AlarmPresentation(alert: alert), metadata: AntonAlarmMetadata(), tintColor: .orange)
    }

    /// `snooze`: Schlummer-Dauer in Sekunden (0 = kein Schlummern), `snoozeMax`: höchste Anzahl
    /// Weckton: erster vorhandener aus „a.wav|b.wav“ – aus dem App-Paket (Standardtöne) oder
    /// Library/Sounds (eigene Lieder), sonst der iPhone-Weckton
    static func alertSound(_ names: String?) -> AlertConfiguration.AlertSound {
        if let name = soundName(names) { return .named(name) }
        return .default
    }

    /// Name des Tons, der tatsächlich klingelt – nil = iPhone-Weckton
    static func soundName(_ names: String?) -> String? {
        for name in (names ?? "").split(separator: "|").map(String.init) where !name.isEmpty {
            if Bundle.main.url(forResource: name, withExtension: nil) != nil || SoundFiles.exists(name) { return name }
        }
        return nil
    }

    static func schedule(id: UUID, title: String, schedule: Alarm.Schedule, withTask: Bool = true, snooze: Int = 0, snoozeMax: Int = 3, sound: String? = nil) async throws {
        let secondary: (any LiveActivityIntent)?
        if snooze > 0 {
            secondary = AntonAlarmSnoozeIntent(alarmID: id.uuidString, title: title, withTask: withTask, seconds: snooze, maxCount: snoozeMax, sound: sound ?? "")
        } else if withTask {
            secondary = AntonAlarmOpenIntent(alarmID: id.uuidString, sound: sound ?? "")
        } else {
            secondary = nil
        }
        let config = AlarmManager.AlarmConfiguration<AntonAlarmMetadata>(
            countdownDuration: nil,
            schedule: schedule,
            attributes: attributes(title: title, withTask: withTask, snooze: snooze > 0),
            stopIntent: withTask ? AntonAlarmStopIntent(alarmID: id.uuidString, sound: sound ?? "") : AntonAlarmDoneIntent(alarmID: id.uuidString),
            secondaryIntent: secondary,
            sound: alertSound(sound)
        )
        _ = try await AlarmManager.shared.schedule(id: id, configuration: config)
    }

    /// Klingelt in `seconds` Sekunden erneut (ersetzt ein früheres Nachklingeln).
    static func ringAgain(in seconds: TimeInterval, jsId: String, title: String, withTask: Bool = true, snooze: Int = 0, snoozeMax: Int = 3, sound: String? = nil) async throws {
        cancelFallback()
        let id = UUID()
        var map = AlarmStore.map
        map[id.uuidString] = jsId
        AlarmStore.map = map
        AlarmStore.fallbacks = [id.uuidString]
        try await schedule(id: id, title: title, schedule: .fixed(Date().addingTimeInterval(max(5, seconds))), withTask: withTask, snooze: snooze, snoozeMax: snoozeMax, sound: sound)
    }

    /// „Schlummern“ am Sperrbildschirm: still und nach `seconds` wieder klingeln – höchstens `maxCount`-mal
    static func handleSnooze(alarmID: String, title: String, withTask: Bool, seconds: Int, maxCount: Int, sound: String) async {
        let jsId = AlarmStore.map[alarmID] ?? ""
        let count = AlarmStore.snoozes(jsId)
        if count >= maxCount {
            // Genug geschlummert: mit Aufgabe wie „Stopp“, sonst gleich wieder klingeln – ohne Schlummern
            if withTask { return await handleStop(alarmID: alarmID, notify: true, sound: sound) }
            silence(alarmID)
            try? await ringAgain(in: 5, jsId: jsId, title: title, withTask: false, sound: sound)
            return
        }
        silence(alarmID)
        AlarmStore.setSnoozes(jsId, count + 1)
        try? await ringAgain(in: TimeInterval(seconds), jsId: jsId, title: title, withTask: withTask, snooze: seconds, snoozeMax: maxCount, sound: sound)
    }

    /// Streicht jedes geplante Nachklingeln
    static func cancelFallback() {
        let old = AlarmStore.fallbacks
        guard !old.isEmpty else { return }
        var map = AlarmStore.map
        for id in old {
            if let uuid = UUID(uuidString: id) { try? AlarmManager.shared.cancel(id: uuid) }
            map.removeValue(forKey: id)
        }
        AlarmStore.map = map
        AlarmStore.defaults.removeObject(forKey: AlarmStore.fallbackKey)
    }

    /// Wecker verstummen lassen. Ein beim Abgleichen nur behaltener (veralteter) Wecker wird ganz gelöscht –
    /// sonst stellt iOS ihn als Wiederholung neu und er klingelt doppelt.
    static func silence(_ alarmID: String) {
        guard let uuid = UUID(uuidString: alarmID) else { return }
        var stale = AlarmStore.stale
        if stale.contains(alarmID) {
            try? AlarmManager.shared.cancel(id: uuid)
            stale.remove(alarmID)
            AlarmStore.stale = stale
            var map = AlarmStore.map
            map.removeValue(forKey: alarmID)
            AlarmStore.map = map
        } else {
            try? AlarmManager.shared.stop(id: uuid)
        }
    }

    static func weekday(_ n: Int) -> Locale.Weekday? {
        switch n {
        case 1: return .monday
        case 2: return .tuesday
        case 3: return .wednesday
        case 4: return .thursday
        case 5: return .friday
        case 6: return .saturday
        case 7: return .sunday
        default: return nil
        }
    }

    /// Nach „Stopp“ oder „Aufgabe lösen“: Aufgabe merken und Nachklingeln planen.
    static func handleStop(alarmID: String, notify: Bool, sound: String = "") async {
        let jsId = AlarmStore.map[alarmID] ?? ""
        silence(alarmID)
        AlarmStore.markStopped(jsId: jsId)
        try? await ringAgain(in: afterStopSeconds, jsId: jsId, title: "Wecker – Aufgabe noch offen", sound: sound)
        NotificationCenter.default.post(name: AlarmStore.stoppedNotification, object: nil)
        if notify {
            let content = UNMutableNotificationContent()
            content.title = "⏰ Aufgabe lösen"
            content.body = "Öffne AntonOS und löse die Aufgabe – sonst klingelt der Wecker in einer Minute wieder."
            content.sound = .default
            content.interruptionLevel = .timeSensitive
            let request = UNNotificationRequest(identifier: "antonos-wecker-aufgabe", content: content, trigger: nil)
            try? await UNUserNotificationCenter.current().add(request)
        }
    }
}

/// „Stopp“ am Sperrbildschirm: läuft im Hintergrund, der Wecker klingelt nach einer Minute wieder.
@available(iOS 26.0, *)
struct AntonAlarmStopIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Wecker stoppen"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Wecker")
    var alarmID: String

    @Parameter(title: "Ton")
    var sound: String

    init() { alarmID = ""; sound = "" }
    init(alarmID: String, sound: String = "") { self.alarmID = alarmID; self.sound = sound }

    func perform() async throws -> some IntentResult {
        let alarmID = alarmID, sound = sound
        await AlarmQueue.shared.run { await AlarmScheduler.handleStop(alarmID: alarmID, notify: true, sound: sound) }
        return .result()
    }
}

/// „Stopp“ bei einem Wecker ohne Aufgabe: aus – ein veralteter Wecker wird dabei ganz gelöscht.
@available(iOS 26.0, *)
struct AntonAlarmDoneIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Wecker ausschalten"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Wecker")
    var alarmID: String

    init() { alarmID = "" }
    init(alarmID: String) { self.alarmID = alarmID }

    func perform() async throws -> some IntentResult {
        let alarmID = alarmID
        await AlarmQueue.shared.run {
            AlarmScheduler.silence(alarmID)
            AlarmStore.fallbacks = AlarmStore.fallbacks.filter { $0 != alarmID }
        }
        return .result()
    }
}

/// „Schlummern“ am Sperrbildschirm: läuft im Hintergrund.
@available(iOS 26.0, *)
struct AntonAlarmSnoozeIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Schlummern"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Wecker")
    var alarmID: String
    @Parameter(title: "Titel")
    var alarmTitle: String
    @Parameter(title: "Mit Aufgabe")
    var withTask: Bool
    @Parameter(title: "Sekunden")
    var seconds: Int
    @Parameter(title: "Höchstens")
    var maxCount: Int
    @Parameter(title: "Ton")
    var sound: String

    init() {
        alarmID = ""
        alarmTitle = "Wecker"
        withTask = true
        seconds = 540
        maxCount = 3
        sound = ""
    }

    init(alarmID: String, title: String, withTask: Bool, seconds: Int, maxCount: Int, sound: String) {
        self.alarmID = alarmID
        self.alarmTitle = title
        self.withTask = withTask
        self.seconds = seconds
        self.maxCount = maxCount
        self.sound = sound
    }

    func perform() async throws -> some IntentResult {
        let alarmID = alarmID, title = alarmTitle, withTask = withTask, seconds = seconds, maxCount = maxCount, sound = sound
        await AlarmQueue.shared.run {
            await AlarmScheduler.handleSnooze(alarmID: alarmID, title: title, withTask: withTask, seconds: seconds, maxCount: maxCount, sound: sound)
        }
        return .result()
    }
}

/// „Aufgabe lösen“: öffnet AntonOS direkt bei der Aufgabe.
@available(iOS 26.0, *)
struct AntonAlarmOpenIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Aufgabe lösen"
    static var openAppWhenRun: Bool = true
    static var isDiscoverable: Bool = false

    @Parameter(title: "Wecker")
    var alarmID: String

    @Parameter(title: "Ton")
    var sound: String

    init() { alarmID = ""; sound = "" }
    init(alarmID: String, sound: String = "") { self.alarmID = alarmID; self.sound = sound }

    func perform() async throws -> some IntentResult {
        let alarmID = alarmID, sound = sound
        await AlarmQueue.shared.run { await AlarmScheduler.handleStop(alarmID: alarmID, notify: false, sound: sound) }
        return .result()
    }
}
#endif

/// Brücke zu AlarmKit für `src/lib/native.ts` (JS-Name „AntonAlarm“).
@objc(AntonAlarmPlugin)
public class AntonAlarmPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AntonAlarmPlugin"
    public let jsName = "AntonAlarm"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ringIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "solved", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeStopped", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveSound", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeSound", returnType: CAPPluginReturnPromise),
    ]

    private var observer: NSObjectProtocol?

    override public func load() {
        observer = NotificationCenter.default.addObserver(forName: AlarmStore.stoppedNotification, object: nil, queue: .main) { [weak self] _ in
            self?.notifyListeners("stopped", data: [:])
        }
    }

    deinit {
        if let observer { NotificationCenter.default.removeObserver(observer) }
    }

    private static func stateName() -> String {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            switch AlarmManager.shared.authorizationState {
            case .authorized: return "granted"
            case .denied: return "denied"
            default: return "prompt"
            }
        }
        #endif
        return "unavailable"
    }

    @objc func status(_ call: CAPPluginCall) {
        call.resolve(["state": Self.stateName()])
    }

    @objc func requestPermission(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task {
                _ = try? await AlarmManager.shared.requestAuthorization()
                call.resolve(["state": Self.stateName()])
            }
            return
        }
        #endif
        call.resolve(["state": "unavailable"])
    }

    /// Ersetzt alle Weckzeiten: `alarms: [{ id, title, hour, minute, days: [1…7], task, at?, snooze?, snoozeMax? }]` (leere Tage = einmalig, `at` = fester Zeitpunkt in ms)
    @objc func sync(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            let list = call.getArray("alarms", JSObject.self) ?? []
            Task {
                let failed = await AlarmQueue.shared.run { await Self.syncAlarms(list) }
                call.resolve(["state": Self.stateName(), "failed": failed])
            }
            return
        }
        #endif
        call.resolve(["state": "unavailable", "failed": 0])
    }

    #if canImport(AlarmKit)
    /// Gleicht die iPhone-Wecker mit der Liste ab: Unveränderte bleiben stehen, nur Neues wird gestellt und
    /// Überflüssiges gelöscht. Gibt zurück, wie viele sich nicht stellen ließen.
    @available(iOS 26.0, *)
    private static func syncAlarms(_ list: [JSObject]) async -> Int {
        let fallbacks = Set(AlarmStore.fallbacks)
        let oldMap = AlarmStore.map
        let oldSignatures = AlarmStore.signatures
        var stale = AlarmStore.stale
        var map: [String: String] = [:]
        var signatures: [String: String] = [:]
        for id in fallbacks { if let jsId = oldMap[id] { map[id] = jsId } }

        // Gewünschte Wecker mit ihren Einstellungen (als Text zum Vergleichen)
        struct Wanted { let jsId: String; let title: String; let withTask: Bool; let snooze: Int; let snoozeMax: Int; let sound: String?; let schedule: Alarm.Schedule; let signature: String }
        var wanted: [Wanted] = []
        for item in list {
            guard let jsId = item["id"] as? String, let hour = (item["hour"] as? NSNumber)?.intValue, let minute = (item["minute"] as? NSNumber)?.intValue else { continue }
            let title = item["title"] as? String ?? "Wecker"
            let withTask = item["task"] as? Bool ?? true
            let snooze = (item["snooze"] as? NSNumber)?.intValue ?? 0
            let snoozeMax = (item["snoozeMax"] as? NSNumber)?.intValue ?? 3
            let sound = item["sound"] as? String
            let dayNumbers = (item["days"] as? JSArray ?? []).compactMap { ($0 as? NSNumber)?.intValue }
            let days = dayNumbers.compactMap(AlarmScheduler.weekday)
            let schedule: Alarm.Schedule
            var when = "\(hour):\(minute)/\(dayNumbers.map(String.init).joined(separator: ","))"
            if let at = (item["at"] as? NSNumber)?.doubleValue {
                // Fester Termin (bestimmtes Datum, Überspringen oder Pause)
                let date = Date(timeIntervalSince1970: at / 1000)
                if date <= Date() { continue }
                schedule = .fixed(date)
                when = "@\(Int(at))"
            } else {
                let time = Alarm.Schedule.Relative.Time(hour: hour, minute: minute)
                schedule = .relative(.init(time: time, repeats: days.isEmpty ? .never : .weekly(days)))
            }
            // Auch der tatsächlich gefundene Ton zählt – ein neu gespeichertes Lied stellt den Wecker neu
            let tone = AlarmScheduler.soundName(sound) ?? "standard"
            let signature = [jsId, when, title, withTask ? "aufgabe" : "", "\(snooze)x\(snoozeMax)", tone].joined(separator: "|")
            wanted.append(Wanted(jsId: jsId, title: title, withTask: withTask, snooze: snooze, snoozeMax: snoozeMax, sound: sound, schedule: schedule, signature: signature))
        }

        var open = wanted
        for alarm in (try? AlarmManager.shared.alarms) ?? [] {
            let key = alarm.id.uuidString
            if fallbacks.contains(key) { continue }
            // Unverändert: stehen lassen (auch während er klingelt)
            if let signature = oldSignatures[key], let index = open.firstIndex(where: { $0.signature == signature }), !stale.contains(key) {
                map[key] = open[index].jsId
                signatures[key] = signature
                open.remove(at: index)
                continue
            }
            // Ein gerade klingelnder Wecker bleibt – sonst verstummt er ohne Aufgabe. Beim Ausschalten wird er gelöscht,
            // damit er nicht neben dem neu gestellten weiterläuft und doppelt klingelt.
            if alarm.state == .alerting {
                if let jsId = oldMap[key] { map[key] = jsId }
                stale.insert(key)
                continue
            }
            try? AlarmManager.shared.cancel(id: alarm.id)
            stale.remove(key)
        }
        // Nicht mehr vorhandene Wecker aus der Liste der veralteten streichen
        let existing = Set(((try? AlarmManager.shared.alarms) ?? []).map { $0.id.uuidString })
        stale = stale.intersection(existing)

        var failed = 0
        for item in open {
            let id = UUID()
            do {
                try await AlarmScheduler.schedule(id: id, title: item.title, schedule: item.schedule, withTask: item.withTask, snooze: item.snooze, snoozeMax: item.snoozeMax, sound: item.sound)
                map[id.uuidString] = item.jsId
                signatures[id.uuidString] = item.signature
            } catch {
                failed += 1
            }
        }
        AlarmStore.map = map
        AlarmStore.signatures = signatures
        AlarmStore.stale = stale
        return failed
    }
    #endif

    /// Nachklingeln in `seconds` Sekunden (verschiebt ein schon geplantes)
    @objc func ringIn(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            let seconds = call.getDouble("seconds") ?? 60
            let jsId = call.getString("id") ?? ""
            let title = call.getString("title") ?? "Wecker"
            let withTask = call.getBool("task") ?? true
            let snooze = call.getInt("snooze") ?? 0
            let snoozeMax = call.getInt("snoozeMax") ?? 3
            let sound = call.getString("sound")
            Task {
                let ok = await AlarmQueue.shared.run { () async -> Bool in
                    do {
                        try await AlarmScheduler.ringAgain(in: seconds, jsId: jsId, title: title, withTask: withTask, snooze: snooze, snoozeMax: snoozeMax, sound: sound)
                        return true
                    } catch {
                        return false
                    }
                }
                if ok { call.resolve() } else { call.reject("Wecker ließ sich nicht planen") }
            }
            return
        }
        #endif
        call.resolve()
    }

    /// Aufgabe gelöst: kein Nachklingeln mehr
    @objc func solved(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task {
                await AlarmQueue.shared.run {
                    AlarmScheduler.cancelFallback()
                    Self.clearPending()
                }
                call.resolve()
            }
            return
        }
        #endif
        Self.clearPending()
        call.resolve()
    }

    private static func clearPending() {
        AlarmStore.defaults.removeObject(forKey: AlarmStore.pendingKey)
        AlarmStore.defaults.removeObject(forKey: AlarmStore.snoozeKey)
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ["antonos-wecker-aufgabe"])
    }

    /// Eigenes Lied als Weckton speichern: `{ name, data }` (WAV als Base64) nach Library/Sounds
    @objc func saveSound(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), let base64 = call.getString("data"), let data = Data(base64Encoded: base64) else {
            return call.reject("Ton fehlt")
        }
        do {
            try SoundFiles.save(name, data: data)
            call.resolve()
        } catch {
            call.reject("Ton ließ sich nicht speichern")
        }
    }

    @objc func removeSound(_ call: CAPPluginCall) {
        if let name = call.getString("name") { SoundFiles.remove(name) }
        call.resolve()
    }

    /// Gestoppter Wecker mit offener Aufgabe (einmal abholen): { id, at } oder leer
    @objc func takeStopped(_ call: CAPPluginCall) {
        guard let pending = AlarmStore.defaults.dictionary(forKey: AlarmStore.pendingKey) else { return call.resolve([:]) }
        AlarmStore.defaults.removeObject(forKey: AlarmStore.pendingKey)
        call.resolve(["id": pending["id"] as? String ?? "", "at": pending["at"] as? Double ?? 0, "snoozes": pending["snoozes"] as? Int ?? 0])
    }
}

/// Eigene Wecktöne in Library/Sounds – dort sucht iOS nach Tönen, die nicht im App-Paket liegen.
enum SoundFiles {
    static var folder: URL {
        FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Sounds", isDirectory: true)
    }

    /// Nur einfache Dateinamen, keine Pfade
    static func url(_ name: String) -> URL? {
        guard !name.isEmpty, !name.contains("/"), !name.hasPrefix(".") else { return nil }
        return folder.appendingPathComponent(name)
    }

    static func exists(_ name: String) -> Bool {
        guard let url = url(name) else { return false }
        return FileManager.default.fileExists(atPath: url.path)
    }

    static func save(_ name: String, data: Data) throws {
        guard let url = url(name) else { throw CocoaError(.fileWriteInvalidFileName) }
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic)
    }

    static func remove(_ name: String) {
        guard let url = url(name) else { return }
        try? FileManager.default.removeItem(at: url)
    }
}
