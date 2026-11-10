import AppIntents
import SwiftUI
import WidgetKit

/* ---------- Licht: Govee-Lampen direkt vom Homescreen und aus dem Kontrollzentrum schalten ----------
   Die App legt den Govee-Schlüssel und die Lampen (mit zuletzt bekanntem Zustand) per
   `AntonWidgets.setLights` in die App Group (`licht.schluessel`, `licht.geraete`, src/components/lights.tsx).
   Ein Tipp schickt den Befehl hier in der Widget-Erweiterung selbst an Govee – die App muss dafür
   nicht laufen. Felder von `LichtGeraet` gleich halten mit `WidgetLight` in src/lib/govee.ts. */

struct LichtGeraet: Codable, Hashable {
    let id: String
    let sku: String
    let name: String
    var on: Bool
    /// #RRGGBB, leer = unbekannt
    var color: String
    var brightness: Double
    /// Nur eigene Gruppen aus AntonOS: die Lampen darin
    var members: [LichtMitglied]? = nil

    var isGroup: Bool { !(members ?? []).isEmpty }
}

struct LichtMitglied: Codable, Hashable {
    let id: String
    let sku: String
}

enum LichtStore {
    static let keyKey = "licht.schluessel"
    static let devicesKey = "licht.geraete"

    static var key: String { WidgetStore.defaults?.string(forKey: keyKey) ?? "" }

    static func devices() -> [LichtGeraet] {
        guard let raw = WidgetStore.defaults?.string(forKey: devicesKey), let data = raw.data(using: .utf8),
              let list = try? JSONDecoder().decode([LichtGeraet].self, from: data) else { return [] }
        return list
    }

    static func save(_ list: [LichtGeraet]) {
        guard let data = try? JSONEncoder().encode(list), let text = String(data: data, encoding: .utf8) else { return }
        WidgetStore.defaults?.set(text, forKey: devicesKey)
    }

    /// Merkt den neuen Zustand; Gruppen sind an, sobald eine ihrer Lampen an ist
    static func setOn(_ ids: Set<String>, on: Bool) {
        var list = devices().map { d -> LichtGeraet in var d = d; if ids.contains(d.id) { d.on = on }; return d }
        let known = Dictionary(list.filter { !$0.isGroup }.map { ($0.id, $0.on) }, uniquingKeysWith: { a, _ in a })
        list = list.map { d in
            guard let members = d.members, !members.isEmpty else { return d }
            var d = d
            // Lampe gerade geschaltet → neuer Zustand; sonst der bekannte; in der App ausgeblendete Lampen → bisheriger Gruppenstand
            let before = d.on
            d.on = members.contains { m in ids.contains(m.id) ? on : (known[m.id] ?? before) }
            return d
        }
        save(list)
    }
}

/// Schaltet eine Lampe oder alle Lampen einer eigenen Gruppe und merkt sich das Ergebnis
enum LichtSchalter {
    static func set(id: String, sku: String, on: Bool) async throws {
        let lamp = LichtStore.devices().first { $0.id == id }
        if let members = lamp?.members, !members.isEmpty {
            var done = Set<String>()
            await withTaskGroup(of: String?.self) { group in
                for m in members {
                    group.addTask { (try? await GoveeAPI.power(id: m.id, sku: m.sku, on: on)) != nil ? m.id : nil }
                }
                for await hit in group { if let hit { done.insert(hit) } }
            }
            guard !done.isEmpty else { throw LichtFehler.antwort }
            // Gruppe nicht selbst setzen: ihr Zustand folgt aus den Lampen, die wirklich umgeschaltet wurden
            LichtStore.setOn(done, on: on)
        } else {
            try await GoveeAPI.power(id: id, sku: sku, on: on)
            LichtStore.setOn([id], on: on)
        }
        WidgetCenter.shared.reloadTimelines(ofKind: LichtWidget.kind)
        if #available(iOS 18.0, *) { ControlCenter.shared.reloadControls(ofKind: LichtControl.kind) }
    }
}

enum LichtFehler: Error {
    case keinSchluessel, antwort
}

