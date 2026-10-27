import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import type { ID, Priority, Task, TaskKind, TaskStatus } from '../types';
import { formatDate, relativeLabel, today } from '../lib/dates';
import { CourseBadge, CourseSelect, Empty } from './ui';

export const KINDS: TaskKind[] = ['Aufgabe', 'Lektüre', 'Projekt', 'Bewerbung'];
export const STATUSES: TaskStatus[] = ['offen', 'in Arbeit', 'erledigt'];
const PRIORITIES: Priority[] = ['niedrig', 'mittel', 'hoch'];
const PRIO_RANK: Record<Priority, number> = { hoch: 0, mittel: 1, niedrig: 2 };

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if ((a.status === 'erledigt') !== (b.status === 'erledigt')) return a.status === 'erledigt' ? 1 : -1;
    if (a.due !== b.due) return a.due === null ? 1 : b.due === null ? -1 : a.due.localeCompare(b.due);
    return PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
  });
}

export function TaskForm({ courseId = null, projectId = null, compact = false }: { courseId?: ID | null; projectId?: ID | null; compact?: boolean }) {
  const { add } = useStore();
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState<ID | null>(courseId);
  const [due, setDue] = useState('');
  const [kind, setKind] = useState<TaskKind>('Aufgabe');
  const [priority, setPriority] = useState<Priority>('mittel');
  const [note, setNote] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    add('tasks', { title: title.trim(), courseId: course, projectId, due: due || null, kind, priority, status: 'offen', note: note.trim() });
    setTitle('');
    setDue('');
    setNote('');
  };

  return (
    <form className="inline-form" onSubmit={submit}>
      <input
        className="grow"
        placeholder={compact ? 'Schnell eine Aufgabe notieren …' : 'Neue Aufgabe'}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Titel der Aufgabe"
      />
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Fällig am" />
      {!compact && (
        <>
          {courseId === null && <CourseSelect value={course} onChange={setCourse} />}
          <select value={kind} onChange={(e) => setKind(e.target.value as TaskKind)} aria-label="Art">
            {KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} aria-label="Priorität">
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
          <input className="grow" placeholder="Notiz (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Notiz" />
        </>
      )}
      <button className="primary" type="submit">Hinzufügen</button>
    </form>
  );
}

