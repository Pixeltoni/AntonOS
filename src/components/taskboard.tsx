import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArrowLeft, ArrowRight, CalendarDays, Check, Hourglass, RotateCcw, Star, StickyNote, Timer, Trash2, X } from 'lucide-react';
import { useStore } from '../store';
import type { ID, Task, TaskStatus } from '../types';
import { relativeLabel, today } from '../lib/dates';
import { dueTone, formatMinutes, isStale, listTasks, planCandidates, sortTasks, tidyPatch } from '../lib/tasks';
import { setWhen } from '../lib/things';
import { noteTitle } from '../lib/notes';
import { useTaskActions, useTaskUI } from './taskui';
import { Sheet } from './sheet';

const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

/** Farbe und Name der Liste einer Aufgabe */
function useListOf() {
  const { data } = useStore();
  return (task: Task) => {
    const course = data.courses.find((c) => c.id === task.courseId);
    const list = data.taskLists.find((l) => l.id === task.listId);
    return { color: course?.color ?? list?.color ?? '#8E8E93', name: course ? course.code || course.name : list?.name ?? 'Ohne Liste' };
  };
}

/* ---------- Board ---------- */

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'offen', label: 'Offen' },
  { status: 'in Arbeit', label: 'In Arbeit' },
  { status: 'erledigt', label: 'Erledigt' },
];

/**
 * Board-Ansicht: Spalten Offen, In Arbeit, Erledigt (heute).
 * Am Computer per Ziehen, sonst mit den Pfeilen auf der Karte weiterschieben.
 */
