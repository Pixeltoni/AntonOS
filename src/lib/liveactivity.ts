import type { Course } from '../types';
import { focusMode, phaseMinutes, remainingMs, type FocusTimer } from './focus';
import type { FocusActivityState } from './native';

/** Stand für die Live-Aktivität – null, wenn kein Timer läuft bzw. pausiert ist */
export function focusActivityState(timer: FocusTimer, course: Pick<Course, 'name' | 'code' | 'color'> | undefined, now: number): FocusActivityState | null {
  if (!timer.active) return null;
  const mode = focusMode(timer.config.mode);
  const left = remainingMs(timer, now);
  const total = phaseMinutes(timer.config, timer.phase) * 60_000;
  const endAt = timer.running ? timer.endAt : now + left;
  const label = timer.phase !== 'fokus' ? (timer.phase === 'pause' ? 'Pause' : 'Lange Pause') : course ? (course.name.length > 18 && course.code ? course.code : course.name) : mode.label;
  return {
    label,
    icon: timer.phase === 'fokus' ? mode.icon : '☕️',
    color: timer.phase === 'fokus' ? (course?.color || mode.color) : '#34C759',
    phase: timer.phase,
    startAt: endAt - total,
    endAt,
    paused: !timer.running,
    leftSeconds: Math.ceil(left / 1000),
    round: timer.round,
    rounds: timer.config.rounds,
  };
}

/** Nur neu senden, wenn sich etwas Sichtbares geändert hat (nicht jede Sekunde) */
export const activityKey = (s: FocusActivityState | null) =>
  s ? [s.label, s.phase, s.paused, s.paused ? s.leftSeconds : Math.round(s.endAt / 1000), s.round, s.color].join('|') : '';