enum GoveeAPI {
    static let control = URL(string: "https://openapi.api.govee.com/router/api/v1/device/control")!

    /// Schaltet eine Lampe (Befehl wie `controlBody` in src/lib/govee.ts)
    static func power(id: String, sku: String, on: Bool) async throws {
        let key = LichtStore.key
        guard !key.isEmpty else { throw LichtFehler.keinSchluessel }
        var req = URLRequest(url: control, timeoutInterval: 10)
        req.httpMethod = "POST"
        req.setValue(key, forHTTPHeaderField: "Govee-API-Key")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = [
            "requestId": UUID().uuidString,
            "payload": [
                "sku": sku,
                "device": id,
                "capability": ["type": "devices.capabilities.on_off", "instance": "powerSwitch", "value": on ? 1 : 0],
            ],
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { throw LichtFehler.antwort }
        if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let code = obj["code"] as? Int, code != 200 {
            throw LichtFehler.antwort
        }
    }
}

/// Tipp auf eine Lampe im Widget
struct ToggleLightIntent: AppIntent {
    static let title: LocalizedStringResource = "Lampe schalten"
    static let isDiscoverable: Bool = false

    @Parameter(title: "Lampe") var lampID: String
    @Parameter(title: "Modell") var sku: String
    @Parameter(title: "An") var on: Bool

    init() {}

    init(id: String, sku: String, on: Bool) {
        self.lampID = id
        self.sku = sku
        self.on = on
    }

    func perform() async throws -> some IntentResult {
        try await LichtSchalter.set(id: lampID, sku: sku, on: on)
        return .result()
    }
}

/// „Alle aus“ im großen Widget
struct AllLightsOffIntent: AppIntent {
    static let title: LocalizedStringResource = "Alle Lampen aus"
    static let isDiscoverable: Bool = false

    init() {}

    func perform() async throws -> some IntentResult {
        // Alle schicken, nicht nur die als „an“ gemerkten – jemand kann sie inzwischen in der Govee-App eingeschaltet haben
        // Auch Lampen, die nur in einer Gruppe stecken (in der App ausgeblendet)
        let list = LichtStore.devices()
        var lamps: [LichtMitglied] = list.filter { !$0.isGroup }.map { LichtMitglied(id: $0.id, sku: $0.sku) }
        for m in list.flatMap({ $0.members ?? [] }) where !lamps.contains(m) { lamps.append(m) }
        var done = Set<String>()
        for d in lamps {
            if (try? await GoveeAPI.power(id: d.id, sku: d.sku, on: false)) != nil { done.insert(d.id) }
        }
        LichtStore.setOn(done, on: false)
        WidgetCenter.shared.reloadTimelines(ofKind: LichtWidget.kind)
        if #available(iOS 18.0, *) { ControlCenter.shared.reloadControls(ofKind: LichtControl.kind) }
        return .result()
    }
}

/// Lampe zur Auswahl beim Bearbeiten von Widget und Schalter
struct LichtEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Lampe"
    static let defaultQuery = LichtQuery()

    let id: String
    let sku: String
    let name: String

    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
}

struct LichtQuery: EntityQuery {
    private func all() -> [LichtEntity] {
        LichtStore.devices().map { LichtEntity(id: $0.id, sku: $0.sku, name: $0.name) }
    }

    func entities(for identifiers: [String]) async throws -> [LichtEntity] {
        all().filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [LichtEntity] { all() }

    func defaultResult() async -> LichtEntity? { all().first }
}

struct LichtConfigIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Licht"
    static let description = IntentDescription("Welche Lampe oben steht (im kleinen Widget die einzige).")

    @Parameter(title: "Lampe") var lamp: LichtEntity?

    init() {}
}

struct LichtEntry: TimelineEntry {
    let date: Date
    let lights: [LichtGeraet]
    var noKey = false
    var lampID: String? = nil

    /// Gewählte Lampe zuerst, dann die übrigen in der Reihenfolge der App
    var ordered: [LichtGeraet] {
        guard let lampID, let i = lights.firstIndex(where: { $0.id == lampID }) else { return lights }
        var rest = lights
        let chosen = rest.remove(at: i)
        return [chosen] + rest
    }

