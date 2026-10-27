import { useState } from 'react';
import { useStore } from '../store';
import type { Card, ID } from '../types';
import { formatDate, relativeLabel, today } from '../lib/dates';
import { isDue, review, START_EASE, type Rating } from '../lib/srs';
import { CourseBadge, CourseSelect, Empty, PageHeader, Panel } from '../components/ui';

const RATINGS: { rating: Rating; label: string; key: string }[] = [
  { rating: 'nochmal', label: 'Nochmal', key: '1' },
  { rating: 'schwer', label: 'Schwer', key: '2' },
  { rating: 'gut', label: 'Gut', key: '3' },
  { rating: 'leicht', label: 'Leicht', key: '4' },
];

function Review({ queue, onDone }: { queue: Card[]; onDone: () => void }) {
  const { data, update } = useStore();
  const [ids] = useState(() => queue.map((c) => c.id));
  const [index, setIndex] = useState(0);
  const [again, setAgain] = useState<ID[]>([]);
  const [shown, setShown] = useState(false);

  const order = [...ids, ...again];
  const card = data.cards.find((c) => c.id === order[index]);

  if (!card) {
    return (
      <Panel title="Fertig! 🎉">
        <p>Du hast {ids.length} Karten wiederholt.</p>
        <button className="primary" onClick={onDone}>Zurück</button>
      </Panel>
    );
  }

  const rate = (rating: Rating) => {
    update('cards', card.id, review(card, rating, today()));
    // Vergessene Karten kommen in dieser Sitzung noch einmal dran
    if (rating === 'nochmal') setAgain((a) => [...a, card.id]);
    setShown(false);
    setIndex((i) => i + 1);
  };

  return (
    <Panel title={`Karte ${index + 1} von ${order.length}`} actions={<button onClick={onDone}>Beenden</button>}>
      <div
        className="flashcard"
        tabIndex={0}
        onKeyDown={(e) => {
          if (!shown && (e.key === ' ' || e.key === 'Enter')) {
            e.preventDefault();
            setShown(true);
          } else if (shown) {
            const r = RATINGS.find((x) => x.key === e.key);
            if (r) rate(r.rating);
          }
        }}
        autoFocus
      >
        <CourseBadge id={card.courseId} />
        <div className="front">{card.front}</div>
        {shown && <div className="back">{card.back}</div>}
      </div>
      {!shown ? (
        <button className="primary wide" onClick={() => setShown(true)}>Antwort zeigen (Leertaste)</button>
      ) : (
        <div className="ratings">
          {RATINGS.map((r) => (
            <button key={r.rating} className={`rate-${r.rating}`} onClick={() => rate(r.rating)}>
              {r.label} <kbd>{r.key}</kbd>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function Flashcards({ courseId }: { courseId: ID | null }) {
  const { data, add, remove } = useStore();
  const [course, setCourse] = useState<ID | null>(courseId);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [session, setSession] = useState<Card[] | null>(null);
  const t = today();

  const cards = data.cards.filter((c) => course === null || c.courseId === course);
  const due = cards.filter((c) => isDue(c, t));

  if (session) return <><PageHeader title="Lernen" /><Review queue={session} onDone={() => setSession(null)} /></>;

  return (
    <>
      <PageHeader
        title="Lernkarten"
        subtitle="Wiederholung nach dem Prinzip der verteilten Wiederholung (Spaced Repetition)"
        actions={
          <button className="primary" disabled={due.length === 0} onClick={() => setSession([...due].sort(() => Math.random() - 0.5))}>
            {due.length} Karten lernen
          </button>
        }
      />
      <Panel title="Neue Karte">
        <form
          className="col"
          onSubmit={(e) => {
            e.preventDefault();
            if (!front.trim() || !back.trim()) return;
            add('cards', { courseId: course, front: front.trim(), back: back.trim(), interval: 0, ease: START_EASE, reps: 0, lapses: 0, due: t });
            setFront('');
            setBack('');
          }}
        >
          <div className="grid-2 tight">
            <textarea placeholder="Vorderseite (Frage)" value={front} onChange={(e) => setFront(e.target.value)} rows={3} />
            <textarea placeholder="Rückseite (Antwort)" value={back} onChange={(e) => setBack(e.target.value)} rows={3} />
          </div>
          <div className="row between">
            <CourseSelect value={course} onChange={setCourse} noneLabel="Alle Kurse / ohne Kurs" />
            <button className="primary" type="submit">Karte hinzufügen</button>
          </div>
        </form>
      </Panel>
      <Panel title={`${cards.length} Karten`}>
        {cards.length === 0 ? <Empty>Noch keine Karten.</Empty> : (
          <ul className="list">
            {[...cards].sort((a, b) => a.due.localeCompare(b.due)).map((c) => (
              <li key={c.id}>
                <div className="grow">
                  <div className="task-title">{c.front}</div>
                  <div className="meta">
                    <CourseBadge id={c.courseId} />
                    <span title={formatDate(c.due)}>{isDue(c, t) ? 'fällig' : `nächste Wiederholung ${relativeLabel(c.due, t)}`}</span>
                    <span>Intervall {c.interval} T.</span>
                  </div>
                </div>
                <button className="icon" onClick={() => remove('cards', c.id)} aria-label="Löschen" title="Löschen">×</button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
