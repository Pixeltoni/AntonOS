import UIKit
import ManagedSettings
import ManagedSettingsUI

/// Was iOS zeigt, wenn eine gesperrte App im Fokus trotzdem geöffnet wird: Knubbel mit der Restzeit.
/// Jeder Versuch zählt im Fokus-Verlauf von AntonOS (SperreStand.countAttempt).
class SperreAnsicht: ShieldConfigurationDataSource {
    override func configuration(shielding application: Application) -> ShieldConfiguration {
        shield(name: application.localizedDisplayName)
    }

    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration {
        shield(name: application.localizedDisplayName)
    }

    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
        shield(name: webDomain.domain)
    }

    override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration {
        shield(name: webDomain.domain)
    }

    private func shield(name: String?) -> ShieldConfiguration {
        let accent = UIColor(red: 0.19, green: 0.69, blue: 0.78, alpha: 1)
        let icon = UIImage(named: "Knubbel")
        if SperreStand.isOver {
            return ShieldConfiguration(
                backgroundBlurStyle: .systemMaterial,
                backgroundColor: nil,
                icon: icon,
                title: ShieldConfiguration.Label(text: "Fokus geschafft 🎉", color: .label),
                subtitle: ShieldConfiguration.Label(text: "Knubbel gibt \(name ?? "die App") wieder frei.", color: .secondaryLabel),
                primaryButtonLabel: ShieldConfiguration.Label(text: "Entsperren", color: .white),
                primaryButtonBackgroundColor: accent,
                secondaryButtonLabel: nil
            )
        }
        SperreStand.countAttempt(app: name)
        let minutes = SperreStand.minutesLeft
        let left = minutes <= 1 ? "Noch 1 Minute" : "Noch \(minutes) Minuten"
        let end = Date(timeIntervalSince1970: SperreStand.endAt / 1000)
        let time = DateFormatter.localizedString(from: end, dateStyle: .none, timeStyle: .short)
        return ShieldConfiguration(
            backgroundBlurStyle: .systemMaterial,
            backgroundColor: nil,
            icon: icon,
            title: ShieldConfiguration.Label(text: left, color: .label),
            subtitle: ShieldConfiguration.Label(text: "Knubbel passt auf: \(name ?? "Diese App") bleibt bis \(time) zu. \(SperreStand.label) – du schaffst das!", color: .secondaryLabel),
            primaryButtonLabel: ShieldConfiguration.Label(text: "Zurück zum Fokus", color: .white),
            primaryButtonBackgroundColor: accent,
            secondaryButtonLabel: nil
        )
    }
}
