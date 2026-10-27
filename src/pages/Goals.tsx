import { useState } from 'react';
import { useStore } from '../store';
import type { GoalArea, WidgetVariant } from '../types';
import { formatDate, relativeLabel, today } from '../lib/dates';
import { Cover, ImageInput } from '../components/widgets';
import { Empty, PageHeader, Panel, Progress } from '../components/ui';

const AREAS: { area: GoalArea; icon: string }[] = [
  { area: 'Studium', icon: '🎓' },
  { area: 'Karriere', icon: '💼' },
  { area: 'Gesundheit', icon: '💪' },
  { area: 'Persönlich', icon: '🌱' },
  { area: 'Finanzen', icon: '💰' },
];

/** Bild-Mosaik aller Ziele – wie ein Vision Board an der Wand. */
export function VisionBoard({ variant = 'standard' }: { variant?: WidgetVariant }) {
  const { data } = useStore();
  if (data.goals.length === 0) return <Empty>Noch keine Ziele. <a href="#/ziele">Anlegen →</a></Empty>;
  const goals = variant === 'kompakt' ? data.goals.slice(0, 4) : data.goals;
  return (
    <div className={`vision ${variant}`}>
      {goals.map((g) => (
        <a key={g.id} href="#/ziele" className="vision-tile" title={g.why || g.title}>
          <Cover src={g.image} seed={g.id} emoji={AREAS.find((a) => a.area === g.area)?.icon} />
          <span>
            {g.title}
            {variant === 'detail' && g.why && <small>{g.why}</small>}
            {variant === 'detail' && <Progress value={g.progress} />}
          </span>
        </a>
      ))}
    </div>
  );
}

export function Goals() {
  const { data, add, update, remove } = useStore();
  const [title, setTitle] = useState('');
  const [area, setArea] = useState<GoalArea>('Studium');
  const [why, setWhy] = useState('');
  const [deadline, setDeadline] = useState('');
  const [image, setImage] = useState('');
  const t = today();

  return (
    <>
      <PageHeader title="Ziele" subtitle="Dein Vision Board – wofür du das alles machst" />
      <Panel title="Neues Ziel">
        <form
          className="col"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            add('goals', { title: title.trim(), area, why: why.trim(), deadline: deadline || null, progress: 0, image });
            setTitle('');
            setWhy('');
            setDeadline('');
            setImage('');
          }}
        >
          <div className="inline-form">
            <input className="grow" placeholder="Ziel" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Ziel" />
            <input className="grow" placeholder="Warum ist dir das wichtig?" value={why} onChange={(e) => setWhy(e.target.value)} aria-label="Warum" />
            <select value={area} onChange={(e) => setArea(e.target.value as GoalArea)} aria-label="Bereich">
              {AREAS.map((a) => <option key={a.area}>{a.area}</option>)}
            </select>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-label="Bis wann" />
          </div>
          <div className="inline-form">
            <div className="grow"><ImageInput value={image} onChange={setImage} label="Inspirationsbild" /></div>
            <button className="primary" type="submit">Hinzufügen</button>
          </div>
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
                  {g.image && <Cover src={g.image} seed={g.id} />}
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
                  <details>
                    <summary className="muted small">Bild ändern</summary>
                    <ImageInput value={g.image ?? ''} onChange={(v) => update('goals', g.id, { image: v })} />
                  </details>
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}
