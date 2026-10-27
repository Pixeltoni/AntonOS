import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { newId, useStore } from '../store';
import type { ID, Priority, Subtask, Task, TaskKind, TaskStatus } from '../types';
import { formatDate, relativeLabel, today } from '../lib/dates';
import { parseQuickAdd } from '../lib/quickadd';
import { useToast } from './toast';
import { CourseBadge, CourseSelect, Empty } from './ui';

export const KINDS: TaskKind[] = ['Aufgabe', 'Lektüre', 'Projekt', 'Bewerbung'];
export const STATUSES: TaskStatus[] = ['offen', 'in Arbeit', 'erledigt'];
const PRIORITIES: Priority[] = ['niedrig', 'mittel', 'hoch'];
const PRIO_RANK: Record<Priority, number> = { hoch: 0, mittel: 1, niedrig: 2 };
/** Ausrufezeichen vor dem Titel wie in Apple Erinnerungen */
const PRIO_MARKS: Record<Priority, string> = { niedrig: '', mittel: '!! ', hoch: '!!! ' };

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if ((a.status === 'erledigt') !== (b.status === 'erledigt')) return a.status === 'erledigt' ? 1 : -1;
    if (a.due !== b.due) return a.due === null ? 1 : b.due === null ? -1 : a.due.localeCompare(b.due);
    if ((a.dueTime ?? '') !== (b.dueTime ?? '')) return (a.dueTime || '99').localeCompare(b.dueTime || '99');
    return PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
  });
}

/** Erledigt markieren – mit „Widerrufen“ statt Nachfrage. */
export function useCompleteTask() {
  const { update } = useStore();
  const toast = useToast();
  return (task: Task) => {
    const previous = task.status;
    update('tasks', task.id, { status: 'erledigt' });
    toast.show(`„${task.title}“ erledigt`, { label: 'Widerrufen', run: () => update('tasks', task.id, { status: previous }) });
  };
}

/**
 * Schnelleingabe in natürlicher Sprache: „Übungsblatt morgen 10 Uhr !!! #analysis“.
 * Erkanntes wird als Chips angezeigt, bevor die Aufgabe angelegt wird.
 */
export function TaskForm({
  courseId = null,
  projectId = null,
  defaults = {},
  compact = false,
}: {
  courseId?: ID | null;
  projectId?: ID | null;
  defaults?: Partial<Pick<Task, 'flagged' | 'due'>>;
  compact?: boolean;
}) {
  const { data, add } = useStore();
  const [text, setText] = useState('');
  const t = today();
  const parsed = parseQuickAdd(text, t, data.courses);
  const course = data.courses.find((c) => c.id === (parsed.courseId ?? courseId));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed.title) return;
    add('tasks', {
      title: parsed.title,
      courseId: parsed.courseId ?? courseId,
      projectId,
      due: parsed.due ?? defaults.due ?? null,
      dueTime: parsed.dueTime,
      kind: 'Aufgabe',
      priority: parsed.priority ?? 'mittel',
      status: 'offen',
      note: '',
      flagged: defaults.flagged ?? false,
      subtasks: [],
    });
    setText('');
  };

  const chips = [
    parsed.due && `${relativeLabel(parsed.due, t).replace(/^./, (c) => c.toUpperCase())}${parsed.dueTime ? `, ${parsed.dueTime}` : ''}`,
    parsed.priority && `Priorität ${parsed.priority}`,
    parsed.courseId && course?.name,
  ].filter(Boolean) as string[];

  return (
    <form className={`quick-add ${compact ? 'compact' : ''}`} onSubmit={submit}>
      <div className="quick-add-row">
        <button type="submit" className="qa-plus" aria-label="Aufgabe hinzufügen" disabled={!parsed.title}>+</button>
        <input
          className="grow"
          placeholder={compact ? 'Neue Aufgabe …' : 'Neue Aufgabe, z. B. „Übungsblatt morgen 10 Uhr !!! #analysis“'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Titel der Aufgabe"
        />
      </div>
      {chips.length > 0 && (
        <div className="qa-chips" aria-label="Erkannt">
          {chips.map((c) => <span key={c} className="qa-chip">{c}</span>)}
        </div>
      )}
    </form>
  );
}

