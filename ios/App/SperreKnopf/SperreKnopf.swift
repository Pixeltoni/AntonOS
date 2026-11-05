import ManagedSettings

/// Knöpfe auf dem Sperrbildschirm der Ablenkungs-Sperre: „Zurück zum Fokus“ schließt die App.
/// Ist der Fokus-Block schon vorbei (AntonOS war geschlossen), hebt „Entsperren“ die Sperre auf.
class SperreKnopf: ShieldActionDelegate {
    override func handle(action: ShieldAction, for application: ApplicationToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        completionHandler(respond(to: action))
    }

    override func handle(action: ShieldAction, for webDomain: WebDomainToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        completionHandler(respond(to: action))
    }

    override func handle(action: ShieldAction, for category: ActivityCategoryToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        completionHandler(respond(to: action))
    }

    private func respond(to action: ShieldAction) -> ShieldActionResponse {
        if SperreStand.isOver {
            SperreStand.clear()
            return .defer
        }
        return .close
    }
}
