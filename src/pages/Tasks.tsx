import { useState, type ReactNode } from 'react';
import { useStore } from '../store';
import type { ID, Task } from '../types';
import { addDays, formatDate, today } from '../lib/dates';
import { TaskForm, TaskList } from '../components/TaskList';
import { ProgressPie } from '../components/ui';
import { deadlineLabel, inSomeday, inToday, logbook } from '../lib/things';
import { Empty } from '../components/ui';

type ListId = 'heute' | 'geplant' | 'alle' | 'markiert' | 'irgendwann' | 'erledigt' | `kurs:${string}` | 'ohne-kurs' | `projekt:${string}`;

interface SmartList {
  id: ListId;
  label: string;
  color: string;
  icon: ReactNode;
  filter: (t: Task, today: string) => boolean;
}

const svg = (d: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" aria-hidden="true">{d}</svg>
);

const open = (t: Task) => t.status !== 'erledigt';

export const SMART_LISTS: SmartList[] = [
  { id: 'heute', label: 'Heute', color: '#007AFF', icon: svg(<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />), filter: (t, d) => inToday(t, d) },
  { id: 'geplant', label: 'Geplant', color: '#FF3B30', icon: svg(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>), filter: (t) => open(t) && t.due !== null && !t.someday },
  { id: 'alle', label: 'Alle', color: '#3A3A3C', icon: svg(<path d="M4 6h16M4 12h16M4 18h16" />), filter: (t) => open(t) && !t.someday },
  { id: 'markiert', label: 'Markiert', color: '#FF9500', icon: svg(<path d="M5 21V4h11l-2 4 2 4H5" />), filter: (t) => open(t) && !!t.flagged },
  { id: 'irgendwann', label: 'Irgendwann', color: '#34C759', icon: svg(<><path d="M12 2l9 5-9 5-9-5z" /><path d="M3 12l9 5 9-5M3 17l9 5 9-5" /></>), filter: (t) => inSomeday(t) },
  { id: 'erledigt', label: 'Logbuch', color: '#8E8E93', icon: svg(<><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" /></>), filter: (t) => !open(t) },
];


/** „Geplant“ wird wie in Erinnerungen nach Tagen gruppiert. */
function groupByDay(tasks: Task[], t: string): { label: string; tasks: Task[] }[] {
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = task.due! < t ? 'überfällig' : task.due!;
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === 'überfällig' ? -1 : b === 'überfällig' ? 1 : a.localeCompare(b)))
    .map(([key, list]) => ({
      label: key === 'überfällig' ? 'Überfällig' : key === t ? 'Heute' : key === addDays(t, 1) ? 'Morgen' : formatDate(key),
      tasks: list,
    }));
}

