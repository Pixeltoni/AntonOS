import AppIntents
import SwiftUI
import WidgetKit

/* ---------- Lernkarten zum Umdrehen ----------
   Zeigt die nächste fällige Karte aus dem Stand der App (`WidgetSnapshot.cards` in src/lib/widgets.ts).
   Tippen dreht sie um (die umgedrehte Karte steht unter `karten.umgedreht` im gemeinsamen Speicher),
   danach „Nochmal“ oder „Wusste ich“. Die Bewertung landet als Aktion `card` in der Warteschlange;
   die App rechnet sie mit derselben Spaced-Repetition-Logik wie in der Lern-Sitzung (src/lib/srs.ts).
   Bis dahin blendet `WidgetStore.load` gewusste Karten aus und hängt „Nochmal“-Karten hinten an. */

enum KartenZustand {
    static let flippedKey = "karten.umgedreht"

    static var flipped: String? { WidgetStore.defaults?.string(forKey: flippedKey) }

    /// Umdrehen bzw. wieder zurückdrehen
    static func flip(_ id: String) {
        if flipped == id {
            WidgetStore.defaults?.removeObject(forKey: flippedKey)
        } else {
            WidgetStore.defaults?.set(id, forKey: flippedKey)
        }
    }

    static func clear() {
        WidgetStore.defaults?.removeObject(forKey: flippedKey)
    }
}

struct FlipCardIntent: AppIntent {
    static let title: LocalizedStringResource = "Lernkarte umdrehen"
    static let isDiscoverable: Bool = false

    @Parameter(title: "Karte") var cardID: String

    init() {}

    init(id: String) {
        self.cardID = id
    }

    func perform() async throws -> some IntentResult {
        KartenZustand.flip(cardID)
        WidgetCenter.shared.reloadTimelines(ofKind: KartenWidget.kind)
        return .result()
    }
}

struct RateCardIntent: AppIntent {
    static let title: LocalizedStringResource = "Lernkarte bewerten"
    static let isDiscoverable: Bool = false

    @Parameter(title: "Karte") var cardID: String
    @Parameter(title: "Gewusst") var known: Bool

    init() {}

    init(id: String, known: Bool) {
        self.cardID = id
        self.known = known
    }

    func perform() async throws -> some IntentResult {
        WidgetStore.enqueue(kind: "card", id: cardID, done: known)
        KartenZustand.clear()
        WidgetCenter.shared.reloadTimelines(ofKind: KartenWidget.kind)
        return .result()
    }
}

/// Knopf „Nochmal“ bzw. „Wusste ich“
private struct RateButton: View {
    let card: WCard
    let known: Bool
    var compact = false

    var body: some View {
        Button(intent: RateCardIntent(id: card.id, known: known)) {
            HStack(spacing: 3) {
                Image(systemName: known ? "checkmark" : "arrow.counterclockwise")
                if !compact {
                    Text(known ? "Wusste ich" : "Nochmal").lineLimit(1).minimumScaleFactor(0.75)
                }
            }
            .font(.caption2.weight(.bold))
            .foregroundStyle(compact ? Color.primary : Color.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, compact ? 3 : 7)
            .background(compact ? Color.primary.opacity(0.18) : (known ? Color.green : Color.red), in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// Homescreen: Vorderseite zum Antippen, Rückseite mit Bewertung
private struct HomeCard: View {
    let card: WCard?
    let flipped: Bool
    let left: Int
    let empty: Bool
    let large: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Caption(text: "Lernkarten", icon: "rectangle.on.rectangle.angled", color: .purple)
                Spacer(minLength: 4)
                if left > 0 {
                    Text("\(left) fällig").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            if empty {
                EmptyHint()
            } else if let card {
                if !card.course.isEmpty {
                    Text(card.course).font(.caption2.weight(.semibold)).foregroundStyle(Color(hex: card.color)).lineLimit(1)
                }
                if flipped {
                    if large {
                        Text(card.front).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                    }
                    Text(card.back)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(large ? 4 : 3)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    HStack(spacing: 6) {
                        RateButton(card: card, known: false)
                        RateButton(card: card, known: true)
                    }
                } else {
                    Button(intent: FlipCardIntent(id: card.id)) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(card.front)
                                .font(.headline)
                                .lineLimit(large ? 3 : 4)
                                .minimumScaleFactor(0.6)
                                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                            Label("Tippen zum Umdrehen", systemImage: "arrow.triangle.2.circlepath")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    .buttonStyle(.plain)
                }
            } else if left > 0 {
                // Das Widget kennt nur die ersten Karten – die nächsten bringt Daywerk beim Öffnen mit
                Spacer(minLength: 0)
                Text("Weitere Karten warten").font(.headline)
                Text("Tippen öffnet Daywerk mit den nächsten Karten.").font(.caption2).foregroundStyle(.secondary)
                Spacer(minLength: 0)
            } else {
                Spacer(minLength: 0)
                Label("Alles gelernt", systemImage: "checkmark.seal.fill").font(.headline)
                Text("Heute ist keine Karte mehr fällig.").font(.caption2).foregroundStyle(.secondary)
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/// Sperrbildschirm: zwei Zeilen Vorderseite, umgedreht die Rückseite mit zwei kleinen Knöpfen
private struct LockCard: View {
    let card: WCard?
    let flipped: Bool
    let left: Int

    var body: some View {
        if let card {
            if flipped {
                VStack(alignment: .leading, spacing: 3) {
                    Text(card.back).font(.caption.weight(.semibold)).lineLimit(2).minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    HStack(spacing: 6) {
                        RateButton(card: card, known: false, compact: true)
                        RateButton(card: card, known: true, compact: true)
                    }
                }
            } else {
                Button(intent: FlipCardIntent(id: card.id)) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(left == 1 ? "Lernkarte · 1 fällig" : "Lernkarten · \(left) fällig").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                        Text(card.front).font(.caption.weight(.semibold)).lineLimit(2).minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
            }
        } else if left > 0 {
            VStack(alignment: .leading, spacing: 1) {
                Text(left == 1 ? "Lernkarte · 1 fällig" : "Lernkarten · \(left) fällig").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                Text("Tippen für die nächsten").font(.caption.weight(.semibold)).lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            VStack(alignment: .leading, spacing: 1) {
                Text("Lernkarten").font(.caption2).foregroundStyle(.secondary)
                Label("Alles gelernt", systemImage: "checkmark.seal.fill").font(.headline)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct KartenView: View {
    let entry: SnapshotEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let card = entry.snapshot.cards?.first
        let flipped = card != nil && KartenZustand.flipped == card?.id
        let left = entry.snapshot.cardsDue ?? 0
        if family == .accessoryRectangular {
            LockCard(card: card, flipped: flipped, left: left)
        } else {
            HomeCard(card: card, flipped: flipped, left: left, empty: entry.empty, large: family != .systemSmall)
        }
    }
}

struct KartenWidget: Widget {
    static let kind = "AntonOSKarten"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: SnapshotProvider()) { entry in
            KartenView(entry: entry).widgetBackground(tint: .purple).widgetURL(AppLink.page("lernen"))
        }
        .configurationDisplayName("Lernkarten")
        .description("Fällige Karte umdrehen und bewerten, ohne die App zu öffnen.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}