    static let preview = LichtEntry(date: Date(), lights: [
        LichtGeraet(id: "1", sku: "H1", name: "Stehlampe", on: true, color: "#FFB46B", brightness: 80),
        LichtGeraet(id: "2", sku: "H1", name: "Lichtleiste", on: true, color: "#8A2BE2", brightness: 60),
        LichtGeraet(id: "3", sku: "H1", name: "Decke", on: false, color: "", brightness: 0),
        LichtGeraet(id: "4", sku: "H1", name: "Nachttisch", on: false, color: "", brightness: 0),
    ])
}

struct LichtProvider: AppIntentTimelineProvider {
    private func entry(preview: Bool, id: String?) -> LichtEntry {
        if preview { return LichtEntry(date: Date(), lights: LichtEntry.preview.lights, lampID: id) }
        if LichtStore.key.isEmpty { return LichtEntry(date: Date(), lights: [], noKey: true) }
        return LichtEntry(date: Date(), lights: LichtStore.devices(), lampID: id)
    }

    func placeholder(in context: Context) -> LichtEntry { .preview }

    func snapshot(for configuration: LichtConfigIntent, in context: Context) async -> LichtEntry {
        entry(preview: context.isPreview, id: configuration.lamp?.id)
    }

    func timeline(for configuration: LichtConfigIntent, in context: Context) async -> Timeline<LichtEntry> {
        // Der Stand ändert sich nur durch Tipps hier oder in der App – beide lassen neu zeichnen
        Timeline(entries: [entry(preview: false, id: configuration.lamp?.id)], policy: .after(Date().addingTimeInterval(6 * 3600)))
    }
}

private let lichtColor = Color.orange

private extension LichtGeraet {
    /// Farbe der Kachel: die Lampenfarbe, sonst warmes Licht
    var glow: Color { color.isEmpty || color.lowercased() == "#ffffff" ? Color(hex: "#FFC861") : Color(hex: color) }
}

/// Eine Lampe als Kachel zum Antippen
private struct LampTile: View {
    let lamp: LichtGeraet
    var big = false

