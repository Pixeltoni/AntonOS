import Foundation
import AppIntents

/// Warteschlange zwischen Siri bzw. Kurzbefehlen und AntonOS: Die Intents legen Einträge ab,
/// die Web-App holt sie über `AntonExtras.takeIntents` (src/components/extras.tsx) ab.
enum IntentQueue {
    static let key = "antonIntents.queue"
    static let changed = Notification.Name("antonIntentsChanged")

    static func push(kind: String, text: String) {
        let defaults = UserDefaults.standard
        var list = defaults.array(forKey: key) as? [[String: Any]] ?? []
        list.append(["kind": kind, "text": text, "at": Date().timeIntervalSince1970 * 1000])
        defaults.set(Array(list.suffix(50)), forKey: key)
        NotificationCenter.default.post(name: changed, object: nil)
    }

    /// Alle wartenden Einträge als JSON – danach ist die Warteschlange leer
    static func takeAll() -> String {
        let defaults = UserDefaults.standard
        let list = defaults.array(forKey: key) as? [[String: Any]] ?? []
        defaults.removeObject(forKey: key)
        guard let data = try? JSONSerialization.data(withJSONObject: list), let text = String(data: data, encoding: .utf8) else { return "[]" }
        return text
    }
}

/// „Hey Siri, AntonOS eintragen“ – ein Satz wie bei der Assistentin. Öffnet AntonOS mit dem Ergebnis zum Prüfen.
@available(iOS 17.0, *)
struct AddToAntonOSIntent: AppIntent {
    static let title: LocalizedStringResource = "In AntonOS eintragen"
    static let description = IntentDescription("Ein Satz wie bei der Assistentin: Aufgabe, Erinnerung, Termin, Ausgabe, Einkauf, Gewohnheit oder Notiz.")
    static let openAppWhenRun: Bool = true

    @Parameter(title: "Eintrag", requestValueDialog: IntentDialog("Was soll ich eintragen?"))
    var text: String

    init() {}

    func perform() async throws -> some IntentResult {
        IntentQueue.push(kind: "text", text: text)
        return .result()
    }
}

/// „Hey Siri, AntonOS Einkaufsliste“ – ohne die App zu öffnen.
@available(iOS 17.0, *)
struct AddShoppingIntent: AppIntent {
    static let title: LocalizedStringResource = "Auf die Einkaufsliste"
    static let description = IntentDescription("Setzt Sachen auf die Einkaufsliste von AntonOS, z. B. „Milch, 6 Eier“.")

    @Parameter(title: "Sachen", requestValueDialog: IntentDialog("Was brauchst du?"))
    var items: String

    init() {}

    func perform() async throws -> some IntentResult & ProvidesDialog {
        IntentQueue.push(kind: "einkauf", text: items)
        return .result(dialog: IntentDialog("Okay, steht auf der Einkaufsliste."))
    }
}

/// Fokus-Timer starten (auch für die Aktionstaste)
@available(iOS 17.0, *)
struct StartFocusIntent: AppIntent {
    static let title: LocalizedStringResource = "Fokus starten"
    static let description = IntentDescription("Öffnet AntonOS und startet den Fokus-Timer.")
    static let openAppWhenRun: Bool = true

    init() {}

    func perform() async throws -> some IntentResult {
        IntentQueue.push(kind: "fokus", text: "")
        return .result()
    }
}

/// Abends den Tag abschließen
@available(iOS 17.0, *)
struct CloseDayIntent: AppIntent {
    static let title: LocalizedStringResource = "Tag abschließen"
    static let description = IntentDescription("Öffnet den Tagesabschluss: Stimmung, Offenes auf morgen, Wecker prüfen.")
    static let openAppWhenRun: Bool = true

    init() {}

    func perform() async throws -> some IntentResult {
        IntentQueue.push(kind: "seite", text: "#/abend")
        return .result()
    }
}

/// Sätze für Siri und Einträge in der Kurzbefehle-App
@available(iOS 17.0, *)
struct AntonOSShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddToAntonOSIntent(),
            phrases: ["\(.applicationName) eintragen", "In \(.applicationName) eintragen", "Trag etwas in \(.applicationName) ein"],
            shortTitle: "Eintragen",
            systemImageName: "plus.circle"
        )
        AppShortcut(
            intent: AddShoppingIntent(),
            phrases: ["\(.applicationName) Einkaufsliste", "Einkaufsliste in \(.applicationName)", "Auf die Einkaufsliste in \(.applicationName)"],
            shortTitle: "Einkaufsliste",
            systemImageName: "cart"
        )
        AppShortcut(
            intent: StartFocusIntent(),
            phrases: ["\(.applicationName) Fokus starten", "Fokus starten mit \(.applicationName)"],
            shortTitle: "Fokus starten",
            systemImageName: "timer"
        )
        AppShortcut(
            intent: CloseDayIntent(),
            phrases: ["Tag abschließen mit \(.applicationName)", "\(.applicationName) Tag abschließen"],
            shortTitle: "Tag abschließen",
            systemImageName: "moon.stars"
        )
    }
}
