import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { Card, ID } from '../types';
import { formatDate, relativeLabel, today } from '../lib/dates';
import { isDue, review, START_EASE, type Rating } from '../lib/srs';
import { CourseBadge, CourseSelect, Empty, PageHeader } from '../components/ui';
import { AddButton, Sheet } from '../components/sheet';

const RATINGS: { rating: Rating; label: string; key: string; color: string }[] = [
  { rating: 'nochmal', label: 'Nochmal', key: '1', color: '#FF3B30' },
  { rating: 'schwer', label: 'Schwer', key: '2', color: '#FF9500' },
  { rating: 'gut', label: 'Gut', key: '3', color: '#34C759' },
  { rating: 'leicht', label: 'Leicht', key: '4', color: '#007AFF' },
];

/** Neu = noch nie gelernt, Sitzt = Abstand von 3 Wochen oder mehr, sonst „lerne ich“ */
export const cardStage = (c: Card): 'neu' | 'lernen' | 'sitzt' => (c.reps === 0 && c.lapses === 0 ? 'neu' : c.interval >= 21 ? 'sitzt' : 'lernen');

const intervalLabel = (days: number) => (days <= 0 ? 'heute' : days === 1 ? '1 Tag' : days < 30 ? `${days} Tage` : `${Math.round(days / 30)} Mon.`);

