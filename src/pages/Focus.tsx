import { useStore } from '../store';
import type { FocusMode } from '../types';
import { addDays, formatDate, hours, today } from '../lib/dates';
import { FOCUS_MODES, focusMode, mmss, stackedWeek } from '../lib/focus';
import { weekOf } from '../lib/rings';
import { TimerRing, useFocus } from '../components/focus';
import { CourseBadge, CourseSelect, Empty, PageHeader, Panel } from '../components/ui';

const PRESETS = [25, 50, 90];
const NONE_COLOR = '#AEAEB2';

const duration = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} Std.${m ? ` ${m} Min.` : ''}` : `${m} Min.`;
};

function ModePicker() {
  const { timer, configure } = useFocus();
  return (
    <div className="segmented focus-modes" role="radiogroup" aria-label="Fokus-Modus">
      {FOCUS_MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={timer.config.mode === m.id}
          className={timer.config.mode === m.id ? 'on' : ''}
          style={{ ['--mode' as string]: m.color }}
          onClick={() => configure({ mode: m.id as FocusMode })}
        >
          <span aria-hidden>{m.icon}</span> {m.label}
        </button>
      ))}
    </div>
  );
}

function TimerPanel() {
  const { timer, left, start, pause, stop, skip, distract, configure } = useFocus();
  const { data } = useStore();
  const { config } = timer;
  const mode = focusMode(config.mode);
  const course = data.courses.find((c) => c.id === config.courseId);
  const phaseLabel = timer.phase === 'fokus'
    ? `${course ? `${course.name} · ` : ''}Runde ${timer.round} von ${config.rounds}`
    : timer.phase === 'pause' ? 'Kurze Pause ☕' : 'Lange Pause 🌿';

  return (
    <div className="focus-timer" style={{ ['--mode' as string]: mode.color }}>
      <ModePicker />
      <TimerRing size={260}>
        <span className="focus-time">{mmss(left)}</span>
        <span className="muted">{phaseLabel}</span>
      </TimerRing>
      <div className="focus-controls">
        <button type="button" className="round-btn cancel" disabled={!timer.active} onClick={() => stop(false)}>Abbrechen</button>
        {timer.running ? (
          <button type="button" className="round-btn pause" onClick={pause}>Pause</button>
        ) : (
          <button type="button" className="round-btn go" onClick={start}>{timer.active ? 'Weiter' : 'Start'}</button>
        )}
      </div>
      {timer.active && (
        <div className="row wrap center">
          {timer.phase === 'fokus' ? (
            <>
              <button type="button" onClick={distract}>Abgelenkt ({timer.distractions})</button>
              <button type="button" onClick={() => stop(true)}>Beenden &amp; speichern</button>
            </>
          ) : (
            <button type="button" onClick={skip}>Pause überspringen</button>
          )}
        </div>
      )}
      <details className="focus-settings" open={!timer.active}>
        <summary>Einstellungen</summary>
        <div className="form-grid">
          <label>
            Kurs
            <CourseSelect value={config.courseId} onChange={(courseId) => configure({ courseId })} />
          </label>
          <label>
            Fokus (Minuten)
            <div className="row wrap">
              {PRESETS.map((p) => (
                <button key={p} type="button" disabled={timer.active} className={config.work === p ? 'selected' : ''} onClick={() => configure({ work: p })}>{p}</button>
              ))}
              <input
                className="narrow"
                type="number"
                min={1}
                max={240}
                disabled={timer.active}
                value={config.work}
                onChange={(e) => configure({ work: Math.min(240, Math.max(1, Number(e.target.value) || 1)) })}
                aria-label="Eigene Dauer"
              />
            </div>
          </label>
          <label>
            Kurze Pause (Min.)
            <input type="number" min={0} max={60} value={config.short} onChange={(e) => configure({ short: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          <label>
            Lange Pause (Min.)
            <input type="number" min={0} max={90} value={config.long} onChange={(e) => configure({ long: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          <label>
            Runden
            <input type="number" min={1} max={12} value={config.rounds} onChange={(e) => configure({ rounds: Math.min(12, Math.max(1, Number(e.target.value) || 1)) })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={config.autoStart} onChange={(e) => configure({ autoStart: e.target.checked })} />
            Pausen und Runden automatisch starten
          </label>
          <label className="check">
            <input type="checkbox" checked={config.filterDashboard} onChange={(e) => configure({ filterDashboard: e.target.checked })} />
            Im Fokus nur passende Dashboard-Kästen zeigen
          </label>
        </div>
      </details>
    </div>
  );
}

function WeekChart() {
  const { data } = useStore();
  const t = today();
  const days = weekOf(t);
  const week = stackedWeek(data.sessions, days);
  const elapsed = days.filter((d) => d <= t).length;
  const total = week.reduce((s, d) => s + d.total, 0);
  const max = Math.max(60, ...week.map((d) => d.total));
  const color = (id: string | null) => data.courses.find((c) => c.id === id)?.color ?? NONE_COLOR;
  const name = (id: string | null) => data.courses.find((c) => c.id === id)?.name ?? 'Ohne Kurs';
  const perCourse = new Map<string | null, number>();
  for (const d of week) for (const p of d.parts) perCourse.set(p.courseId, (perCourse.get(p.courseId) ?? 0) + p.minutes);

  return (
    <div className="screen-time">
      <p className="muted small">Tagesdurchschnitt diese Woche</p>
      <p className="screen-time-avg">{duration(total / Math.max(1, elapsed))}</p>
      <div className="stacked-bars">
        {week.map((d) => (
          <div key={d.date} className={`stacked-bar ${d.date === t ? 'today' : ''}`} title={`${formatDate(d.date)}: ${duration(d.total)}`}>
            <div className="stacked-bar-col">
              {d.parts.map((p) => (
                <span key={String(p.courseId)} style={{ height: `${(p.minutes / max) * 100}%`, background: color(p.courseId) }} />
              ))}
            </div>
            <small>{new Date(`${d.date}T12:00`).toLocaleDateString('de-DE', { weekday: 'narrow' })}</small>
          </div>
        ))}
      </div>
      <ul className="screen-time-legend">
        {[...perCourse].sort((a, b) => b[1] - a[1]).map(([id, min]) => (
          <li key={String(id)}><span className="ring-dot" style={{ background: color(id) }} /> {name(id)} · {duration(min)}</li>
        ))}
      </ul>
    </div>
  );
}

export function Focus() {
  const { data, remove } = useStore();
  const t = today();
  const weekStart = addDays(t, -6);
  const week = data.sessions.filter((s) => s.date >= weekStart && s.date <= t);
  const weekMinutes = week.reduce((s, x) => s + x.minutes, 0);
  const weekDistractions = week.reduce((s, x) => s + x.distractions, 0);

  return (
    <>
      <PageHeader title="Fokus" subtitle="Modus wählen, Timer starten – AntonOS passt sich an" />
      <div className="grid-2">
        <Panel><TimerPanel /></Panel>
        <div className="stack">
          <Panel title="Diese Woche"><WeekChart /></Panel>
          <Panel title="Letzte 7 Tage">
            <p>
              <strong>{hours(weekMinutes)} Std.</strong> im Fokus · <strong>{weekDistractions}</strong> Ablenkungen
              {weekMinutes > 0 && <span className="muted"> ({Math.round((weekDistractions / weekMinutes) * 600) / 10} pro Stunde)</span>}
            </p>
          </Panel>
        </div>
      </div>
      <Panel title="Verlauf">
        {data.sessions.length === 0 ? <Empty>Noch keine Fokus-Sessions.</Empty> : (
          <ul className="list">
            {[...data.sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20).map((s) => {
              const m = focusMode(s.mode);
              return (
                <li key={s.id}>
                  <span className="grow">{formatDate(s.date)}</span>
                  <span className="tag" style={{ color: m.color }}>{m.icon} {m.label}</span>
                  <CourseBadge id={s.courseId} />
                  <span>{s.minutes} min</span>
                  <span className="muted">{s.distractions} Ablenk.</span>
                  <button className="icon" onClick={() => remove('sessions', s.id)} aria-label="Löschen" title="Löschen">×</button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
