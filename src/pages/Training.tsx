import { useState } from 'react';
import { useStore } from '../store';
import type { Workout } from '../types';
import { addDays, formatDate, relativeLabel, today } from '../lib/dates';
import { Empty, PageHeader, Panel, Stat } from '../components/ui';

const TYPES = ['Laufen', 'Krafttraining', 'Radfahren', 'Schwimmen', 'Yoga', 'Dehnen', 'Mannschaftssport', 'Sonstiges'];
const ICONS: Record<string, string> = { Laufen: '🏃', Krafttraining: '🏋️', Radfahren: '🚴', Schwimmen: '🏊', Yoga: '🧘', Dehnen: '🤸', Mannschaftssport: '⚽' };
export const workoutIcon = (type: string) => ICONS[type] ?? '💪';

export function WorkoutList({ workouts }: { workouts: Workout[] }) {
  const { update, remove } = useStore();
  const t = today();
  if (workouts.length === 0) return <Empty>Keine Trainings.</Empty>;
  return (
    <ul className="list">
      {workouts.map((w) => (
        <li key={w.id} className={`task ${w.done ? 'done' : ''}`}>
          <input type="checkbox" checked={w.done} onChange={() => update('workouts', w.id, { done: !w.done })} aria-label={`${w.title} erledigt`} />
          <div className="grow">
            <div className="task-title">{workoutIcon(w.type)} {w.title}</div>
            <div className="meta">
              <span className="tag">{w.type}</span>
              <span title={formatDate(w.date)}>{relativeLabel(w.date, t)}</span>
              {w.notes && <span>{w.notes}</span>}
            </div>
          </div>
          <button className="icon" onClick={() => remove('workouts', w.id)} aria-label="Löschen" title="Löschen">×</button>
        </li>
      ))}
    </ul>
  );
}

export function Training() {
  const { data, add } = useStore();
  const t = today();
  const [title, setTitle] = useState('');
  const [type, setType] = useState(TYPES[0]);
  const [date, setDate] = useState(t);
  const [notes, setNotes] = useState('');

  const sorted = [...data.workouts].sort((a, b) => b.date.localeCompare(a.date));
  const planned = sorted.filter((w) => !w.done).reverse();
  const done = sorted.filter((w) => w.done);
  const last30 = done.filter((w) => w.date >= addDays(t, -29)).length;

  return (
    <>
      <PageHeader title="Training" />
      <div className="stats">
        <Stat label="Trainings (30 Tage)" value={last30} />
        <Stat label="Geplant" value={planned.length} />
      </div>
      <Panel title="Training eintragen">
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            add('workouts', { title: title.trim(), type, date, notes: notes.trim(), done: date <= t });
            setTitle('');
            setNotes('');
          }}
        >
          <input className="grow" placeholder="z. B. 5 km Lauf" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Titel" />
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Art">{TYPES.map((x) => <option key={x}>{x}</option>)}</select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Datum" required />
          <input className="grow" placeholder="Notiz (z. B. Gewicht, Zeit)" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Notiz" />
          <button className="primary" type="submit">Hinzufügen</button>
        </form>
      </Panel>
      <div className="grid-2">
        <Panel title="Geplant"><WorkoutList workouts={planned} /></Panel>
        <Panel title="Erledigt"><WorkoutList workouts={done} /></Panel>
      </div>
    </>
  );
}
