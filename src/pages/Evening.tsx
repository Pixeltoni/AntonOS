import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { addDays, today } from '../lib/dates';
import { listTasks } from '../lib/tasks';
import { onDay, sortEntries, timeRange } from '../lib/calendar';
import { isHabitDone } from '../lib/life';
import { hhmm, skipNext } from '../lib/alarm';
import { dayCloseDue, dayTitle, defaultDayClose, openForToday, tomorrowAlarm, toTomorrow } from '../lib/dayclose';
import { notify } from '../lib/notify';
import { success } from '../lib/haptics';
import { isNativeApp } from '../lib/native';
import { useCalendarEntries } from '../components/calendar';
import { useToast } from '../components/toast';
import { MoodCheckIn } from './Review';
import { PageHeader } from '../components/ui';

/** Abends ein Blatt: Stimmung, Offenes auf morgen, Gewohnheiten, morgen im Blick, Wecker prüfen. */
export function Evening() {
  const { data, add, update, updateSettings } = useStore();
  const { show } = useToast();
  const entries = useCalendarEntries();
  const t = today();
  const tomorrow = addDays(t, 1);
  const now = new Date();
  const settings = data.settings.dayClose ?? defaultDayClose();
  const name = data.settings.name.trim().split(' ')[0];

  const doneToday = listTasks(data.tasks).filter((x) => x.status === 'erledigt' && x.completedAt === t).length;
  const open = openForToday(listTasks(data.tasks), t);
  const habitsOpen = data.habits.filter((h) => !isHabitDone(data.habitLogs, h, t));
  const events = sortEntries(entries.filter((e) => onDay(e, tomorrow) && e.kind !== 'task' && !e.done)).slice(0, 6);
  const wake = tomorrowAlarm(data.alarms, now);
  const firstTimed = events.find((e) => e.time);
  const closed = settings.last === t;

  const habitDone = (id: string) => {
    const habit = data.habits.find((h) => h.id === id);
    const log = data.habitLogs.find((l) => l.habitId === id && l.date === t);
    if (log) update('habitLogs', log.id, { amount: habit?.target });
    else add('habitLogs', habit?.target ? { habitId: id, date: t, amount: habit.target } : { habitId: id, date: t });
  };

  const allToTomorrow = () => {
    open.forEach((x) => update('tasks', x.id, toTomorrow(x, t)));
    show(`${open.length} ${open.length === 1 ? 'Aufgabe' : 'Aufgaben'} auf morgen geschoben`);
  };

  const finish = () => {
    updateSettings({ dayClose: { ...settings, last: t } });
    success();
    show('🌙 Tag abgeschlossen – gute Nacht!');
    location.hash = '#/dashboard';
  };

  return (
    <div className="evening">
      <PageHeader title={`Guten Abend${name ? `, ${name}` : ''}`} subtitle={`${dayTitle(t)} · ${doneToday} ${doneToday === 1 ? 'Aufgabe' : 'Aufgaben'} erledigt${open.length ? `, ${open.length} offen` : ''}`} />

      <section className="panel evening-card">
        <h3>Wie war dein Tag?</h3>
        <MoodCheckIn compact />
      </section>

      {open.length > 0 && (
        <section className="panel evening-card">
          <div className="row between">
            <h3>Noch offen</h3>
            {open.length > 1 && <button type="button" className="small" onClick={allToTomorrow}>Alle auf morgen</button>}
          </div>
          <ul className="evening-list">
            {open.map((x) => (
              <li key={x.id}>
                <button type="button" className="morning-check" aria-label={`${x.title} erledigen`} onClick={() => update('tasks', x.id, { status: 'erledigt' })} />
                <span className="grow">{x.title}</span>
                <button type="button" className="link small" onClick={() => update('tasks', x.id, toTomorrow(x, t))}>→ morgen</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {habitsOpen.length > 0 && (
        <section className="panel evening-card">
          <h3>Gewohnheiten von heute</h3>
          <ul className="evening-list">
            {habitsOpen.map((h) => (
              <li key={h.id}>
                <button type="button" className="morning-check" aria-label={`${h.name} abhaken`} onClick={() => habitDone(h.id)} />
                <span className="grow">{h.icon} {h.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel evening-card">
        <h3>Morgen · {dayTitle(tomorrow)}</h3>
        {events.length === 0 ? <p className="muted small">Noch nichts geplant.</p> : (
          <ul className="evening-list">
            {events.map((e) => (
              <li key={e.key}>
                <time className="muted small">{e.time ? timeRange(e) : 'ganztägig'}</time>
                <span className="morning-dot" style={{ background: e.color ?? 'var(--accent)' }} />
                <span className="grow">{e.label}{e.location ? <span className="muted"> · {e.location}</span> : null}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="evening-alarm">
          <span aria-hidden>⏰</span>
          {wake ? (
            <>
              <span className="grow">
                <strong>Wecker {hhmm(wake.at)}</strong>
                {firstTimed && <span className="muted small"> · {firstTimed.label} um {firstTimed.time}</span>}
              </span>
              <button type="button" className="small" onClick={() => update('alarms', wake.alarm.id, skipNext(wake.alarm, now))}>Morgen auslassen</button>
            </>
          ) : (
            <>
              <span className="grow muted">Für morgen ist kein Wecker gestellt{firstTimed ? ` – ${firstTimed.label} beginnt um ${firstTimed.time}` : ''}.</span>
              <a className="small" href="#/wecker">Wecker stellen</a>
            </>
          )}
        </div>
      </section>

      <button type="button" className="primary evening-done" onClick={finish} disabled={closed}>{closed ? 'Heute schon abgeschlossen ✓' : 'Tag abschließen'}</button>

      <details className="panel evening-settings">
        <summary>Erinnerung</summary>
        <div className="row wrap">
          <label className="row">
            <input type="checkbox" checked={settings.enabled} onChange={(e) => updateSettings({ dayClose: { ...settings, enabled: e.target.checked } })} />
            Jeden Abend erinnern um
          </label>
          <input type="time" value={settings.time} onChange={(e) => e.target.value && updateSettings({ dayClose: { ...settings, time: e.target.value } })} aria-label="Uhrzeit der Erinnerung" />
        </div>
        {closed && <button type="button" className="link small" onClick={() => updateSettings({ dayClose: { ...settings, last: undefined } })}>Abschluss von heute zurücknehmen</button>}
      </details>
    </div>
  );
}

const REMINDED_KEY = 'antonos:abend';

/** Erinnert im offenen AntonOS (Web) zur eingestellten Uhrzeit – die iPhone-App plant die Mitteilung im Voraus. */
export function useDayCloseReminder() {
  const { data } = useStore();
  const { show } = useToast();
  const ref = useRef(data);
  ref.current = data;
  useEffect(() => {
    const check = () => {
      const day = dayCloseDue(ref.current.settings.dayClose ?? defaultDayClose(), new Date());
      if (!day) return;
      try {
        if (localStorage.getItem(REMINDED_KEY) === day) return;
        localStorage.setItem(REMINDED_KEY, day);
      } catch {
        return;
      }
      if (location.hash.startsWith('#/abend')) return;
      const go = { label: 'Abschließen', run: () => (location.hash = '#/abend') };
      if (isNativeApp()) return show('🌙 Zeit, den Tag abzuschließen', go, 10000);
      notify('🌙 Tag abschließen', 'Wie war dein Tag? Offenes auf morgen schieben und den Wecker prüfen.', `abend-${day}`).then((ok) => {
        if (!ok) show('🌙 Zeit, den Tag abzuschließen', go, 10000);
      });
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [show]);
}
