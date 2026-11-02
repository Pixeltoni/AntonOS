import Foundation
import UIKit
import Capacitor
import UserNotifications
import AppIntents
import SwiftUI
#if canImport(AlarmKit)
import AlarmKit
#endif

/// Startet die Web-Ansicht und meldet das eigene Wecker-Plugin an (siehe Main.storyboard).
class AntonBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AntonAlarmPlugin())
    }
}

/// Gemeinsamer Speicher zwischen Plugin und Intents (auch wenn die App im Hintergrund geweckt wird).
enum AlarmStore {
    static let defaults = UserDefaults.standard
    /// AlarmKit-ID → Wecker-ID aus AntonOS
    static let mapKey = "antonAlarm.map"
    /// AlarmKit-ID des Nachklingelns (läuft, bis die Aufgabe gelöst ist)
    static let fallbackKey = "antonAlarm.fallback"
    /// Gestoppter Wecker, dessen Aufgabe noch offen ist: { id, at }
    static let pendingKey = "antonAlarm.pending"
    static let stoppedNotification = Notification.Name("antonAlarmStopped")

    static var map: [String: String] {
        get { defaults.dictionary(forKey: mapKey) as? [String: String] ?? [:] }
        set { defaults.set(newValue, forKey: mapKey) }
    }

    static func markStopped(alarmID: String) {
        let jsId = map[alarmID] ?? ""
        defaults.set(["id": jsId, "at": Date().timeIntervalSince1970 * 1000], forKey: pendingKey)
    }
}

#if canImport(AlarmKit)
@available(iOS 26.0, *)
struct AntonAlarmMetadata: AlarmMetadata {}

@available(iOS 26.0, *)
enum AlarmScheduler {
    /// So lange nach „Stopp“ bleibt es still – danach klingelt der Wecker wieder, wenn die Aufgabe nicht gelöst ist.
    static let afterStopSeconds: TimeInterval = 60

    static func attributes(title: String, withTask: Bool) -> AlarmAttributes<AntonAlarmMetadata> {
        let stop = AlarmButton(text: "Stopp", textColor: .white, systemImageName: "stop.fill")
        let task = AlarmButton(text: "Aufgabe lösen", textColor: .white, systemImageName: "brain.head.profile")
        let alert = AlarmPresentation.Alert(
            title: LocalizedStringResource(stringLiteral: title),
            stopButton: stop,
            secondaryButton: withTask ? task : nil,
            secondaryButtonBehavior: withTask ? .custom : nil
        )
        return AlarmAttributes(presentation: AlarmPresentation(alert: alert), metadata: AntonAlarmMetadata(), tintColor: .blue)
    }

    static func schedule(id: UUID, title: String, schedule: Alarm.Schedule, withTask: Bool = true) async throws {
        let config = AlarmManager.AlarmConfiguration<AntonAlarmMetadata>(
            countdownDuration: nil,
            schedule: schedule,
            attributes: attributes(title: title, withTask: withTask),
            stopIntent: withTask ? AntonAlarmStopIntent(alarmID: id.uuidString) : nil,
            secondaryIntent: withTask ? AntonAlarmOpenIntent(alarmID: id.uuidString) : nil,
            sound: .default
        )
        _ = try await AlarmManager.shared.schedule(id: id, configuration: config)
    }

    /// Klingelt in `seconds` Sekunden erneut (ersetzt ein früheres Nachklingeln).
    static func ringAgain(in seconds: TimeInterval, jsId: String, title: String) async throws {
        cancelFallback()
        let id = UUID()
        var map = AlarmStore.map
        map[id.uuidString] = jsId
        AlarmStore.map = map
        AlarmStore.defaults.set(id.uuidString, forKey: AlarmStore.fallbackKey)
        try await schedule(id: id, title: title, schedule: .fixed(Date().addingTimeInterval(max(5, seconds))))
    }

