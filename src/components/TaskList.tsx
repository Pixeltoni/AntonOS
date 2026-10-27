import { useState } from 'react';
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

export function TaskForm({ courseId = null, compact = false }: { courseId?: ID | null; compact?: boolean }) {
  const { add } = useStore();
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState<ID | null>(courseId);
  const [due, setDue] = useState('');
  const [kind, setKind] = useState<TaskKind>('Aufgabe');
  const [priority, setPriority] = useState<Priority>('mittel');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    add('tasks', { title: title.trim(), courseId: course, due: due || null, kind, priority, status: 'offen' });
    setTitle('');
    setDue('');
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
        </>
      )}
      <button className="primary" type="submit">Hinzufügen</button>
    </form>
  );
}

export function TaskList({ tasks, showCourse = true }: { tasks: Task[]; showCourse?: boolean }) {
  const { update, remove } = useStore();
  const t = today();
  if (tasks.length === 0) return <Empty>Keine Aufgaben – genieß die freie Zeit.</Empty>;

  return (
    <ul className="list">
      {sortTasks(tasks).map((task) => {
        const done = task.status === 'erledigt';
        const overdue = !done && task.due !== null && task.due < t;
        return (
          <li key={task.id} className={`task ${done ? 'done' : ''}`}>
            <input
              type="checkbox"
              checked={done}
              onChange={() => update('tasks', task.id, { status: done ? 'offen' : 'erledigt' })}
              aria-label={`${task.title} erledigt`}
            />
            <div className="grow">
              <div className="task-title">{task.title}</div>
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
            </div>
            <select
              value={task.status}
              onChange={(e) => update('tasks', task.id, { status: e.target.value as TaskStatus })}
              aria-label="Status"
            >
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <button className="icon" onClick={() => remove('tasks', task.id)} aria-label="Löschen" title="Löschen">×</button>
          </li>
        );
      })}
    </ul>
  );
}
