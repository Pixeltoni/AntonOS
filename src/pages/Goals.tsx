import { useState } from 'react';
import { useStore } from '../store';
import type { GoalArea, WidgetVariant } from '../types';
import { formatDate, relativeLabel, today } from '../lib/dates';
import { Cover, ImageInput } from '../components/widgets';
import { Empty, PageHeader, Progress } from '../components/ui';
import { AddButton, Sheet } from '../components/sheet';

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
  const [adding, setAdding] = useState(false);
  const t = today();

  return (
    <>
      <PageHeader title="Ziele" subtitle="Dein Vision Board – wofür du das alles machst" actions={<AddButton label="Neues Ziel" onClick={() => setAdding(true)} />} />
      {adding && (
        <Sheet
          title="Neues Ziel"
          onClose={() => setAdding(false)}
          submitDisabled={!title.trim()}
          onSubmit={() => {
            add('goals', { title: title.trim(), area, why: why.trim(), deadline: deadline || null, progress: 0, image });
            setTitle('');
            setWhy('');
            setDeadline('');
            setImage('');
            setAdding(false);
          }}
        >
          <label>Ziel<input autoFocus value={title} placeholder="z. B. Analysis-Klausur mit 2,0" onChange={(e) => setTitle(e.target.value)} /></label>
          <label>Warum ist dir das wichtig?<input value={why} onChange={(e) => setWhy(e.target.value)} /></label>
          <div className="modal-grid">
            <label>
              Bereich
              <select value={area} onChange={(e) => setArea(e.target.value as GoalArea)}>
                {AREAS.map((a) => <option key={a.area}>{a.area}</option>)}
              </select>
            </label>
            <label>Bis wann<input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
          </div>
          <ImageInput value={image} onChange={setImage} label="Inspirationsbild" />
        </Sheet>
      )}
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