    static func cancelFallback() {
        guard let old = AlarmStore.defaults.string(forKey: AlarmStore.fallbackKey), let uuid = UUID(uuidString: old) else { return }
        try? AlarmManager.shared.cancel(id: uuid)
        var map = AlarmStore.map
        map.removeValue(forKey: old)
        AlarmStore.map = map
        AlarmStore.defaults.removeObject(forKey: AlarmStore.fallbackKey)
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
    static func handleStop(alarmID: String, notify: Bool) async {
        let jsId = AlarmStore.map[alarmID] ?? ""
        try? AlarmManager.shared.stop(id: UUID(uuidString: alarmID) ?? UUID())
        AlarmStore.markStopped(alarmID: alarmID)
        try? await ringAgain(in: afterStopSeconds, jsId: jsId, title: "Wecker – Aufgabe noch offen")
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

    init() { alarmID = "" }
    init(alarmID: String) { self.alarmID = alarmID }

    func perform() async throws -> some IntentResult {
        await AlarmScheduler.handleStop(alarmID: alarmID, notify: true)
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

    init() { alarmID = "" }
    init(alarmID: String) { self.alarmID = alarmID }

    func perform() async throws -> some IntentResult {
        await AlarmScheduler.handleStop(alarmID: alarmID, notify: false)
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

    /// Ersetzt alle Weckzeiten: `alarms: [{ id, title, hour, minute, days: [1…7] }]` (leere Tage = einmalig)
    @objc func sync(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            let list = call.getArray("alarms", JSObject.self) ?? []
            Task {
                let fallback = AlarmStore.defaults.string(forKey: AlarmStore.fallbackKey)
                for alarm in (try? AlarmManager.shared.alarms) ?? [] where alarm.id.uuidString != fallback {
                    try? AlarmManager.shared.cancel(id: alarm.id)
                }
                var map: [String: String] = [:]
                if let fallback, let jsId = AlarmStore.map[fallback] { map[fallback] = jsId }
                var failed = 0
                for item in list {
                    guard let jsId = item["id"] as? String, let hour = (item["hour"] as? NSNumber)?.intValue, let minute = (item["minute"] as? NSNumber)?.intValue else { continue }
                    let title = item["title"] as? String ?? "Wecker"
                    let withTask = item["task"] as? Bool ?? true
                    let days = (item["days"] as? JSArray ?? []).compactMap { ($0 as? NSNumber)?.intValue }.compactMap(AlarmScheduler.weekday)
                    let time = Alarm.Schedule.Relative.Time(hour: hour, minute: minute)
                    let schedule = Alarm.Schedule.relative(.init(time: time, repeats: days.isEmpty ? .never : .weekly(days)))
                    let id = UUID()
                    do {
                        try await AlarmScheduler.schedule(id: id, title: title, schedule: schedule, withTask: withTask)
                        map[id.uuidString] = jsId
                    } catch {
                        failed += 1
                    }
                }
                AlarmStore.map = map
                call.resolve(["state": Self.stateName(), "failed": failed])
            }
            return
        }
        #endif
        call.resolve(["state": "unavailable", "failed": 0])
    }

    /// Nachklingeln in `seconds` Sekunden (verschiebt ein schon geplantes)
    @objc func ringIn(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            let seconds = call.getDouble("seconds") ?? 60
            let jsId = call.getString("id") ?? ""
            let title = call.getString("title") ?? "Wecker"
            Task {
                do {
                    try await AlarmScheduler.ringAgain(in: seconds, jsId: jsId, title: title)
                    call.resolve()
                } catch {
                    call.reject("Wecker ließ sich nicht planen")
                }
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
            AlarmScheduler.cancelFallback()
        }
        #endif
        AlarmStore.defaults.removeObject(forKey: AlarmStore.pendingKey)
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ["antonos-wecker-aufgabe"])
        call.resolve()
    }

    /// Gestoppter Wecker mit offener Aufgabe (einmal abholen): { id, at } oder leer
    @objc func takeStopped(_ call: CAPPluginCall) {
        guard let pending = AlarmStore.defaults.dictionary(forKey: AlarmStore.pendingKey) else { return call.resolve([:]) }
        AlarmStore.defaults.removeObject(forKey: AlarmStore.pendingKey)
        call.resolve(["id": pending["id"] as? String ?? "", "at": pending["at"] as? Double ?? 0])
    }
}