/** Fenster zum Bearbeiten einer Aufgabe – inklusive Notiz. */
export function TaskModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const { data, update, remove } = useStore();
  const [draft, setDraft] = useState<Task>({ ...task, note: task.note ?? '' });
  const [error, setError] = useState('');
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setDraft((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) {
      setError('Bitte gib einen Titel ein.');
      return;
    }
    const { id, ...rest } = draft;
    update('tasks', id, { ...rest, title: draft.title.trim(), note: draft.note?.trim() ?? '' });
    onClose();
  };

  // Als Portal direkt in <body>, damit Glas-Effekte der Kästen das Fenster nicht einsperren
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-label="Aufgabe bearbeiten" onSubmit={save}>
        <div className="row between">
          <h2>Aufgabe bearbeiten</h2>
          <button type="button" className="icon" onClick={onClose} aria-label="Schließen">×</button>
        </div>
        <label>
          Titel
          <input autoFocus value={draft.title} onChange={(e) => set('title', e.target.value)} required />
        </label>
        <label>
          Notiz
          <textarea rows={4} value={draft.note} onChange={(e) => set('note', e.target.value)} placeholder="Details, Links, Teilschritte …" />
        </label>
        <div className="modal-grid">
          <label>
            Fällig am
            <input type="date" value={draft.due ?? ''} onChange={(e) => set('due', e.target.value || null)} />
          </label>
          <label>
            Status
            <select value={draft.status} onChange={(e) => set('status', e.target.value as TaskStatus)}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>
            Art
            <select value={draft.kind} onChange={(e) => set('kind', e.target.value as TaskKind)}>
              {KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
          <label>
            Priorität
            <select value={draft.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label>
            Kurs
            <CourseSelect value={draft.courseId} onChange={(courseId) => set('courseId', courseId)} />
          </label>
          <label>
            Projekt
            <select value={draft.projectId ?? ''} onChange={(e) => set('projectId', e.target.value || null)}>
              <option value="">Kein Projekt</option>
              {data.projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
        </div>
        {error && <p className="danger small" role="alert">{error}</p>}
        <div className="row between">
          <button type="button" className="danger" onClick={() => { if (confirm(`„${task.title}“ löschen?`)) { remove('tasks', task.id); onClose(); } }}>
            Löschen
          </button>
          <div className="row">
            <button type="button" onClick={onClose}>Abbrechen</button>
            <button type="submit" className="primary">Speichern</button>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/**
 * Aufgabenliste. Abhaken braucht eine Bestätigung, damit Aufgaben nicht aus
 * Versehen verschwinden; ein Klick auf den Titel öffnet die Bearbeitung.
 */
export function TaskList({ tasks, showCourse = true, compact = false }: { tasks: Task[]; showCourse?: boolean; compact?: boolean }) {
  const { update, remove } = useStore();
  const [confirming, setConfirming] = useState<ID | null>(null);
  const [editing, setEditing] = useState<ID | null>(null);
  const t = today();
  const editTask = tasks.find((x) => x.id === editing);
  if (tasks.length === 0) return <Empty>{compact ? 'Alles erledigt 🎉' : 'Keine Aufgaben – genieß die freie Zeit.'}</Empty>;

  const complete = (id: ID) => {
    update('tasks', id, { status: 'erledigt' });
    setConfirming(null);
  };

  return (
    <>
      <ul className={`list ${compact ? 'dense' : ''}`}>
        {sortTasks(tasks).map((task) => {
          const done = task.status === 'erledigt';
          const overdue = !done && task.due !== null && task.due < t;
          const asking = confirming === task.id;
          return (
            <li key={task.id} className={`task ${done ? 'done' : ''} ${asking ? 'asking' : ''}`}>
              <input
                type="checkbox"
                checked={done || asking}
                onChange={() => (done ? update('tasks', task.id, { status: 'offen' }) : setConfirming(asking ? null : task.id))}
                aria-label={done ? `${task.title} wieder öffnen` : `${task.title} als erledigt markieren`}
              />
              <div className="grow">
                <button type="button" className="task-title task-open" onClick={() => setEditing(task.id)} title="Bearbeiten">
                  {task.title}
                </button>
                {!compact && (
                  <div className="meta">
                    {showCourse && <CourseBadge id={task.courseId} />}
                    <span className="tag">{task.kind}</span>
                    <span className={`tag prio-${task.priority}`}>{task.priority}</span>
                    {task.due && (
                      <span className={overdue ? 'danger' : ''} title={formatDate(task.due)}>
                        {overdue ? 'überfällig · ' : ''}{relativeLabel(task.due, t)}
                      </span>
                    )}
                  </div>
                )}
                {task.note && !compact && <p className="task-note" title={task.note}>📝 {task.note}</p>}
                {asking && (
                  <div className="confirm-bar" role="alert">
                    <span>Als erledigt markieren?</span>
                    <button type="button" className="primary" autoFocus onClick={() => complete(task.id)}>✓ Erledigt</button>
                    <button type="button" onClick={() => setConfirming(null)}>Abbrechen</button>
                  </div>
                )}
              </div>
              {compact ? (
                task.due && <span className={`small ${overdue ? 'danger' : 'muted'}`}>{relativeLabel(task.due, t)}</span>
              ) : (
                <>
                  <select
                    value={task.status}
                    onChange={(e) => {
                      const status = e.target.value as TaskStatus;
                      if (status === 'erledigt') setConfirming(task.id);
                      else update('tasks', task.id, { status });
                    }}
                    aria-label="Status"
                  >
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                  <button className="icon" onClick={() => setEditing(task.id)} aria-label="Bearbeiten" title="Bearbeiten">✎</button>
                  <button
                    className="icon"
                    onClick={() => confirm(`„${task.title}“ löschen?`) && remove('tasks', task.id)}
                    aria-label="Löschen"
                    title="Löschen"
                  >
                    ×
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {editTask && <TaskModal task={editTask} onClose={() => setEditing(null)} />}
    </>
  );
}