export function TaskBoard({ tasks, done }: { tasks: Task[]; done: Task[] }) {
  const { update } = useStore();
  const ui = useTaskUI();
  const actions = useTaskActions();
  const listOf = useListOf();
  const t = today();
  const [over, setOver] = useState<TaskStatus | null>(null);
  const items = (status: TaskStatus) => (status === 'erledigt' ? done : sortTasks(tasks.filter((x) => x.status === status)));
  const move = (id: ID, status: TaskStatus) => {
    const task = [...tasks, ...done].find((x) => x.id === id);
    if (!task || task.status === status) return;
    if (status === 'erledigt') actions.complete([id]);
    else update('tasks', id, { status });
  };

  return (
    <div className="task-board">
      {COLUMNS.map((col, ci) => {
        const list = items(col.status);
        return (
          <section
            key={col.status}
            className={`board-col ${over === col.status ? 'over' : ''}`}
            aria-label={col.label}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(col.status);
            }}
            onDragLeave={() => setOver((o) => (o === col.status ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData('text/plain');
              if (id) move(id, col.status);
            }}
          >
            <h3>{col.label}<span className="muted">{list.length}</span></h3>
            {list.length === 0 && <p className="board-empty muted small">{col.status === 'erledigt' ? 'Heute noch nichts erledigt.' : 'Leer'}</p>}
            {list.map((task) => {
              const l = listOf(task);
              const prev = COLUMNS[ci - 1];
              const next = COLUMNS[ci + 1];
              return (
                <article
                  key={task.id}
                  className={`board-card ${col.status === 'erledigt' ? 'done' : ''}`}
                  style={{ ['--c' as string]: l.color }}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', task.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                >
                  <button type="button" className="board-main" onClick={() => ui.open(task.id)}>
                    <span className="board-title">{task.priority === 'hoch' && <span className="rem-prio hoch">Hoch</span>}{task.title}</span>
                    <span className="rem-meta">
                      {task.due && col.status !== 'erledigt' && (
                        <span className={`rem-due tone-${dueTone(task.due, t)}`}><CalendarDays size={11} aria-hidden />{cap(relativeLabel(task.due, t))}</span>
                      )}
                      <span className="rem-listdot"><i style={{ background: l.color }} aria-hidden />{l.name}</span>
                      {task.estimate && <span><Timer size={11} aria-hidden />{formatMinutes(task.estimate)}</span>}
                    </span>
                  </button>
                  <span className="board-moves">
                    {prev && (
                      <button type="button" className="icon" onClick={() => (col.status === 'erledigt' ? actions.reopen([task.id]) : move(task.id, prev.status))} aria-label={`Zurück nach „${prev.label}“`} title={`Nach „${prev.label}“`}>
                        {col.status === 'erledigt' ? <RotateCcw size={14} /> : <ArrowLeft size={14} />}
                      </button>
                    )}
                    {next && (
                      <button type="button" className="icon" onClick={() => move(task.id, next.status)} aria-label={`Weiter nach „${next.label}“`} title={`Nach „${next.label}“`}>
                        {next.status === 'erledigt' ? <Check size={14} /> : <ArrowRight size={14} />}
                      </button>
                    )}
                  </span>
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

/* ---------- Tag planen ---------- */

type Choice = 'heute' | 'spaeter' | 'irgendwann';

/**
 * Morgens durch die Aufgaben gehen, die noch nicht für heute dran sind:
 * nach rechts (oder „Heute“) einplanen, nach links „Später“, nach unten „Irgendwann“.
 */
export function PlanDay({ onClose }: { onClose: () => void }) {
  const { data, update } = useStore();
  const listOf = useListOf();
  const t = today();
  const [queue] = useState(() => planCandidates(listTasks(data.tasks), t).map((x) => x.id));
  const [index, setIndex] = useState(0);
  const [stats, setStats] = useState<Record<Choice, number>>({ heute: 0, spaeter: 0, irgendwann: 0 });
  const [leaving, setLeaving] = useState<Choice | null>(null);
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x0: number; id: number } | null>(null);
  const task = data.tasks.find((x) => x.id === queue[index]);
  const finished = index >= queue.length;

  const choose = (choice: Choice) => {
    if (!task || leaving) return;
    setLeaving(choice);
    setDx(0);
    window.setTimeout(() => {
      if (choice === 'heute') update('tasks', task.id, setWhen('heute', t));
      if (choice === 'irgendwann') update('tasks', task.id, setWhen('irgendwann', t));
      setStats((s) => ({ ...s, [choice]: s[choice] + 1 }));
      setIndex((i) => i + 1);
      setLeaving(null);
    }, 240);
  };
  const latest = useRef(choose);
  latest.current = choose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') latest.current('heute');
      else if (e.key === 'ArrowLeft') latest.current('spaeter');
      else if (e.key === 'ArrowDown') latest.current('irgendwann');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('has-planday');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('has-planday');
    };
  }, [onClose]);

  const onDown = (e: ReactPointerEvent) => {
    drag.current = { x0: e.clientX, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (drag.current?.id === e.pointerId) setDx(e.clientX - drag.current.x0);
  };
  const onUp = (e: ReactPointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    if (dx > 90) choose('heute');
    else if (dx < -90) choose('spaeter');
    else setDx(0);
  };

  const info = (x: Task): string => {
    if (x.someday) return 'Liegt in „Irgendwann“';
    if (x.due) return `Frist ${relativeLabel(x.due, t)}${x.dueTime ? `, ${x.dueTime}` : ''}`;
    if (x.plannedFor) return `Eingeplant ${relativeLabel(x.plannedFor, t)}`;
    return 'Noch ohne Datum';
  };
  const l = task ? listOf(task) : null;
  const note = task?.noteId ? data.notes.find((n) => n.id === task.noteId && !n.deletedAt) : undefined;
  const subs = task?.subtasks ?? [];

  return createPortal(
    <div className="planday" role="dialog" aria-modal="true" aria-label="Tag planen">
      <header className="planday-head">
        <div>
          <h2>Tag planen</h2>
          <p className="muted small">{finished ? 'Alles durchgesehen.' : `${index + 1} von ${queue.length} · bald Fälliges und Aufgaben ohne Datum`}</p>
        </div>
        <button type="button" className="planday-close" onClick={onClose}>Fertig</button>
      </header>
      <div className="planday-progress" aria-hidden><i style={{ width: `${queue.length ? (Math.min(index, queue.length) / queue.length) * 100 : 100}%` }} /></div>
      <div className="planday-stage">
        {finished || !task || !l ? (
          <div className="planday-card planday-end">
            <span className="planday-sun" aria-hidden>☀️</span>
            <strong>{queue.length ? 'Dein Tag steht' : 'Nichts zu planen'}</strong>
            <span className="muted">
              {queue.length
                ? `${stats.heute} neu für heute, ${stats.spaeter} auf später, ${stats.irgendwann} nach „Irgendwann“.`
                : 'Alle offenen Aufgaben sind schon eingeplant.'}
            </span>
            <button type="button" className="primary" onClick={onClose}>Zu „Heute“</button>
          </div>
        ) : (
          <div
            key={task.id}
            className={`planday-card ${leaving ? `out-${leaving}` : ''}`}
            style={{ ['--c' as string]: l.color, ...(dx ? { transform: `translateX(${dx}px) rotate(${dx / 24}deg)`, transition: 'none' } : {}) }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => { drag.current = null; setDx(0); }}
          >
            <span className="planday-list"><i aria-hidden />{l.name}</span>
            <strong className="planday-title">{task.title}</strong>
            <span className={`rem-due ${task.due ? `tone-${dueTone(task.due, t)}` : ''}`}><CalendarDays size={13} aria-hidden />{info(task)}</span>
            <span className="planday-extra muted small">
              {subs.length > 0 && <span>{subs.filter((s) => s.done).length}/{subs.length} Unteraufgaben</span>}
              {task.estimate && <span><Timer size={12} aria-hidden /> {formatMinutes(task.estimate)}</span>}
              {note && <span><StickyNote size={12} aria-hidden /> {noteTitle(note)}</span>}
            </span>
            {dx > 40 && <span className="planday-stamp is-today">Heute</span>}
            {dx < -40 && <span className="planday-stamp is-later">Später</span>}
          </div>
        )}
      </div>
      {!finished && task && (
        <div className="planday-choices">
          <button type="button" onClick={() => choose('spaeter')}><ArrowLeft size={18} aria-hidden />Später</button>
          <button type="button" onClick={() => choose('irgendwann')}><Archive size={18} aria-hidden />Irgendwann</button>
          <button type="button" className="is-today" onClick={() => choose('heute')}><Star size={18} aria-hidden />Heute</button>
        </div>
      )}
    </div>,
    document.body,
  );
}

/* ---------- Aufräumen ---------- */

const HIDE_KEY = 'antonos:aufraeumen-aus';

/** Hinweis auf Aufgaben, die man ewig vor sich herschiebt – mit „Aufräumen“ */
export function StaleBox() {
  const { data } = useStore();
  const t = today();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === t;
    } catch {
      return false;
    }
  });
  const stale = listTasks(data.tasks).filter((x) => isStale(x, t));
  if (!stale.length || (hidden && !open)) return null;
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDE_KEY, t);
    } catch {
      // egal
    }
  };
  return (
    <>
      <div className="stale-box" role="status">
        <Hourglass size={18} aria-hidden />
        <span className="grow">
          <strong>{stale.length === 1 ? '1 Aufgabe' : `${stale.length} Aufgaben`}</strong> schiebst du schon länger vor dir her.
        </span>
        <button type="button" className="primary" onClick={() => setOpen(true)}>Aufräumen</button>
        <button type="button" className="icon" onClick={hide} aria-label="Für heute ausblenden" title="Für heute ausblenden"><X size={15} /></button>
      </div>
      {open && <TidySheet onClose={() => setOpen(false)} />}
    </>
  );
}

