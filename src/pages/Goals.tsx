import { useState } from 'react';
import { useStore } from '../store';
import type { GoalArea } from '../types';
import { formatDate, relativeLabel, today } from '../lib/dates';
import { Empty, PageHeader, Panel, Progress } from '../components/ui';

const AREAS: { area: GoalArea; icon: string }[] = [
  { area: 'Studium', icon: '🎓' },
  { area: 'Karriere', icon: '💼' },
  { area: 'Gesundheit', icon: '💪' },
  { area: 'Persönlich', icon: '🌱' },
  { area: 'Finanzen', icon: '💰' },
];

export function Goals() {
  const { data, add, update, remove } = useStore();
  const [title, setTitle] = useState('');
  const [area, setArea] = useState<GoalArea>('Studium');
  const [why, setWhy] = useState('');
  const [deadline, setDeadline] = useState('');
  const t = today();

  return (
    <>
      <PageHeader title="Ziele" subtitle="Dein Vision Board – wofür du das alles machst" />
      <Panel title="Neues Ziel">
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            add('goals', { title: title.trim(), area, why: why.trim(), deadline: deadline || null, progress: 0 });
            setTitle('');
            setWhy('');
            setDeadline('');
          }}
        >
          <input className="grow" placeholder="Ziel" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Ziel" />
          <input className="grow" placeholder="Warum ist dir das wichtig?" value={why} onChange={(e) => setWhy(e.target.value)} aria-label="Warum" />
          <select value={area} onChange={(e) => setArea(e.target.value as GoalArea)} aria-label="Bereich">
            {AREAS.map((a) => <option key={a.area}>{a.area}</option>)}
          </select>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-label="Bis wann" />
          <button className="primary" type="submit">Hinzufügen</button>
        </form>
      </Panel>
      {data.goals.length === 0 && <Empty>Noch keine Ziele. Was willst du dieses Semester erreichen?</Empty>}
      <div className="board">
        {AREAS.map(({ area: a, icon }) => {
          const goals = data.goals.filter((g) => g.area === a);
          if (goals.length === 0) return null;
          return (
            <section key={a} className="board-col">
              <h2>{icon} {a}</h2>
              {goals.map((g) => (
                <article key={g.id} className={`goal ${g.progress >= 100 ? 'done' : ''}`}>
                  <div className="row between">
                    <strong>{g.title}</strong>
                    <button className="icon" onClick={() => remove('goals', g.id)} aria-label="Löschen" title="Löschen">×</button>
                  </div>
                  {g.why && <p className="muted small">{g.why}</p>}
                  {g.deadline && <p className="small" title={formatDate(g.deadline)}>Bis {relativeLabel(g.deadline, t)}</p>}
                  <Progress value={g.progress} />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={g.progress}
                    onChange={(e) => update('goals', g.id, { progress: Number(e.target.value) })}
                    aria-label={`Fortschritt ${g.title}`}
                  />
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}
