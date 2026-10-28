import { useState } from 'react';
import type { DateStr, Workout } from '../types';
import { addDays, formatDate, parseDate, relativeLabel, today } from '../lib/dates';
import { DEFAULT_WORKOUT_MINUTES, weekOf } from '../lib/rings';
import { Empty, PageHeader } from '../components/ui';
import { AddButton, Sheet } from '../components/sheet';
import { dayColor, DeleteSeriesButton, LogSheet, TrainingPlanPanel } from '../components/lifting';
import { formatNumber, MAX_SERIES, seriesDates, volume, type WorkoutRepeat } from '../lib/training';
import { weekdayOf } from '../lib/recurrence';
import { newId, useStore } from '../store';

const TYPES = ['Laufen', 'Krafttraining', 'Radfahren', 'Schwimmen', 'Yoga', 'Dehnen', 'Mannschaftssport', 'Sonstiges'];
const ICONS: Record<string, string> = { Laufen: '🏃', Krafttraining: '🏋️', Radfahren: '🚴', Schwimmen: '🏊', Yoga: '🧘', Dehnen: '🤸', Mannschaftssport: '⚽' };
const COLORS: Record<string, string> = { Laufen: '#34C759', Krafttraining: '#FF3B30', Radfahren: '#FF9500', Schwimmen: '#30B0C7', Yoga: '#AF52DE', Dehnen: '#5856D6', Mannschaftssport: '#007AFF' };
export const workoutIcon = (type: string) => ICONS[type] ?? '💪';
const workoutColor = (type: string) => COLORS[type] ?? '#8E8E93';
const minutesOf = (w: Workout) => (w.minutes && w.minutes > 0 ? w.minutes : DEFAULT_WORKOUT_MINUTES);

export function WorkoutList({ workouts, onOpen }: { workouts: Workout[]; onOpen?: (w: Workout) => void }) {
  const { update } = useStore();
  const t = today();
  if (workouts.length === 0) return <Empty>Keine Trainings.</Empty>;
  return (
    <ul className="ios-list">
      {workouts.map((w) => (
        <li key={w.id} className={w.done ? 'done' : ''}>
          <span className="icon-circle" style={{ background: workoutColor(w.type) }} aria-hidden>{workoutIcon(w.type)}</span>
          <button type="button" className="grow row-button" onClick={() => onOpen?.(w)} disabled={!onOpen}>
            <span className="task-title">{w.title}</span>
            <span className="muted small">
              {w.type} · <span title={formatDate(w.date)}>{relativeLabel(w.date, t)}</span>
              {w.minutes ? ` · ${w.minutes} Min.` : ''}
              {w.exercises?.length ? ` · ${w.exercises.length} Übungen · ${formatNumber(w.exercises.reduce((s, e) => s + volume(e.sets), 0))} kg` : ''}
              {w.notes && ` · ${w.notes}`}
            </span>
          </button>
          <button
            type="button"
            className={`check-pill ${w.done ? 'on' : ''}`}
            onClick={() => update('workouts', w.id, { done: !w.done })}
            aria-pressed={w.done}
            aria-label={`${w.title} ${w.done ? 'als offen markieren' : 'erledigt'}`}
          >
            {w.done ? '✓' : ''}
          </button>
        </li>
      ))}
    </ul>
  );
}

type Draft = Omit<Workout, 'id'>;

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const REPEATS: { id: WorkoutRepeat; label: string }[] = [
  { id: 'einmal', label: 'Einmal' },
  { id: 'woechentlich', label: 'Wöchentlich' },
  { id: 'monatlich', label: 'Monatlich' },
];

