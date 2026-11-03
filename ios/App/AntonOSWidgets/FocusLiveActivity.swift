import ActivityKit
import SwiftUI
import WidgetKit

/* ---------- 11 Fokus-Timer als Live-Aktivität (Sperrbildschirm und Dynamic Island) ---------- */

private typealias FocusState = FocusActivityAttributes.ContentState

/// Restzeit: läuft von selbst herunter, pausiert als feste Zahl
private struct FocusTime: View {
    let state: FocusState

    var body: some View {
        if state.paused {
            Text(String(format: "%02d:%02d", state.leftSeconds / 60, state.leftSeconds % 60))
        } else {
            Text(timerInterval: state.startAt...max(state.startAt, state.endAt), countsDown: true)
        }
    }
}

/// Fortschritt der Phase
private struct FocusProgress: View {
    let state: FocusState
    let color: Color

    var body: some View {
        if state.paused {
            let total = max(1, state.endAt.timeIntervalSince(state.startAt))
            ProgressView(value: max(0, min(1, 1 - Double(state.leftSeconds) / total)))
                .tint(color)
        } else {
            ProgressView(timerInterval: state.startAt...max(state.startAt, state.endAt), countsDown: false) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
            .tint(color)
        }
    }
}

private func roundText(_ s: FocusState) -> String {
    s.phase == "fokus" ? "Runde \(s.round)/\(s.rounds)" : (s.phase == "pause" ? "Kurze Pause" : "Lange Pause")
}

private let pauseLink = URL(string: "antonos://fokus-pause")!
private let startLink = URL(string: "antonos://fokus-start")!
private let stopLink = URL(string: "antonos://fokus-stop")!

/// Knöpfe: öffnen AntonOS und schalten dort den Timer
private struct FocusButtons: View {
    let state: FocusState

    var body: some View {
        HStack(spacing: 8) {
            Link(destination: state.paused ? startLink : pauseLink) {
                Label(state.paused ? "Weiter" : "Pause", systemImage: state.paused ? "play.fill" : "pause.fill")
                    .font(.caption.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(Color.white.opacity(0.18), in: Capsule())
            }
            Link(destination: stopLink) {
                Label("Beenden", systemImage: "stop.fill")
                    .font(.caption.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(Color.white.opacity(0.18), in: Capsule())
            }
        }
        .foregroundStyle(.white)
    }
}

private struct FocusLockView: View {
    let state: FocusState
    let stale: Bool

    var body: some View {
        let color = Color(hex: state.colorHex)
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(state.icon)
                Text(state.label).font(.headline).lineLimit(1)
                Spacer()
                Text(roundText(state)).font(.caption).foregroundStyle(.white.opacity(0.7))
            }
            if stale {
                Text("Phase vorbei – öffne AntonOS").font(.title3.weight(.semibold))
            } else {
                FocusTime(state: state)
                    .font(.system(size: 34, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(color)
            }
            FocusProgress(state: state, color: color)
            FocusButtons(state: state)
        }
        .foregroundStyle(.white)
        .padding(14)
    }
}

struct FocusLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FocusActivityAttributes.self) { context in
            FocusLockView(state: context.state, stale: context.isStale)
                .activityBackgroundTint(Color.black.opacity(0.6))
                .activitySystemActionForegroundColor(.white)
                .widgetURL(AppLink.page("fokus"))
        } dynamicIsland: { context in
            let state = context.state
            let color = Color(hex: state.colorHex)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        Text(state.icon)
                        Text(state.label).font(.headline).lineLimit(1)
                    }
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    FocusTime(state: state)
                        .font(.title2.weight(.semibold).monospacedDigit())
                        .foregroundStyle(color)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 90, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 8) {
                        HStack {
                            Text(roundText(state)).font(.caption).foregroundStyle(.secondary)
                            Spacer()
                        }
                        FocusProgress(state: state, color: color)
                        FocusButtons(state: state)
                    }
                }
            } compactLeading: {
                Text(state.icon)
            } compactTrailing: {
                FocusTime(state: state)
                    .monospacedDigit()
                    .foregroundStyle(color)
                    .frame(maxWidth: 46)
            } minimal: {
                Text(state.icon)
            }
            .widgetURL(AppLink.page("fokus"))
            .keylineTint(color)
        }
    }
}
