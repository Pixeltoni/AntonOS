import { createPortal } from 'react-dom';
import { useStore } from '../store';
import type { Alarm } from '../types';
import { today } from '../lib/dates';
import { onDay, sortEntries, timeRange } from '../lib/calendar';
import { inToday } from '../lib/things';
import { isHabitDone } from '../lib/life';
import { hhmm, wakeStats } from '../lib/alarm';
import { useCalendarEntries } from './calendar';

const greeting = (h: number) => (h < 5 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 17 ? 'Hallo' : 'Guten Abend');

/** Nach dem Ausschalten: Termine, Aufgaben und Gewohnheiten von heute – wie das Morgen-Briefing beliebter Wecker-Apps */
export function MorningBrief({ alarm, snoozes, offAt, onClose }: { alarm: Alarm; snoozes: number; offAt: number; onClose: () => void }) {
  const { data, add, update, remove } = useStore();
  const entries = useCalendarEntries();
  const t = today();
  const off = new Date(offAt);
  const events = sortEntries(entries.filter((e) => onDay(e, t) && e.kind !== 'task' && !e.done)).slice(0, 5);
  const tasks = data.tasks.filter((x) => inToday(x, t) || (x.status === 'erledigt' && x.completedAt === t && x.due !== null && x.due <= t)).slice(0, 5);
  const habits = data.habits.slice(0, 6);
  const stats = wakeStats(data.wakeLogs, off);
  const name = data.settings.name.trim().split(' ')[0];

  const toggleHabit = (id: string) => {
    const habit = data.habits.find((h) => h.id === id);
    const log = data.habitLogs.find((l) => l.habitId === id && l.date === t);
    if (log && (!habit || isHabitDone(data.habitLogs, habit, t))) remove('habitLogs', log.id);
    else if (log) update('habitLogs', log.id, { amount: habit?.target });
    else add('habitLogs', habit?.target ? { habitId: id, date: t, amount: habit.target } : { habitId: id, date: t });
  };

  return createPortal(
    <div className="morning" role="dialog" aria-modal="true" aria-label="Guten Morgen">
      <div className="morning-inner">
        <header className="morning-head">
          <span className="morning-date">{off.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <h2>{greeting(off.getHours())}{name ? `, ${name}` : ''}</h2>
          <span className="muted">
            {alarm.label ? `${alarm.label} · ` : ''}Aus um {hhmm(off)}{snoozes > 0 ? ` · ${snoozes}-mal geschlummert` : ' · ohne Schlummern'}
          </span>
        </header>

        <section className="morning-card">
          <h3>Heute</h3>
          {events.length === 0 ? <p className="muted small">Keine Termine – ein freier Tag.</p> : (
            <ul>
              {events.map((e) => (
                <li key={e.key}>
                  <time>{e.time ? timeRange(e) : 'ganztägig'}</time>
                  <span className="morning-dot" style={{ background: e.color ?? 'var(--accent)' }} />
                  <span className="grow">{e.label}{e.location ? <span className="muted"> · {e.location}</span> : null}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {tasks.length > 0 && (
          <section className="morning-card">
            <h3>Aufgaben</h3>
            <ul>
              {tasks.map((x) => {
                const done = x.status === 'erledigt';
                return (
                  <li key={x.id}>
                    <button type="button" className={`morning-check${done ? ' on' : ''}`} aria-pressed={done} aria-label={`${x.title} ${done ? 'wieder öffnen' : 'erledigen'}`} onClick={() => update('tasks', x.id, { status: done ? 'offen' : 'erledigt' })} />
                    <span className={`grow${done ? ' muted morning-done' : ''}`}>{x.title}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {habits.length > 0 && (
          <section className="morning-card">
            <h3>Gewohnheiten</h3>
            <ul>
              {habits.map((h) => {
                const done = isHabitDone(data.habitLogs, h, t);
                return (
                  <li key={h.id}>
                    <button type="button" className={`morning-check${done ? ' on' : ''}`} aria-pressed={done} aria-label={`${h.name} ${done ? 'zurücknehmen' : 'abhaken'}`} onClick={() => toggleHabit(h.id)} />
                    <span className={`grow${done ? ' muted morning-done' : ''}`}>{h.icon} {h.name}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {stats.recent.length > 0 && (
          <div className="morning-stats">
            <span>Pünktlich in Folge <strong>{stats.streak} {stats.streak === 1 ? 'Tag' : 'Tage'}</strong></span>
            {stats.avgWake && <span>Ø aufgestanden <strong>{stats.avgWake}</strong></span>}
          </div>
        )}

        <button type="button" className="primary morning-go" onClick={onClose}>Los geht’s</button>
      </div>
    </div>,
    document.body,
  );
}