function WorkoutSheet({ initial, id, onClose }: { initial: Draft; id?: string; onClose: () => void }) {
  const { data, add, update, remove, mutate } = useStore();
  const [w, setW] = useState<Draft>(initial);
  const [minutes, setMinutes] = useState(initial.minutes ? String(initial.minutes) : '');
  const [repeat, setRepeat] = useState<WorkoutRepeat>('einmal');
  const [weekdays, setWeekdays] = useState<number[]>([weekdayOf(initial.date)]);
  const [until, setUntil] = useState<DateStr>(addDays(initial.date, 7 * 8 - 1));
  const t = today();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setW((x) => ({ ...x, [k]: v }));
  const plan = data.trainingPlan;
  const dates = id ? [w.date] : seriesDates(repeat, w.date, until, weekdays);
  const series = dates.length > 1;
  const toggleDay = (n: number) => setWeekdays((ds) => (ds.includes(n) ? (ds.length > 1 ? ds.filter((x) => x !== n) : ds) : [...ds, n].sort()));
  const pickRepeat = (r: WorkoutRepeat) => {
    setRepeat(r);
    setUntil(addDays(w.date, r === 'monatlich' ? 182 : 7 * 8 - 1));
  };
  return (
    <Sheet
      title={id ? 'Training bearbeiten' : series ? 'Trainings planen' : 'Neues Training'}
      submitLabel={id ? 'Sichern' : series ? `${dates.length} planen` : 'Hinzufügen'}
      onClose={onClose}
      submitDisabled={!w.title.trim() && !w.type}
      onSubmit={() => {
        const m = Number(minutes);
        const final: Draft = { ...w, title: w.title.trim() || w.type, notes: w.notes.trim(), minutes: m > 0 ? m : undefined, done: id ? w.done : w.date <= t };
        if (id) update('workouts', id, final);
        else if (!series) add('workouts', final);
        else {
          // Serie: jeder Termin wird ein eigenes, geplantes Training
          const seriesId = newId();
          mutate((d) => ({ ...d, workouts: [...d.workouts, ...dates.map((date) => ({ ...final, id: newId(), date, done: false, seriesId }))] }));
        }
        onClose();
      }}
    >
      {plan.length > 0 && (
        <div className="type-chips" role="radiogroup" aria-label="Aus dem Trainingsplan">
          {plan.map((d) => (
            <button key={d.id} type="button" role="radio" aria-checked={w.planDayId === d.id} className={w.planDayId === d.id ? 'on' : ''} style={{ ['--c' as string]: dayColor(plan, d.id) }} onClick={() => setW((x) => ({ ...x, planDayId: d.id, title: d.name, type: 'Krafttraining' }))}>
              <span aria-hidden>🏋️</span> {d.name}
            </button>
          ))}
        </div>
      )}
      <div className="type-chips" role="radiogroup" aria-label="Art">
        {TYPES.map((x) => (
          <button key={x} type="button" role="radio" aria-checked={!w.planDayId && w.type === x} className={!w.planDayId && w.type === x ? 'on' : ''} style={{ ['--c' as string]: workoutColor(x) }} onClick={() => setW((v) => ({ ...v, type: x, planDayId: undefined, title: v.planDayId ? '' : v.title }))}>
            <span aria-hidden>{workoutIcon(x)}</span> {x}
          </button>
        ))}
      </div>
      <label>Titel<input value={w.title} placeholder={`z. B. ${w.type === 'Laufen' ? '5 km Lauf' : w.type}`} onChange={(e) => set('title', e.target.value)} /></label>
      {!id && (
        <div className="segmented workout-repeat" role="radiogroup" aria-label="Wiederholen">
          {REPEATS.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={repeat === r.id} className={repeat === r.id ? 'selected' : ''} onClick={() => pickRepeat(r.id)}>{r.label}</button>
          ))}
        </div>
      )}
      {!id && repeat === 'woechentlich' && (
        <div className="weekday-picks" role="group" aria-label="Wochentage">
          {WEEKDAYS.map((label, i) => (
            <button key={label} type="button" aria-pressed={weekdays.includes(i + 1)} className={weekdays.includes(i + 1) ? 'on' : ''} onClick={() => toggleDay(i + 1)}>{label}</button>
          ))}
        </div>
      )}
      <div className="modal-grid">
        <label>{!id && repeat !== 'einmal' ? 'Ab' : 'Datum'}<input type="date" value={w.date} onChange={(e) => e.target.value && set('date', e.target.value)} /></label>
        {!id && repeat !== 'einmal'
          ? <label>Bis<input type="date" value={until} min={w.date} onChange={(e) => e.target.value && setUntil(e.target.value)} /></label>
          : <label>Dauer (Min.)<input type="number" min={1} value={minutes} placeholder={String(DEFAULT_WORKOUT_MINUTES)} onChange={(e) => setMinutes(e.target.value)} /></label>}
      </div>
      {!id && repeat !== 'einmal' && (
        <p className="muted small workout-series-hint">
          {dates.length} {dates.length === 1 ? 'Termin' : 'Termine'}: {dates.slice(0, 4).map((d) => parseDate(d).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })).join(', ')}{dates.length > 4 ? ' …' : ''}
          {dates.length >= MAX_SERIES ? ` (höchstens ${MAX_SERIES} auf einmal)` : ''}
        </p>
      )}
      {!id && repeat !== 'einmal' && <label>Dauer (Min.)<input type="number" min={1} value={minutes} placeholder={String(DEFAULT_WORKOUT_MINUTES)} onChange={(e) => setMinutes(e.target.value)} /></label>}
      <label>Notiz<input value={w.notes} placeholder="z. B. Gewicht, Zeit, Strecke" onChange={(e) => set('notes', e.target.value)} /></label>
      {id && <button type="button" className="danger" onClick={() => { if (confirm('Training löschen?')) { remove('workouts', id); onClose(); } }}>Training löschen</button>}
      {id && <DeleteSeriesButton workout={{ ...initial, id } as Workout} onDone={onClose} />}
    </Sheet>
  );
}