export function Tasks() {
  const { data } = useStore();
  const [listId, setListIdState] = useState<ListId>('heute');
  // Am Handy: erst die Übersicht, nach dem Antippen die Liste (wie in Erinnerungen)
  const [showList, setShowList] = useState(false);
  const setListId = (id: ListId) => {
    setListIdState(id);
    setShowList(true);
    window.scrollTo({ top: 0 });
  };
  const t = today();

  const courseLists = [
    ...data.courses.map((c) => ({ id: `kurs:${c.id}` as ListId, label: c.name, color: c.color, courseId: c.id as ID | null })),
    { id: 'ohne-kurs' as ListId, label: 'Ohne Kurs', color: '#8E8E93', courseId: null },
  ];
  const projects = data.projects.filter((p) => p.status !== 'abgeschlossen');
  const projectShare = (id: ID) => {
    const all = data.tasks.filter((x) => x.projectId === id);
    return all.length ? all.filter((x) => !open(x)).length / all.length : 0;
  };
  const smart = SMART_LISTS.find((l) => l.id === listId);
  const courseList = courseLists.find((l) => l.id === listId);
  const project = listId.startsWith('projekt:') ? data.projects.find((p) => p.id === listId.slice(8)) : undefined;
  const title = smart?.label ?? courseList?.label ?? project?.title ?? 'Aufgaben';
  const color = smart?.color ?? courseList?.color ?? (project ? '#007AFF' : '#007AFF');
  const tasks = data.tasks.filter((task) =>
    smart ? smart.filter(task, t) : courseList ? open(task) && task.courseId === courseList.courseId : project ? open(task) && task.projectId === project.id : open(task),
  );
  const count = (fn: (task: Task) => boolean) => data.tasks.filter(fn).length;

  return (
    <div className={`reminders ${showList ? 'show-list' : ''}`}>
      <aside className="rem-side">
        <h1 className="rem-overview-title">Aufgaben</h1>
        <div className="rem-tiles">
          {SMART_LISTS.map((l) => (
            <button key={l.id} type="button" className={`rem-tile ${listId === l.id ? 'active' : ''}`} onClick={() => setListId(l.id)} aria-pressed={listId === l.id}>
              <span className="rem-tile-top">
                <span className="rem-tile-icon" style={{ background: l.color }}>{l.icon}</span>
                <span className="rem-tile-count">{count((task) => l.filter(task, t))}</span>
              </span>
              <span className="rem-tile-label">{l.label}</span>
            </button>
          ))}
        </div>
        <h2 className="rem-side-title">Meine Listen</h2>
        <div className="rem-lists">
          {courseLists.map((l) => (
            <button key={l.id} type="button" className={`rem-list-btn ${listId === l.id ? 'active' : ''}`} onClick={() => setListId(l.id)} aria-pressed={listId === l.id}>
              <span className="rem-list-dot" style={{ background: l.color }} aria-hidden />
              <span className="grow">{l.label}</span>
              <span className="muted">{count((task) => open(task) && task.courseId === l.courseId)}</span>
            </button>
          ))}
        </div>
        {projects.length > 0 && (
          <>
            <h2 className="rem-side-title">Projekte</h2>
            <div className="rem-lists">
              {projects.map((p) => (
                <button key={p.id} type="button" className={`rem-list-btn ${listId === `projekt:${p.id}` ? 'active' : ''}`} onClick={() => setListId(`projekt:${p.id}`)} aria-pressed={listId === `projekt:${p.id}`}>
                  <ProgressPie share={projectShare(p.id)} size={22} />
                  <span className="grow">{p.title}</span>
                  <span className="muted">{count((task) => open(task) && task.projectId === p.id)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </aside>

      <section className="rem-content panel">
        <button type="button" className="rem-back" onClick={() => setShowList(false)}>‹ Listen</button>
        <h1 className="rem-list-title" style={{ color }}>{title}</h1>
        {project && (
          <p className="muted small rem-project-meta">
            <ProgressPie share={projectShare(project.id)} size={14} /> {Math.round(projectShare(project.id) * 100)} % erledigt
            {project.due && <> · {deadlineLabel(project.due, t)}</>} · <a href={`#/projekte/${project.id}`}>Projekt öffnen</a>
          </p>
        )}
        {listId !== 'erledigt' && (
          <TaskForm
            courseId={courseList?.courseId ?? null}
            projectId={project?.id ?? null}
            defaults={{ flagged: listId === 'markiert', plannedFor: listId === 'heute' ? t : undefined, someday: listId === 'irgendwann' }}
          />
        )}
        {listId === 'heute' ? (
          <>
            <TaskList tasks={tasks.filter((x) => !x.evening)} />
            {tasks.some((x) => x.evening) && (
              <div className="rem-group rem-evening">
                <h3>🌙 Heute Abend</h3>
                <TaskList tasks={tasks.filter((x) => x.evening)} />
              </div>
            )}
          </>
        ) : listId === 'erledigt' ? (
          tasks.length === 0 ? <Empty>Noch nichts erledigt.</Empty> : logbook(tasks, t).map((g) => (
            <div key={g.date || 'frueher'} className="rem-group">
              <h3>{g.label}</h3>
              <TaskList tasks={g.tasks} />
            </div>
          ))
        ) : project && (project.sections?.length ?? 0) > 0 ? (
          <>
            <TaskList tasks={tasks.filter((x) => !x.section || !project.sections!.includes(x.section))} showCourse />
            {project.sections!.map((sec) => (
              <div key={sec} className="rem-group">
                <h3>{sec}</h3>
                <TaskList tasks={tasks.filter((x) => x.section === sec)} />
              </div>
            ))}
          </>
        ) : listId === 'geplant' ? (
          tasks.length === 0 ? (
            <Empty>Nichts geplant.</Empty>
          ) : (
            groupByDay(tasks, t).map((g) => (
              <div key={g.label} className="rem-group">
                <h3 className={g.label === 'Überfällig' ? 'danger' : ''}>{g.label}</h3>
                <TaskList tasks={g.tasks} />
              </div>
            ))
          )
        ) : (
          <TaskList tasks={tasks} showCourse={!courseList} />
        )}
      </section>
    </div>
  );
}
