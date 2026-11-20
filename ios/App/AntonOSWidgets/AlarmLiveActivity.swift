import SwiftUI
import WidgetKit
#if canImport(AlarmKit)
import ActivityKit
import AlarmKit
import AppIntents

/* ---------- Wecker: Schlummern und Nachklingeln als Live-Aktivität (Sperrbildschirm und Dynamic Island) ---------- */
// AlarmKit verlangt diese Ansicht für Wecker mit Countdown – ohne sie kann iOS solche Wecker verwerfen.

@available(iOS 26.0, *)
private typealias AlarmAttrs = AlarmAttributes<AntonAlarmMetadata>

/// Zusatzdaten, egal ob AlarmKit sie optional liefert oder nicht
@available(iOS 26.0, *)
private func meta(_ attributes: AlarmAttrs) -> AntonAlarmMetadata? {
    let value: AntonAlarmMetadata? = attributes.metadata
    return value
}

/// Restzeit bis zum nächsten Klingeln
@available(iOS 26.0, *)
private struct AlarmTime: View {
    let state: AlarmPresentationState

    var body: some View {
        switch state.mode {
        case .countdown(let countdown):
            let now = Date.now
            Text(timerInterval: now...max(now, countdown.fireDate), countsDown: true)
        case .paused(let paused):
            let left = Int(max(0, paused.totalCountdownDuration - paused.previouslyElapsedDuration))
            Text(String(format: "%d:%02d", left / 60, left % 60))
        case .alert(let alert):
            Text(String(format: "%02d:%02d", alert.time.hour, alert.time.minute))
        @unknown default:
            Text("")
        }
    }
}

/// Uhrzeit, zu der es wieder klingelt
@available(iOS 26.0, *)
private func fireText(_ state: AlarmPresentationState) -> String? {
    guard case .countdown(let countdown) = state.mode else { return nil }
    return "klingelt um " + countdown.fireDate.formatted(date: .omitted, time: .shortened)
}

@available(iOS 26.0, *)
private func headline(_ attributes: AlarmAttrs) -> Text {
    if let title = attributes.presentation.countdown?.title { return Text(title) }
    return Text("Schlummern")
}

/// Ohne Aufgabe: „Aus“ beendet das Schlummern gleich hier. Mit Aufgabe: Daywerk öffnen.
@available(iOS 26.0, *)
private struct AlarmActionButton: View {
    let attributes: AlarmAttrs
    let state: AlarmPresentationState

    var body: some View {
        if meta(attributes)?.withTask == true {
            Link(destination: AppLink.page("wecker")) {
                Label("Aufgabe", systemImage: "brain.head.profile")
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(Capsule().fill(Color.white.opacity(0.18)))
            }
        } else {
            Button(intent: AntonAlarmEndCountdownIntent(alarmID: state.alarmID.uuidString)) {
                Label("Aus", systemImage: "stop.fill")
                    .font(.caption.weight(.semibold))
            }
            .buttonStyle(.borderedProminent)
            .tint(.orange)
        }
    }
}

@available(iOS 26.0, *)
private struct AlarmLockView: View {
    let attributes: AlarmAttrs
    let state: AlarmPresentationState

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Label {
                    headline(attributes)
                } icon: {
                    Image(systemName: "zzz")
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.orange)
                AlarmTime(state: state)
                    .font(.system(size: 40, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if let fire = fireText(state) {
                    Text([meta(attributes)?.label, fire].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.7))
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            AlarmActionButton(attributes: attributes, state: state)
        }
        .padding(16)
    }
}

@available(iOS 26.0, *)
struct AlarmLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AlarmAttributes<AntonAlarmMetadata>.self) { context in
            AlarmLockView(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(Color.black.opacity(0.6))
                .activitySystemActionForegroundColor(.white)
                .widgetURL(AppLink.page("wecker"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label {
                        headline(context.attributes)
                    } icon: {
                        Image(systemName: "zzz")
                    }
                    .font(.headline)
                    .foregroundStyle(.orange)
                    .lineLimit(1)
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    AlarmTime(state: context.state)
                        .font(.title2.weight(.semibold).monospacedDigit())
                        .foregroundStyle(.orange)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 90, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(fireText(context.state) ?? "")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        Spacer()
                        AlarmActionButton(attributes: context.attributes, state: context.state)
                    }
                }
            } compactLeading: {
                Image(systemName: "zzz").foregroundStyle(.orange)
            } compactTrailing: {
                AlarmTime(state: context.state)
                    .monospacedDigit()
                    .foregroundStyle(.orange)
                    .frame(maxWidth: 46)
            } minimal: {
                Image(systemName: "alarm.fill").foregroundStyle(.orange)
            }
            .widgetURL(AppLink.page("wecker"))
            .keylineTint(.orange)
        }
    }
}
#endif