function Session({ queue, onDone }: { queue: Card[]; onDone: () => void }) {
  const { data, update } = useStore();
  const [ids] = useState(() => queue.map((c) => c.id));
  const [index, setIndex] = useState(0);
  const [again, setAgain] = useState<ID[]>([]);
  const [shown, setShown] = useState(false);
  const t = today();

  const order = [...ids, ...again];
  const card = data.cards.find((c) => c.id === order[index]);

  const rate = (rating: Rating) => {
    if (!card) return;
    update('cards', card.id, review(card, rating, t));
    // Vergessene Karten kommen in dieser Sitzung noch einmal dran
    if (rating === 'nochmal') setAgain((a) => [...a, card.id]);
    setShown(false);
    setIndex((i) => i + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      if (!shown && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setShown(true);
      } else if (shown) {
        const r = RATINGS.find((x) => x.key === e.key);
        if (r) rate(r.rating);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!card) {
    return (
      <div className="study-done">
        <span className="study-done-icon" aria-hidden>🎉</span>
        <h2>Geschafft!</h2>
        <p className="muted">Du hast {ids.length} {ids.length === 1 ? 'Karte' : 'Karten'} wiederholt{again.length ? `, ${again.length}× nochmal` : ''}.</p>
        <button className="primary" onClick={onDone}>Fertig</button>
      </div>
    );
  }

  return (
    <div className="study">
      <div className="study-top">
        <button type="button" className="link" onClick={onDone}>‹ Beenden</button>
        <span className="muted small">{index + 1} von {order.length}</span>
      </div>
      <div className="study-progress" aria-hidden><span style={{ width: `${(index / order.length) * 100}%` }} /></div>
      <button type="button" className={`study-card ${shown ? 'flipped' : ''}`} onClick={() => setShown(true)} aria-label={shown ? 'Antwort' : 'Antwort zeigen'}>
        <span className="study-face study-front">
          <CourseBadge id={card.courseId} />
          <span className="study-text">{card.front}</span>
          <span className="muted small">Tippen oder Leertaste zum Umdrehen</span>
        </span>
        <span className="study-face study-back">
          <span className="muted small">{card.front}</span>
          <span className="study-text">{card.back}</span>
        </span>
      </button>
      {shown ? (
        <div className="study-ratings">
          {RATINGS.map((r) => (
            <button key={r.rating} type="button" style={{ ['--r' as string]: r.color }} onClick={() => rate(r.rating)}>
              <strong>{r.label}</strong>
              <small>{intervalLabel(review(card, r.rating, t).interval)}</small>
              <kbd>{r.key}</kbd>
            </button>
          ))}
        </div>
      ) : (
        <button type="button" className="primary study-show" onClick={() => setShown(true)}>Antwort zeigen</button>
      )}
    </div>
  );
}

function NewCardSheet({ courseId, onClose }: { courseId: ID | null; onClose: () => void }) {
  const { add } = useStore();
  const [course, setCourse] = useState<ID | null>(courseId);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [count, setCount] = useState(0);
  return (
    <Sheet
      title="Neue Karte"
      onClose={onClose}
      submitDisabled={!front.trim() || !back.trim()}
      onSubmit={() => {
        add('cards', { courseId: course, front: front.trim(), back: back.trim(), interval: 0, ease: START_EASE, reps: 0, lapses: 0, due: today() });
        setFront('');
        setBack('');
        setCount((c) => c + 1);
      }}
    >
      <label>Kurs<CourseSelect value={course} onChange={setCourse} /></label>
      <label>Vorderseite<textarea autoFocus rows={3} placeholder="Frage oder Begriff" value={front} onChange={(e) => setFront(e.target.value)} /></label>
      <label>Rückseite<textarea rows={3} placeholder="Antwort oder Erklärung" value={back} onChange={(e) => setBack(e.target.value)} /></label>
      <p className="muted small">{count > 0 ? `✓ ${count} ${count === 1 ? 'Karte' : 'Karten'} angelegt – das Fenster bleibt für die nächste offen.` : 'Tipp: In Notizen werden Zeilen wie „Begriff: Erklärung“ mit 🧠 automatisch zu Karten.'}</p>
    </Sheet>
  );
}

export function Flashcards({ courseId }: { courseId: ID | null }) {
  const { data, remove } = useStore();
  const [deck, setDeck] = useState<ID | 'alle' | 'ohne'>(courseId ?? 'alle');
  const [session, setSession] = useState<Card[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const t = today();
  useEffect(() => setDeck(courseId ?? 'alle'), [courseId]);

  const inDeck = (c: Card) => (deck === 'alle' ? true : deck === 'ohne' ? c.courseId === null : c.courseId === deck);
  const allDue = data.cards.filter((c) => isDue(c, t));
  const start = (cards: Card[]) => setSession([...cards].sort(() => Math.random() - 0.5));

  if (session) return <Session queue={session} onDone={() => setSession(null)} />;

  const decks = [
    ...data.courses.map((c) => ({ id: c.id as ID | 'ohne', name: c.name, color: c.color })),
    ...(data.cards.some((c) => c.courseId === null) ? [{ id: 'ohne' as const, name: 'Ohne Kurs', color: '#8E8E93' }] : []),
  ];
  const q = query.trim().toLowerCase();
  const list = data.cards
    .filter((c) => inDeck(c) && (!q || `${c.front} ${c.back}`.toLowerCase().includes(q)))
    .sort((a, b) => a.due.localeCompare(b.due));
  const deckName = deck === 'alle' ? 'Alle Karten' : decks.find((d) => d.id === deck)?.name ?? 'Karten';

  return (
    <>
      <PageHeader
        title="Lernkarten"
        subtitle={allDue.length ? `${allDue.length} ${allDue.length === 1 ? 'Karte' : 'Karten'} heute fällig` : 'Alles wiederholt 🎉'}
        actions={
          <>
            <button className="primary" disabled={allDue.length === 0} onClick={() => start(allDue)}>Alle lernen</button>
            <AddButton label="Neue Karte" onClick={() => setAdding(true)} />
          </>
        }
      />
      {decks.length === 0 && data.cards.length === 0 ? (
        <Empty>Noch keine Karten. Tippe auf + oder wandle in den Notizen Text mit 🧠 in Karten um.</Empty>
      ) : (
        <div className="decks">
          {decks.map((d) => {
            const cards = data.cards.filter((c) => (d.id === 'ohne' ? c.courseId === null : c.courseId === d.id));
            const due = cards.filter((c) => isDue(c, t));
            const stage = (s: string) => cards.filter((c) => cardStage(c) === s).length;
            return (
              <article key={d.id} className={`deck ${deck === d.id ? 'on' : ''}`} style={{ ['--c' as string]: d.color }}>
                <button type="button" className="deck-main" onClick={() => setDeck(deck === d.id ? 'alle' : d.id)} aria-pressed={deck === d.id}>
                  <strong>{d.name}</strong>
                  <span className="deck-due"><b>{due.length}</b> fällig</span>
                  <span className="deck-stages">
                    <span style={{ color: '#007AFF' }}>{stage('neu')} neu</span>
                    <span style={{ color: '#FF9500' }}>{stage('lernen')} lerne ich</span>
                    <span style={{ color: '#34C759' }}>{stage('sitzt')} sitzen</span>
                  </span>
                  <span className="deck-bar" aria-hidden>
                    <span style={{ width: `${cards.length ? (stage('sitzt') / cards.length) * 100 : 0}%` }} />
                  </span>
                </button>
                <button type="button" className="deck-learn" disabled={due.length === 0} onClick={() => start(due)}>Lernen</button>
              </article>
            );
          })}
        </div>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>{deckName} <span className="muted">· {list.length}</span></h2>
          {deck !== 'alle' && <button type="button" className="link" onClick={() => setDeck('alle')}>Alle zeigen</button>}
        </div>
        <input type="search" placeholder="🔍 Karten durchsuchen" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Karten durchsuchen" />
        {list.length === 0 ? <Empty>Keine Karten gefunden.</Empty> : (
          <ul className="ios-list">
            {list.map((c) => (
              <li key={c.id}>
                <span className={`stage-dot ${cardStage(c)}`} title={cardStage(c) === 'neu' ? 'Neu' : cardStage(c) === 'sitzt' ? 'Sitzt' : 'Lerne ich'} aria-hidden />
                <div className="grow">
                  <div className="task-title">{c.front}</div>
                  <div className="muted small clamp">{c.back}</div>
                  <div className="meta">
                    {deck === 'alle' && <CourseBadge id={c.courseId} />}
                    <span title={formatDate(c.due)} className={isDue(c, t) ? 'accent-text' : ''}>{isDue(c, t) ? 'fällig' : `wieder ${relativeLabel(c.due, t)}`}</span>
                  </div>
                </div>
                <button className="icon" onClick={() => confirm('Karte löschen?') && remove('cards', c.id)} aria-label="Karte löschen" title="Löschen">×</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {adding && <NewCardSheet courseId={deck !== 'alle' && deck !== 'ohne' ? deck : null} onClose={() => setAdding(false)} />}
    </>
  );
}