function TidySheet({ onClose }: { onClose: () => void }) {
  const { data, update } = useStore();
  const actions = useTaskActions();
  const listOf = useListOf();
  const t = today();
  const stale = listTasks(data.tasks).filter((x) => isStale(x, t));
  return (
    <Sheet title="Aufräumen" onClose={onClose}>
      <p className="muted small tidy-lead">Ehrlich bleiben: heute machen, ohne Datum parken oder loslassen.</p>
      {stale.length === 0 ? (
        <p className="tidy-done"><Check size={16} aria-hidden /> Alles aufgeräumt.</p>
      ) : (
        <ul className="tidy-list">
          {stale.map((x) => {
            const l = listOf(x);
            const why = (x.postponed ?? 0) >= 3 ? `${x.postponed}× verschoben` : x.due ? `seit ${relativeLabel(x.due, t).replace('vor ', '')} überfällig` : '';
            return (
              <li key={x.id}>
                <span className="grow">
                  <strong>{x.title}</strong>
                  <span className="muted small"><i className="tidy-dot" style={{ background: l.color }} aria-hidden />{l.name}{why && ` · ${why}`}</span>
                </span>
                <span className="tidy-actions">
                  <button type="button" className="primary" onClick={() => update('tasks', x.id, tidyPatch(x, 'heute', t))}>Heute</button>
                  <button type="button" onClick={() => update('tasks', x.id, tidyPatch(x, 'irgendwann', t))}>Parken</button>
                  <button type="button" className="icon danger" onClick={() => actions.remove([x.id])} aria-label={`„${x.title}“ löschen`}><Trash2 size={15} /></button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