/** Fenster zum Bearbeiten einer Aufgabe – mit Notiz, Uhrzeit, Markierung und Unteraufgaben. */
export function TaskModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const { data, update, remove } = useStore();
  const [draft, setDraft] = useState<Task>({ ...task, note: task.note ?? '', dueTime: task.dueTime ?? '', subtasks: task.subtasks ?? [] });
  const [newSub, setNewSub] = useState('');
  const [error, setError] = useState('');
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setDraft((x) => ({ ...x, [k]: v }));
  const subs = draft.subtasks ?? [];
  const setSubs = (next: Subtask[]) => set('subtasks', next);

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
    update('tasks', id, { ...rest, title: draft.title.trim(), note: draft.note?.trim() ?? '', dueTime: draft.due ? draft.dueTime : '' });
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
          <textarea rows={3} value={draft.note} onChange={(e) => set('note', e.target.value)} placeholder="Details, Links …" />
        </label>

        <div className="col">
          <span className="small muted">Unteraufgaben</span>
          {subs.map((s) => (
            <div key={s.id} className="row sub-row">
              <input
                type="checkbox"
                checked={s.done}
                onChange={() => setSubs(subs.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))}
                aria-label={`${s.title} erledigt`}
              />
              <input className="grow" value={s.title} onChange={(e) => setSubs(subs.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)))} aria-label="Unteraufgabe" />
              <button type="button" className="icon" onClick={() => setSubs(subs.filter((x) => x.id !== s.id))} aria-label="Unteraufgabe entfernen">×</button>
            </div>
          ))}
          <div className="row">
            <input
              className="grow"
              placeholder="Unteraufgabe hinzufügen …"
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (newSub.trim()) setSubs([...subs, { id: newId(), title: newSub.trim(), done: false }]);
                  setNewSub('');
                }
              }}
              aria-label="Neue Unteraufgabe"
            />
            <button
              type="button"
              onClick={() => {
                if (newSub.trim()) setSubs([...subs, { id: newId(), title: newSub.trim(), done: false }]);
                setNewSub('');
              }}
            >
              +
            </button>
          </div>
        </div>

        <div className="modal-grid">
          <label>
            Fällig am
            <input type="date" value={draft.due ?? ''} onChange={(e) => set('due', e.target.value || null)} />
          </label>
          <label>
            Uhrzeit
            <input type="time" value={draft.dueTime ?? ''} onChange={(e) => set('dueTime', e.target.value)} disabled={!draft.due} />
          </label>
          <label>
            Priorität
            <select value={draft.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label>
            Status
            <select value={draft.status} onChange={(e) => set('status', e.target.value as TaskStatus)}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
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
          <label>
            Art
            <select value={draft.kind} onChange={(e) => set('kind', e.target.value as TaskKind)}>
              {KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
          <label className="row">
            <input type="checkbox" checked={!!draft.flagged} onChange={(e) => set('flagged', e.target.checked)} />
            Markiert
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

function FlagIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 21V4h11l-2 4 2 4H5" />
    </svg>
  );
}

/**
 * Aufgabenliste im Stil von Apple Erinnerungen: runder Haken in Listenfarbe,
 * Erledigen mit „Widerrufen“, Klick auf den Titel öffnet die Bearbeitung.
 */
export function TaskList({ tasks, showCourse = true, compact = false }: { tasks: Task[]; showCourse?: boolean; compact?: boolean }) {
  const { data, update, remove } = useStore();
  const complete = useCompleteTask();
  const [editing, setEditing] = useState<ID | null>(null);
  const t = today();
  const editTask = data.tasks.find((x) => x.id === editing);
  if (tasks.length === 0) return <Empty>{compact ? 'Alles erledigt 🎉' : 'Keine Aufgaben – genieß die freie Zeit.'}</Empty>;

  return (
    <>
      <ul className={`rem-list ${compact ? 'compact' : ''}`}>
        {sortTasks(tasks).map((task) => {
          const done = task.status === 'erledigt';
          const overdue = !done && task.due !== null && task.due < t;
          const color = data.courses.find((c) => c.id === task.courseId)?.color;
          const subs = task.subtasks ?? [];
          const subsDone = subs.filter((s) => s.done).length;
          return (
            <li key={task.id} className={`rem-row ${done ? 'done' : ''}`} style={color ? { ['--c' as string]: color } : undefined}>
              <button
                type="button"
                className={`rem-check ${done ? 'on' : ''}`}
                onClick={() => (done ? update('tasks', task.id, { status: 'offen' }) : complete(task))}
                aria-label={done ? `${task.title} wieder öffnen` : `${task.title} erledigen`}
                aria-pressed={done}
              >
                {done && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" aria-hidden="true">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                )}
              </button>
              <button type="button" className="rem-main" onClick={() => setEditing(task.id)} title="Bearbeiten">
                <span className="rem-title">
                  {PRIO_MARKS[task.priority] && <span className="rem-prio">{PRIO_MARKS[task.priority]}</span>}
                  {task.title}
                </span>
                {task.note && !compact && <span className="rem-note">{task.note}</span>}
                <span className="rem-meta">
                  {task.due && (
                    <span className={overdue ? 'rem-overdue' : ''} title={formatDate(task.due)}>
                      {relativeLabel(task.due, t).replace(/^./, (c) => c.toUpperCase())}
                      {task.dueTime && `, ${task.dueTime}`}
                    </span>
                  )}
                  {showCourse && !compact && task.courseId && <CourseBadge id={task.courseId} />}
                  {!compact && task.kind !== 'Aufgabe' && <span>{task.kind}</span>}
                  {!compact && task.status === 'in Arbeit' && <span className="rem-doing">in Arbeit</span>}
                  {subs.length > 0 && <span>{subsDone} von {subs.length}</span>}
                </span>
                {subs.length > 0 && !compact && (
                  <span className="rem-progress"><span style={{ width: `${(subsDone / subs.length) * 100}%` }} /></span>
                )}
              </button>
              <button
                type="button"
                className={`icon rem-flag ${task.flagged ? 'on' : ''}`}
                onClick={() => update('tasks', task.id, { flagged: !task.flagged })}
                aria-label={task.flagged ? 'Markierung entfernen' : 'Markieren'}
                aria-pressed={!!task.flagged}
                title={task.flagged ? 'Markierung entfernen' : 'Markieren'}
              >
                <FlagIcon filled={!!task.flagged} />
              </button>
              {!compact && (
                <button
                  className="icon rem-delete"
                  onClick={() => confirm(`„${task.title}“ löschen?`) && remove('tasks', task.id)}
                  aria-label="Löschen"
                  title="Löschen"
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {editTask && <TaskModal task={editTask} onClose={() => setEditing(null)} />}
    </>
  );
}
