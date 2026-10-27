import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { ID } from '../types';
import { addDays, formatDate, hours, today } from '../lib/dates';
import { CourseBadge, CourseSelect, Empty, PageHeader, Panel, Stat } from '../components/ui';

const PRESETS = [25, 50, 90];

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export function Focus() {
  const { data, add, remove } = useStore();
  const [minutes, setMinutes] = useState(25);
  const [courseId, setCourseId] = useState<ID | null>(null);
  const [left, setLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [distractions, setDistractions] = useState(0);
  const endAt = useRef(0);

  const finish = (completedMinutes: number) => {
    setRunning(false);
    if (completedMinutes > 0) add('sessions', { date: today(), minutes: completedMinutes, courseId, distractions });
    setDistractions(0);
    setLeft(minutes * 60);
  };

  // Immer die aktuelle finish-Version (mit aktuellem Ablenkungszähler) aus dem Intervall aufrufen
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      const rest = Math.max(0, Math.round((endAt.current - Date.now()) / 1000));
      setLeft(rest);
      if (rest === 0) {
        clearInterval(timer);
        finishRef.current(minutes);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [running, minutes]);

  useEffect(() => {
    document.title = running ? `${mmss(left)} · Fokus` : 'AntonOS';
  }, [running, left]);

  const t = today();
  const weekStart = addDays(t, -6);
  const week = data.sessions.filter((s) => s.date >= weekStart && s.date <= t);
  const weekMinutes = week.reduce((s, x) => s + x.minutes, 0);
  const weekDistractions = week.reduce((s, x) => s + x.distractions, 0);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const perDay = days.map((d) => week.filter((s) => s.date === d).reduce((s, x) => s + x.minutes, 0));
  const max = Math.max(60, ...perDay);

  return (
    <>
      <PageHeader title="Fokus" subtitle="Lernzeit messen und Ablenkungen zählen" />
      <div className="grid-2">
        <Panel title="Timer">
          <div className="timer">{mmss(left)}</div>
          <div className="row wrap center">
            {PRESETS.map((p) => (
              <button
                key={p}
                disabled={running}
                className={minutes === p ? 'selected' : ''}
                onClick={() => {
                  setMinutes(p);
                  setLeft(p * 60);
                }}
              >
                {p} min
              </button>
            ))}
            <CourseSelect value={courseId} onChange={setCourseId} />
          </div>
          <div className="row wrap center">
            {!running ? (
              <button
                className="primary"
                onClick={() => {
                  endAt.current = Date.now() + left * 1000;
                  setRunning(true);
                }}
              >
                Start
              </button>
            ) : (
              <>
                <button onClick={() => setDistractions((d) => d + 1)}>Abgelenkt ({distractions})</button>
                <button className="primary" onClick={() => finish(Math.round((minutes * 60 - left) / 60))}>Beenden & speichern</button>
              </>
            )}
          </div>
        </Panel>
        <div className="stack">
          <div className="stats">
            <Stat label="Fokuszeit (7 Tage)" value={`${hours(weekMinutes)} h`} />
            <Stat label="Ablenkungen (7 Tage)" value={weekDistractions} hint={weekMinutes ? `${Math.round((weekDistractions / weekMinutes) * 600) / 10} pro Stunde` : undefined} />
          </div>
          <Panel title="Letzte 7 Tage">
            <div className="bars">
              {days.map((d, i) => (
                <div key={d} className="bar" title={`${formatDate(d)}: ${perDay[i]} min`}>
                  <span style={{ height: `${(perDay[i] / max) * 100}%` }} />
                  <small>{new Date(d + 'T00:00').toLocaleDateString('de-DE', { weekday: 'short' })}</small>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
      <Panel title="Verlauf">
        {data.sessions.length === 0 ? <Empty>Noch keine Fokus-Sessions.</Empty> : (
          <ul className="list">
            {[...data.sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20).map((s) => (
              <li key={s.id}>
                <span className="grow">{formatDate(s.date)}</span>
                <CourseBadge id={s.courseId} />
                <span>{s.minutes} min</span>
                <span className="muted">{s.distractions} Ablenk.</span>
                <button className="icon" onClick={() => remove('sessions', s.id)} aria-label="Löschen" title="Löschen">×</button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