export function Training() {
  const { data } = useStore();
  const t = today();
  const [sheet, setSheet] = useState<{ initial: Draft; id?: string } | null>(null);
  const [logged, setLogged] = useState<Workout | null>(null);

  const sorted = [...data.workouts].sort((a, b) => b.date.localeCompare(a.date));
  const planned = sorted.filter((w) => !w.done).reverse();
  const done = sorted.filter((w) => w.done);
  const last30 = done.filter((w) => w.date >= addDays(t, -29));
  const week = weekOf(t).map((d) => ({ d, minutes: done.filter((w) => w.date === d).reduce((s, w) => s + minutesOf(w), 0) }));
  const weekMinutes = week.reduce((s, x) => s + x.minutes, 0);
  const max = Math.max(30, ...week.map((x) => x.minutes));
  // Trainings aus dem Plan öffnen die Eintragsansicht mit Gewicht und Wiederholungen
  const open = (w: Workout) => (w.planDayId || w.exercises?.length ? setLogged(w) : setSheet({ initial: { ...w }, id: w.id }));

  return (
    <>
      <PageHeader
        title="Training"
        subtitle={`${last30.length} Trainings in den letzten 30 Tagen`}
        actions={<AddButton label="Neues Training" onClick={() => setSheet({ initial: { title: '', type: TYPES[0], date: t, done: true, notes: '' } })} />}
      />
      <div className="health-grid">
        <section className="health-tile" style={{ ['--h' as string]: '#A6FF00' }}>
          <span className="health-label">🔥 Diese Woche</span>
          <span className="health-value">{weekMinutes} <small>Min.</small></span>
          <div className="fit-bars" aria-label="Minuten pro Tag">
            {week.map((x) => (
              <div key={x.d} className={x.d === t ? 'today' : ''} title={`${formatDate(x.d)}: ${x.minutes} Min.`}>
                <span style={{ height: `${(x.minutes / max) * 100}%` }} />
                <small>{parseDate(x.d).toLocaleDateString('de-DE', { weekday: 'narrow' })}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="health-tile" style={{ ['--h' as string]: '#FF9500' }}>
          <span className="health-label">📅 Geplant</span>
          <span className="health-value">{planned.length}</span>
          <span className="muted small">{planned[0] ? `Nächstes: ${planned[0].title} ${relativeLabel(planned[0].date, t)}` : 'Nichts geplant'}</span>
        </section>
      </div>
      <TrainingPlanPanel />
      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><h2>Geplant</h2></div>
          <WorkoutList workouts={planned.slice(0, 12)} onOpen={open} />
          {planned.length > 12 && <p className="muted small">+ {planned.length - 12} weitere geplant</p>}
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Verlauf</h2></div>
          <WorkoutList workouts={done.slice(0, 30)} onOpen={open} />
        </section>
      </div>
      {logged && <LogSheet workout={logged} day={data.trainingPlan.find((d) => d.id === logged.planDayId)} onClose={() => setLogged(null)} />}
      {sheet && <WorkoutSheet initial={sheet.initial} id={sheet.id} onClose={() => setSheet(null)} />}
    </>
  );
}
