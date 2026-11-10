import Foundation
import UIKit
import Capacitor
import LocalAuthentication
import HealthKit
import Vision
import CoreLocation
import UserNotifications
#if canImport(ActivityKit)
import ActivityKit
#endif

/// Weitere iPhone-Funktionen für Daywerk (src/lib/native.ts → `AntonExtras`):
/// Face ID, Live-Aktivität des Fokus-Timers, Siri-Warteschlange, Apple Health,
/// Texterkennung für Kassenzettel und Erinnerungen beim Ankommen an Orten.
@objc(AntonExtrasPlugin)
public class AntonExtrasPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "AntonExtrasPlugin"
    public let jsName = "AntonExtras"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "biometry", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "focusActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeIntents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "healthStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "healthAuthorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "healthRead", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recognizeText", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "locationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentLocation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "geocode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncPlaces", returnType: CAPPluginReturnPromise),
    ]

    private let healthStore = HKHealthStore()
    private var locationManager: CLLocationManager?
    private var permissionCalls: [CAPPluginCall] = []
    private var locationCalls: [CAPPluginCall] = []
    private var intentObserver: NSObjectProtocol?

    override public func load() {
        intentObserver = NotificationCenter.default.addObserver(forName: IntentQueue.changed, object: nil, queue: .main) { [weak self] _ in
            self?.notifyListeners("intent", data: [:])
        }
    }

    deinit {
        if let intentObserver { NotificationCenter.default.removeObserver(intentObserver) }
    }

    /// Zahl aus dem JS-Objekt (Int, Double oder NSNumber)
    private static func number(_ value: Any?) -> Double {
        if let d = value as? Double { return d }
        if let i = value as? Int { return Double(i) }
        if let n = value as? NSNumber { return n.doubleValue }
        return 0
    }

    /* ---------- Face ID ---------- */

    @objc func biometry(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else { return call.resolve(["kind": "none"]) }
        var kind = "none"
        switch context.biometryType {
        case .faceID: kind = "faceID"
        case .touchID: kind = "touchID"
        default: kind = "none"
        }
        if #available(iOS 17.0, *), context.biometryType == .opticID { kind = "opticID" }
        call.resolve(["kind": kind])
    }

    /// Face ID bzw. Touch ID, sonst der iPhone-Code
    @objc func authenticate(_ call: CAPPluginCall) {
        let context = LAContext()
        context.localizedCancelTitle = "Abbrechen"
        let reason = call.getString("reason") ?? "Daywerk entsperren"
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { ok, _ in
            call.resolve(["ok": ok])
        }
    }

    /* ---------- Fokus-Timer als Live-Aktivität ---------- */

    @objc func focusActivity(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { return call.resolve(["active": false]) }
        let state = call.getObject("state")
        Task {
            let active = await FocusActivityController.apply(state)
            call.resolve(["active": active])
        }
        #else
        call.resolve(["active": false])
        #endif
    }

    /* ---------- Siri und Kurzbefehle ---------- */

    @objc func takeIntents(_ call: CAPPluginCall) {
        call.resolve(["items": IntentQueue.takeAll()])
    }

    /* ---------- Apple Health ---------- */

    private static var readTypes: Set<HKObjectType> {
        var types: Set<HKObjectType> = [HKObjectType.workoutType()]
        if let steps = HKQuantityType.quantityType(forIdentifier: .stepCount) { types.insert(steps) }
        if let sleep = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) { types.insert(sleep) }
        return types
    }

    @objc func healthStatus(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else { return call.resolve(["state": "unavailable"]) }
        healthStore.getRequestStatusForAuthorization(toShare: [], read: Self.readTypes) { status, _ in
            call.resolve(["state": status == .unnecessary ? "granted" : "prompt"])
        }
    }

    @objc func healthAuthorize(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else { return call.resolve(["state": "unavailable"]) }
        healthStore.requestAuthorization(toShare: nil, read: Self.readTypes) { ok, _ in
            call.resolve(["state": ok ? "granted" : "denied"])
        }
    }

    /// Sammelt die Ergebnisse der Health-Abfragen (laufen parallel)
    private final class HealthResult: @unchecked Sendable {
        let lock = NSLock()
        var steps: [String: Double] = [:]
        var sleep: [String: [(Date, Date)]] = [:]
        var workouts: [[String: Any]] = []

        func with(_ fn: (HealthResult) -> Void) {
            lock.lock()
            fn(self)
            lock.unlock()
        }
    }

    /// Schlaf ohne Doppelzählung (iPhone und Watch messen oft gleichzeitig): Zeiträume zusammenlegen
    private static func mergedSeconds(_ ranges: [(Date, Date)]) -> Double {
        let sorted = ranges.sorted { $0.0 < $1.0 }
        var total: Double = 0
        var current: (Date, Date)?
        for r in sorted {
            if let c = current, r.0 <= c.1 {
                current = (c.0, max(c.1, r.1))
            } else {
                if let c = current { total += c.1.timeIntervalSince(c.0) }
                current = r
            }
        }
        if let c = current { total += c.1.timeIntervalSince(c.0) }
        return total
    }

    private static func workoutName(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .running: return "Laufen"
        case .walking: return "Gehen"
        case .cycling: return "Radfahren"
        case .swimming: return "Schwimmen"
        case .traditionalStrengthTraining, .functionalStrengthTraining: return "Krafttraining"
        case .coreTraining: return "Core-Training"
        case .highIntensityIntervalTraining: return "HIIT"
        case .yoga: return "Yoga"
        case .pilates: return "Pilates"
        case .hiking: return "Wandern"
        case .rowing: return "Rudern"
        case .elliptical: return "Crosstrainer"
        case .soccer: return "Fußball"
        case .basketball: return "Basketball"
        case .tennis: return "Tennis"
        case .climbing: return "Klettern"
        case .cardioDance, .socialDance: return "Tanzen"
        case .mixedCardio: return "Cardio"
        default: return "Workout"
        }
    }

    @objc func healthRead(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else { return call.reject("Apple Health ist nicht verfügbar") }
        let days = max(1, min(60, call.getInt("days") ?? 14))
        let calendar = Calendar.current
        let end = Date()
        guard let start = calendar.date(byAdding: .day, value: -(days - 1), to: calendar.startOfDay(for: end)) else { return call.reject("Datum") }
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        let result = HealthResult()
        let group = DispatchGroup()

        if let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) {
            group.enter()
            let query = HKStatisticsCollectionQuery(
                quantityType: stepType,
                quantitySamplePredicate: HKQuery.predicateForSamples(withStart: start, end: end),
                options: .cumulativeSum,
                anchorDate: start,
                intervalComponents: DateComponents(day: 1)
            )
            query.initialResultsHandler = { _, collection, _ in
                collection?.enumerateStatistics(from: start, to: end) { stat, _ in
                    let value = stat.sumQuantity()?.doubleValue(for: .count()) ?? 0
                    let key = formatter.string(from: stat.startDate)
                    result.with { $0.steps[key] = value }
                }
                group.leave()
            }
            healthStore.execute(query)
        }

        if let sleepType = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) {
            group.enter()
            // Ab dem Vorabend, damit die erste Nacht vollständig ist
            let predicate = HKQuery.predicateForSamples(withStart: start.addingTimeInterval(-12 * 3600), end: end)
            let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
                for case let sample as HKCategorySample in samples ?? [] {
                    // 0 = im Bett, 2 = wach – zählt nicht als Schlaf
                    if sample.value == 0 || sample.value == 2 { continue }
                    let key = formatter.string(from: sample.endDate)
                    result.with { $0.sleep[key, default: []].append((sample.startDate, sample.endDate)) }
                }
                group.leave()
            }
            healthStore.execute(query)
        }

        group.enter()
        let workoutQuery = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: HKQuery.predicateForSamples(withStart: start, end: end), limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
            for case let workout as HKWorkout in samples ?? [] {
                let item: [String: Any] = [
                    "id": workout.uuid.uuidString,
                    "start": workout.startDate.timeIntervalSince1970 * 1000,
                    "minutes": workout.duration / 60,
                    "type": Self.workoutName(workout.workoutActivityType),
                ]
                result.with { $0.workouts.append(item) }
            }
            group.leave()
        }
        healthStore.execute(workoutQuery)

        group.notify(queue: .main) {
            var out: [[String: Any]] = []
            for i in 0..<days {
                guard let day = calendar.date(byAdding: .day, value: i, to: start) else { continue }
                let key = formatter.string(from: day)
                result.with { r in
                    out.append(["date": key, "steps": r.steps[key] ?? 0, "sleepMinutes": Self.mergedSeconds(r.sleep[key] ?? []) / 60])
                }
            }
            var workouts: [[String: Any]] = []
            result.with { workouts = $0.workouts }
            call.resolve(["days": out, "workouts": workouts])
        }
    }

    /* ---------- Texterkennung (Kassenzettel) ---------- */

    @objc func recognizeText(_ call: CAPPluginCall) {
        guard let base64 = call.getString("image"), let data = Data(base64Encoded: base64), let image = UIImage(data: data), let cgImage = image.cgImage else {
            return call.reject("Kein Bild")
        }
        let request = VNRecognizeTextRequest { request, _ in
            let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
            let items: [(CGRect, String)] = observations
                .compactMap { obs in obs.topCandidates(1).first.map { (obs.boundingBox, $0.string) } }
                .sorted { $0.0.midY > $1.0.midY }
            // Wörter auf gleicher Höhe zu einer Zeile zusammenfügen (Artikel links, Preis rechts)
            var rows: [[(CGRect, String)]] = []
            for item in items {
                if let first = rows.last?.first, abs(first.0.midY - item.0.midY) < max(first.0.height, item.0.height) * 0.6 {
                    rows[rows.count - 1].append(item)
                } else {
                    rows.append([item])
                }
            }
            let lines = rows.map { row in row.sorted { $0.0.minX < $1.0.minX }.map { $0.1 }.joined(separator: " ") }
            call.resolve(["lines": lines])
        }
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["de-DE", "en-US"]
        request.usesLanguageCorrection = false
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
            } catch {
                call.reject("Texterkennung fehlgeschlagen")
            }
        }
    }

    /* ---------- Standort und Orte ---------- */

    private func withManager(_ fn: @escaping (CLLocationManager) -> Void) {
        DispatchQueue.main.async {
            if self.locationManager == nil {
                let manager = CLLocationManager()
                manager.delegate = self
                manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
                self.locationManager = manager
            }
            fn(self.locationManager!)
        }
    }

    private static func state(_ status: CLAuthorizationStatus) -> String {
        switch status {
        case .authorizedAlways, .authorizedWhenInUse: return "granted"
        case .denied, .restricted: return "denied"
        case .notDetermined: return "prompt"
        @unknown default: return "prompt"
        }
    }

    @objc func locationStatus(_ call: CAPPluginCall) {
        let ask = call.getBool("ask") ?? false
        withManager { manager in
            let status = manager.authorizationStatus
            if status == .notDetermined && ask {
                self.permissionCalls.append(call)
                manager.requestWhenInUseAuthorization()
            } else {
                call.resolve(["state": Self.state(status)])
            }
        }
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard manager.authorizationStatus != .notDetermined else { return }
        let state = Self.state(manager.authorizationStatus)
        permissionCalls.forEach { $0.resolve(["state": state]) }
        permissionCalls.removeAll()
    }

    @objc func currentLocation(_ call: CAPPluginCall) {
        withManager { manager in
            self.locationCalls.append(call)
            manager.requestLocation()
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        locationCalls.forEach { $0.resolve(["lat": location.coordinate.latitude, "lon": location.coordinate.longitude]) }
        locationCalls.removeAll()
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        locationCalls.forEach { $0.reject("Standort nicht verfügbar") }
        locationCalls.removeAll()
    }

    @objc func geocode(_ call: CAPPluginCall) {
        guard let address = call.getString("address"), !address.isEmpty else { return call.reject("Adresse fehlt") }
        CLGeocoder().geocodeAddressString(address) { marks, _ in
            guard let mark = marks?.first, let location = mark.location else { return call.reject("Nicht gefunden") }
            call.resolve(["lat": location.coordinate.latitude, "lon": location.coordinate.longitude, "name": mark.name ?? address])
        }
    }

    static let placePrefix = "antonos-ort-"

    /// Ersetzt alle Orts-Mitteilungen (UNLocationNotificationTrigger, das System überwacht die Bereiche)
    @objc func syncPlaces(_ call: CAPPluginCall) {
        let items = call.getArray("items", JSObject.self) ?? []
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { pending in
            let old = pending.map { $0.identifier }.filter { $0.hasPrefix(Self.placePrefix) }
            center.removePendingNotificationRequests(withIdentifiers: old)
            var count = 0
            for item in items.prefix(20) {
                guard let id = item["id"] as? String else { continue }
                let lat = Self.number(item["lat"])
                let lon = Self.number(item["lon"])
                let radius = max(100, min(1000, Self.number(item["radius"])))
                let onExit = item["onExit"] as? Bool ?? false
                let identifier = Self.placePrefix + id
                let region = CLCircularRegion(center: CLLocationCoordinate2D(latitude: lat, longitude: lon), radius: radius, identifier: identifier)
                region.notifyOnEntry = !onExit
                region.notifyOnExit = onExit
                let content = UNMutableNotificationContent()
                content.title = item["title"] as? String ?? "Daywerk"
                content.body = item["body"] as? String ?? ""
                content.sound = .default
                // Gleiches Format wie @capacitor/local-notifications: Tippen öffnet die Seite (onNoticeTap)
                content.userInfo = ["cap_extra": ["href": item["href"] as? String ?? "#/"]]
                let request = UNNotificationRequest(identifier: identifier, content: content, trigger: UNLocationNotificationTrigger(region: region, repeats: true))
                center.add(request, withCompletionHandler: nil)
                count += 1
            }
            call.resolve(["count": count])
        }
    }
}

