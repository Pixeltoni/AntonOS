import AppIntents
import WidgetKit

/// Abhaken direkt im Widget (Aufgabe, Gewohnheit, Einkauf). Läuft in der Widget-Erweiterung,
/// merkt sich den Tipp im gemeinsamen Speicher – die App übernimmt ihn beim nächsten Öffnen.
struct ToggleItemIntent: AppIntent {
    static let title: LocalizedStringResource = "In AntonOS abhaken"
    static let isDiscoverable: Bool = false

    @Parameter(title: "Art") var kind: String
    @Parameter(title: "Eintrag") var itemID: String
    @Parameter(title: "Erledigt") var done: Bool

    init() {}

    init(kind: String, id: String, done: Bool) {
        self.kind = kind
        self.itemID = id
        self.done = done
    }

    func perform() async throws -> some IntentResult {
        WidgetStore.enqueue(kind: kind, id: itemID, done: done)
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

/// Wofür der Countdown zählt
enum CountdownTarget: String, AppEnum {
    case automatic, exam, trip

    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Countdown"
    static let caseDisplayRepresentations: [CountdownTarget: DisplayRepresentation] = [
        .automatic: "Was zuerst kommt",
        .exam: "Nächste Prüfung",
        .trip: "Nächste Reise",
    ]
}

struct CountdownConfigIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Countdown"

    @Parameter(title: "Zählen bis", default: .automatic) var target: CountdownTarget

    init() {}
}