    var body: some View {
        Button(intent: ToggleLightIntent(id: lamp.id, sku: lamp.sku, on: !lamp.on)) {
            VStack(alignment: .leading, spacing: big ? 6 : 3) {
                Image(systemName: lamp.isGroup ? (lamp.on ? "lightbulb.2.fill" : "lightbulb.2") : (lamp.on ? "lightbulb.fill" : "lightbulb"))
                    .font(big ? .title2 : .subheadline)
                    .foregroundStyle(lamp.on ? Color.black.opacity(0.75) : Color.secondary)
                Spacer(minLength: 0)
                Text(lamp.name)
                    .font((big ? Font.subheadline : Font.caption).weight(.semibold))
                    .foregroundStyle(lamp.on ? Color.black.opacity(0.85) : Color.primary)
                    .lineLimit(big ? 2 : 1)
                    .minimumScaleFactor(0.75)
                Text(lamp.on ? (lamp.brightness > 0 ? "An · \(Int(lamp.brightness)) %" : "An") : "Aus")
                    .font(.caption2)
                    .foregroundStyle(lamp.on ? Color.black.opacity(0.6) : Color.secondary)
                    .lineLimit(1)
            }
            .padding(big ? 12 : 8)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(lamp.on ? AnyShapeStyle(lamp.glow.gradient) : AnyShapeStyle(Color.primary.opacity(0.08)), in: RoundedRectangle(cornerRadius: big ? 22 : 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(lamp.name) \(lamp.on ? "ausschalten" : "einschalten")")
    }
}

/// Noch kein Govee verbunden bzw. keine Lampe
private struct LichtHint: View {
    let noKey: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: "lightbulb.2").font(.title3).foregroundStyle(lichtColor)
            Text(noKey ? "Govee verbinden" : "Keine Lampen").font(.caption.weight(.semibold))
            Text(noKey ? "In AntonOS unter Licht den Schlüssel eintragen." : "In AntonOS unter Licht neu laden.").font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct LichtView: View {
    @Environment(\.widgetFamily) private var family
    let entry: LichtEntry

    var body: some View {
        let list = entry.ordered
        if entry.noKey || list.isEmpty {
            LichtHint(noKey: entry.noKey)
        } else if family == .systemSmall, let lamp = list.first {
            LampTile(lamp: lamp, big: true)
        } else {
            let count = family == .systemLarge ? 8 : 4
            let shown = Array(list.prefix(count))
            let anyOn = list.contains(where: \.on)
            VStack(alignment: .leading, spacing: 8) {
                if family == .systemLarge {
                    HStack {
                        Caption(text: "Licht", icon: "lightbulb.fill", color: lichtColor)
                        Spacer()
                        Button(intent: AllLightsOffIntent()) {
                            Text("Alle aus").font(.caption.weight(.bold)).padding(.horizontal, 10).padding(.vertical, 5)
                                .background(Color.primary.opacity(anyOn ? 0.14 : 0.07), in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    ForEach(shown, id: \.id) { lamp in
                        LampTile(lamp: lamp).frame(height: family == .systemLarge ? 66 : 62)
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }
}

struct LichtWidget: Widget {
    static let kind = "AntonOSLicht"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: Self.kind, intent: LichtConfigIntent.self, provider: LichtProvider()) { entry in
            LichtView(entry: entry).widgetBackground(tint: lichtColor).widgetURL(AppLink.page("licht"))
        }
        .configurationDisplayName("Licht")
        .description("Govee-Lampen mit einem Tipp an- und ausschalten.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

/* ---------- Schalter fürs Kontrollzentrum, den Sperrbildschirm und die Aktionstaste (ab iOS 18) ---------- */

@available(iOS 18.0, *)
struct LichtControlConfig: ControlConfigurationIntent {
    static let title: LocalizedStringResource = "Lampe"

    @Parameter(title: "Lampe") var lamp: LichtEntity?

    init() {}
}

@available(iOS 18.0, *)
struct LichtControlValue {
    let lamp: LichtEntity?
    let on: Bool
}

@available(iOS 18.0, *)
struct LichtControlProvider: AppIntentControlValueProvider {
    func previewValue(configuration: LichtControlConfig) -> LichtControlValue {
        LichtControlValue(lamp: configuration.lamp, on: false)
    }

    func currentValue(configuration: LichtControlConfig) async throws -> LichtControlValue {
        guard let lamp = configuration.lamp else { return LichtControlValue(lamp: nil, on: false) }
        let on = LichtStore.devices().first(where: { $0.id == lamp.id })?.on ?? false
        return LichtControlValue(lamp: lamp, on: on)
    }
}

@available(iOS 18.0, *)
struct SetLightIntent: SetValueIntent {
    static let title: LocalizedStringResource = "Lampe schalten"
    static let isDiscoverable: Bool = false

    @Parameter(title: "Lampe") var lamp: LichtEntity?
    @Parameter(title: "An") var value: Bool

    init() {}

    init(lamp: LichtEntity?) {
        self.lamp = lamp
    }

    func perform() async throws -> some IntentResult {
        guard let lamp else { return .result() }
        try await LichtSchalter.set(id: lamp.id, sku: lamp.sku, on: value)
        return .result()
    }
}

@available(iOS 18.0, *)
struct LichtControl: ControlWidget {
    static let kind = "io.github.pixeltoni.antonos.licht"

    var body: some ControlWidgetConfiguration {
        AppIntentControlConfiguration(kind: Self.kind, provider: LichtControlProvider()) { value in
            ControlWidgetToggle(value.lamp?.name ?? "Licht", isOn: value.on, action: SetLightIntent(lamp: value.lamp)) { on in
                Label(on ? "An" : "Aus", systemImage: on ? "lightbulb.fill" : "lightbulb")
            }
            .tint(.orange)
        }
        .displayName("Licht")
        .description("Eine Govee-Lampe an- und ausschalten.")
        .promptsForUserConfiguration()
    }
}