#if canImport(ActivityKit)
/// Startet, aktualisiert und beendet die Live-Aktivität des Fokus-Timers.
@available(iOS 16.2, *)
enum FocusActivityController {
    private static func number(_ value: Any?) -> Double {
        if let d = value as? Double { return d }
        if let i = value as? Int { return Double(i) }
        if let n = value as? NSNumber { return n.doubleValue }
        return 0
    }

    /// `raw` = Stand aus src/lib/liveactivity.ts; nil beendet die Aktivität
    static func apply(_ raw: JSObject?) async -> Bool {
        let running = Activity<FocusActivityAttributes>.activities
        guard let raw else {
            for activity in running { await activity.end(nil, dismissalPolicy: .immediate) }
            return false
        }
        let date = { (key: String) in Date(timeIntervalSince1970: FocusActivityController.number(raw[key]) / 1000) }
        let state = FocusActivityAttributes.ContentState(
            label: raw["label"] as? String ?? "Fokus",
            icon: raw["icon"] as? String ?? "⏱️",
            colorHex: raw["color"] as? String ?? "#FF9500",
            phase: raw["phase"] as? String ?? "fokus",
            startAt: date("startAt"),
            endAt: date("endAt"),
            paused: raw["paused"] as? Bool ?? false,
            leftSeconds: Int(number(raw["leftSeconds"])),
            round: Int(number(raw["round"])),
            rounds: Int(number(raw["rounds"])),
            detail: raw["detail"] as? String,
            goal: raw["goal"] as? String
        )
        // Läuft die Phase ab, ohne dass Daywerk aktualisiert, gilt die Anzeige als veraltet
        let content = ActivityContent(state: state, staleDate: state.paused ? nil : state.endAt.addingTimeInterval(5))
        if let current = running.first {
            await current.update(content)
            for extra in running.dropFirst() { await extra.end(nil, dismissalPolicy: .immediate) }
            return true
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
        do {
            _ = try Activity.request(attributes: FocusActivityAttributes(), content: content, pushType: nil)
            return true
        } catch {
            return false
        }
    }
}
#endif
