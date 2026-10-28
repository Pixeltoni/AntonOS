import { useState } from 'react';
import { useStore } from '../store';
import type { Workout } from '../types';
import { addDays, formatDate, parseDate, relativeLabel, today } from '../lib/dates';
import { DEFAULT_WORKOUT_MINUTES, weekOf } from '../lib/rings';
import { Empty, PageHeader } from '../components/ui';
import { AddButton, Sheet } from '../components/sheet';

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

function WorkoutSheet({ initial, id, onClose }: { initial: Draft; id?: string; onClose: () => void }) {
  const { add, update, remove } = useStore();
  const [w, setW] = useState<Draft>(initial);
  const [minutes, setMinutes] = useState(initial.minutes ? String(initial.minutes) : '');
  const t = today();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setW((x) => ({ ...x, [k]: v }));
  return (
    <Sheet
      title={id ? 'Training bearbeiten' : 'Neues Training'}
      submitLabel={id ? 'Sichern' : 'Hinzufügen'}
      onClose={onClose}
      submitDisabled={!w.title.trim() && !w.type}
      onSubmit={() => {
        const m = Number(minutes);
        const final: Draft = { ...w, title: w.title.trim() || w.type, notes: w.notes.trim(), minutes: m > 0 ? m : undefined, done: id ? w.done : w.date <= t };
        if (id) update('workouts', id, final);
        else add('workouts', final);
        onClose();
      }}
    >
      <div className="type-chips" role="radiogroup" aria-label="Art">
        {TYPES.map((x) => (
          <button key={x} type="button" role="radio" aria-checked={w.type === x} className={w.type === x ? 'on' : ''} style={{ ['--c' as string]: workoutColor(x) }} onClick={() => set('type', x)}>
            <span aria-hidden>{workoutIcon(x)}</span> {x}
          </button>
        ))}
      </div>
      <label>Titel<input value={w.title} placeholder={`z. B. ${w.type === 'Laufen' ? '5 km Lauf' : w.type}`} onChange={(e) => set('title', e.target.value)} /></label>
      <div className="modal-grid">
        <label>Datum<input type="date" value={w.date} onChange={(e) => set('date', e.target.value)} /></label>
        <label>Dauer (Min.)<input type="number" min={1} value={minutes} placeholder={String(DEFAULT_WORKOUT_MINUTES)} onChange={(e) => setMinutes(e.target.value)} /></label>
      </div>
      <label>Notiz<input value={w.notes} placeholder="z. B. Gewicht, Zeit, Strecke" onChange={(e) => set('notes', e.target.value)} /></label>
      {id && <button type="button" className="danger" onClick={() => { if (confirm('Training löschen?')) { remove('workouts', id); onClose(); } }}>Training löschen</button>}
    </Sheet>
  );
}

export function Training() {
  const { data } = useStore();
  const t = today();
  const [sheet, setSheet] = useState<{ initial: Draft; id?: string } | null>(null);

  const sorted = [...data.workouts].sort((a, b) => b.date.localeCompare(a.date));
  const planned = sorted.filter((w) => !w.done).reverse();
  const done = sorted.filter((w) => w.done);
  const last30 = done.filter((w) => w.date >= addDays(t, -29));
  const week = weekOf(t).map((d) => ({ d, minutes: done.filter((w) => w.date === d).reduce((s, w) => s + minutesOf(w), 0) }));
  const weekMinutes = week.reduce((s, x) => s + x.minutes, 0);
  const max = Math.max(30, ...week.map((x) => x.minutes));
  const open = (w: Workout) => setSheet({ initial: { ...w }, id: w.id });

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
      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><h2>Geplant</h2></div>
          <WorkoutList workouts={planned} onOpen={open} />
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Verlauf</h2></div>
          <WorkoutList workouts={done.slice(0, 30)} onOpen={open} />
        </section>
      </div>
      {sheet && <WorkoutSheet initial={sheet.initial} id={sheet.id} onClose={() => setSheet(null)} />}
    </>
  );
}
