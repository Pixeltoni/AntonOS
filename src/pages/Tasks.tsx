import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, CheckSquare, ChevronDown, Keyboard, Moon, Pencil, Search, X } from 'lucide-react';
import { useStore } from '../store';
import type { ID, Task } from '../types';
import { addDays, formatDate, parseDate, today } from '../lib/dates';
import { TaskEmpty, TaskForm, TaskList } from '../components/TaskList';
import { useTaskActions, useTaskUI, visibleTaskIds } from '../components/taskui';
import { useCalendarEntries } from '../components/calendar';
import { ProgressPie } from '../components/ui';
import { deadlineLabel, inSomeday, inToday, logbook } from '../lib/things';
import { collectTags, doneToday, formatMinutes, freeMinutes, groupUpcoming, matchesQuery, upcomingDate } from '../lib/tasks';
import { isTimedOn, onDay, sortEntries, toMin } from '../lib/calendar';

type ListId = 'heute' | 'geplant' | 'alle' | 'markiert' | 'irgendwann' | 'erledigt' | `kurs:${string}` | 'ohne-kurs' | `liste:${string}` | `projekt:${string}`;

interface SmartList {
  id: ListId;
  label: string;
  color: string;
  icon: ReactNode;
  filter: (t: Task, today: string) => boolean;
  /** Ablageziel beim Ziehen */
  drop?: string;
}

const svg = (d: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" aria-hidden="true">{d}</svg>
);

const open = (t: Task) => t.status !== 'erledigt';

export const SMART_LISTS: SmartList[] = [
  { id: 'heute', label: 'Heute', color: '#007AFF', drop: 'smart:heute', icon: svg(<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />), filter: (t, d) => inToday(t, d) },
  { id: 'geplant', label: 'Anstehend', color: '#FF3B30', icon: svg(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>), filter: (t, d) => upcomingDate(t, d) !== null },
  { id: 'alle', label: 'Alle', color: '#3A3A3C', icon: svg(<path d="M4 6h16M4 12h16M4 18h16" />), filter: (t) => open(t) && !t.someday },
  { id: 'markiert', label: 'Markiert', color: '#FF9500', drop: 'smart:markiert', icon: svg(<path d="M5 21V4h11l-2 4 2 4H5" />), filter: (t) => open(t) && !!t.flagged },
  { id: 'irgendwann', label: 'Irgendwann', color: '#34C759', drop: 'smart:irgendwann', icon: svg(<><path d="M12 2l9 5-9 5-9-5z" /><path d="M3 12l9 5 9-5M3 17l9 5 9-5" /></>), filter: (t) => inSomeday(t) },
  { id: 'erledigt', label: 'Logbuch', color: '#8E8E93', icon: svg(<><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" /></>), filter: (t) => !open(t) },
];

const LIST_COLORS = ['#007AFF', '#34C759', '#FF9500', '#FF2D55', '#AF52DE', '#5856D6', '#30B0C7', '#A2845E'];

const dayLabel = (d: string, t: string) =>
  d === t ? 'Heute' : d === addDays(t, 1) ? 'Morgen' : parseDate(d).toLocaleDateString('de-DE', { weekday: 'long' });

/** Fortschrittsring für „Heute“ */
function ProgressRing({ share, size = 46 }: { share: number; size?: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="today-ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#007AFF" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${c * share} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

/** Aufgaben im Stil von Erinnerungen und Things 3 */
export function Tasks() {
  const { data, add, update, remove } = useStore();
  const ui = useTaskUI();
  const actions = useTaskActions();
  const entries = useCalendarEntries();
  const [listId, setListIdState] = useState<ListId>('heute');
  // Am Handy: erst die Übersicht, nach dem Antippen die Liste (wie in Erinnerungen)
  const [showList, setShowList] = useState(false);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [studyOpen, setStudyOpen] = useState(true);
  const [newList, setNewList] = useState<{ name: string; color: string } | null>(null);
  const [editList, setEditList] = useState(false);
  const [help, setHelp] = useState(false);
  const [stuck, setStuck] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const setListId = (id: ListId) => {
    setListIdState(id);
    setShowList(true);
    setQuery('');
    setTag(null);
    setEditList(false);
    ui.setSelectMode(false);
    window.scrollTo({ top: 0 });
  };
  const t = today();

  // Kleiner Titel oben, sobald der große aus dem Bild scrollt
  useEffect(() => {
    const el = titleRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [showList]);

  const courseLists = data.courses.map((c) => ({ id: `kurs:${c.id}` as ListId, label: c.name, color: c.color, filter: (x: Task) => open(x) && x.courseId === c.id, drop: `course:${c.id}` }));
  const ownLists = data.taskLists.map((l) => ({ id: `liste:${l.id}` as ListId, label: l.name, color: l.color, filter: (x: Task) => open(x) && x.listId === l.id, drop: `list:${l.id}`, list: l }));
  const looseList = { id: 'ohne-kurs' as ListId, label: 'Ohne Liste', color: '#8E8E93', filter: (x: Task) => open(x) && x.courseId === null && !x.listId, drop: 'course:' };
  const allLists = [...courseLists, ...ownLists, looseList];
  const projects = data.projects.filter((p) => p.status !== 'abgeschlossen');
  const projectShare = (id: ID) => {
    const all = data.tasks.filter((x) => x.projectId === id);
    return all.length ? all.filter((x) => !open(x)).length / all.length : 0;
  };
  const smart = SMART_LISTS.find((l) => l.id === listId);
  const userList = allLists.find((l) => l.id === listId);
  const ownList = ownLists.find((l) => l.id === listId)?.list;
  const project = listId.startsWith('projekt:') ? data.projects.find((p) => p.id === listId.slice(8)) : undefined;
  const title = smart?.label ?? userList?.label ?? project?.title ?? 'Aufgaben';
  const color = smart?.color ?? userList?.color ?? '#007AFF';
  const baseTasks = data.tasks.filter((task) =>
    smart ? smart.filter(task, t) : userList ? userList.filter(task) : project ? open(task) && task.projectId === project.id : open(task),
  );
  const tags = collectTags(baseTasks);
  const tasks = baseTasks.filter((x) => matchesQuery(x, query) && (!tag || (x.tags ?? []).includes(tag)));
  const count = (fn: (task: Task) => boolean) => data.tasks.filter(fn).length;
  const showCourse = !listId.startsWith('kurs:') && !listId.startsWith('liste:');

  // Tastatur: Pfeile, Leertaste, N, T, E, M, F, Entf, ?
  const keyState = useRef({ ui, actions, data });
  keyState.current = { ui, actions, data };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]');
      if (typing || document.querySelector('.modal-backdrop')) return;
      const { ui: u, actions: act } = keyState.current;
      const ids = visibleTaskIds();
      const targets = u.selected.size ? [...u.selected] : u.cursor && ids.includes(u.cursor) ? [u.cursor] : [];
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        u.setSelected(ids);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const go = (dir: 1 | -1) => {
        if (!ids.length) return;
        const at = u.cursor ? ids.indexOf(u.cursor) : -1;
        const next = ids[Math.max(0, Math.min(ids.length - 1, at < 0 ? 0 : at + dir))];
        if (e.shiftKey) u.select(next, 'toggle');
        else {
          u.setSelected([next]);
          u.setCursor(next);
        }
        document.querySelector(`[data-task-id="${next}"]`)?.scrollIntoView({ block: 'nearest' });
      };
      const handled = () => e.preventDefault();
      switch (e.key) {
        case 'ArrowDown': handled(); go(1); break;
        case 'ArrowUp': handled(); go(-1); break;
        case ' ': if (targets.length) { handled(); act.complete(targets); } break;
        case 'Enter': if (targets.length === 1) { handled(); u.open(targets[0]); } break;
        case 'n': case 'N': handled(); document.querySelector<HTMLInputElement>('.rem-content .quick-add input')?.focus(); break;
        case 't': case 'T': if (targets.length) { handled(); act.when(targets, 'heute'); } break;
        case 'e': case 'E': if (targets.length) { handled(); act.when(targets, 'abends'); } break;
        case 'm': case 'M': if (targets.length) { handled(); act.tomorrow(targets); } break;
        case 'i': case 'I': if (targets.length) { handled(); act.when(targets, 'irgendwann'); } break;
        case 'f': case 'F': if (targets.length) { handled(); act.flag(targets); } break;
        case 'Backspace': case 'Delete': if (targets.length) { handled(); act.remove(targets); u.clearSelection(); } break;
        case 'Escape': if (u.selected.size || u.selectMode) { u.setSelectMode(false); u.clearSelection(); } break;
        case '?': handled(); setHelp((h) => !h); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const createList = () => {
    if (!newList?.name.trim()) return;
    const id = add('taskLists', { name: newList.name.trim(), color: newList.color });
    setNewList(null);
    setListId(`liste:${id}`);
  };

  const selected = [...ui.selected].filter((id) => data.tasks.some((x) => x.id === id));

  return (
    <div className={`reminders ${showList ? 'show-list' : ''}`}>
      <aside className="rem-side">
        <h1 className="rem-overview-title">Aufgaben</h1>
        <div className="rem-tiles">
          {SMART_LISTS.map((l) => (
            <button key={l.id} type="button" className={`rem-tile ${listId === l.id ? 'active' : ''}`} onClick={() => setListId(l.id)} aria-pressed={listId === l.id} {...(l.drop ? { 'data-drop': l.drop } : {})}>
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
          {courseLists.length > 0 && (
            <>
              <button type="button" className="rem-list-btn rem-group-btn" onClick={() => setStudyOpen((o) => !o)} aria-expanded={studyOpen}>
                <ChevronDown size={16} className={`rem-group-chev ${studyOpen ? '' : 'closed'}`} aria-hidden />
                <span className="grow">Studium</span>
                <span className="muted">{courseLists.reduce((s, l) => s + count(l.filter), 0)}</span>
              </button>
              {studyOpen && courseLists.map((l) => (
                <button key={l.id} type="button" className={`rem-list-btn nested ${listId === l.id ? 'active' : ''}`} onClick={() => setListId(l.id)} aria-pressed={listId === l.id} data-drop={l.drop}>
                  <span className="rem-list-dot small" style={{ background: l.color }} aria-hidden />
                  <span className="grow">{l.label}</span>
                  <span className="muted">{count(l.filter)}</span>
                </button>
              ))}
            </>
          )}
          {[...ownLists, looseList].map((l) => (
            <button key={l.id} type="button" className={`rem-list-btn ${listId === l.id ? 'active' : ''}`} onClick={() => setListId(l.id)} aria-pressed={listId === l.id} data-drop={l.drop}>
              <span className="rem-list-dot" style={{ background: l.color }} aria-hidden />
              <span className="grow">{l.label}</span>
              <span className="muted">{count(l.filter)}</span>
            </button>
          ))}
          {newList ? (
            <form className="rem-new-list" onSubmit={(e) => { e.preventDefault(); createList(); }}>
              <input autoFocus placeholder="Name der Liste" value={newList.name} onChange={(e) => setNewList({ ...newList, name: e.target.value })} aria-label="Name der Liste" />
              <ColorPicker value={newList.color} onChange={(c) => setNewList({ ...newList, color: c })} />
              <div className="row">
                <button type="button" onClick={() => setNewList(null)}>Abbrechen</button>
                <button type="submit" className="primary" disabled={!newList.name.trim()}>Anlegen</button>
              </div>
            </form>
          ) : (
            <button type="button" className="rem-list-btn rem-add-list" onClick={() => setNewList({ name: '', color: LIST_COLORS[data.taskLists.length % LIST_COLORS.length] })}>+ Liste hinzufügen</button>
          )}
        </div>
        {projects.length > 0 && (
          <>
            <h2 className="rem-side-title">Projekte</h2>
            <div className="rem-lists">
              {projects.map((p) => (
                <button key={p.id} type="button" className={`rem-list-btn ${listId === `projekt:${p.id}` ? 'active' : ''}`} onClick={() => setListId(`projekt:${p.id}`)} aria-pressed={listId === `projekt:${p.id}`} data-drop={`project:${p.id}`}>
                  <ProgressPie share={projectShare(p.id)} size={22} />
                  <span className="grow">{p.title}</span>
                  <span className="muted">{count((task) => open(task) && task.projectId === p.id)}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <button type="button" className="rem-help-btn muted small" onClick={() => setHelp(true)}><Keyboard size={14} aria-hidden /> Tastenkürzel</button>
      </aside>

      <section className="rem-content panel">
        <div className={`rem-sticky ${stuck ? 'on' : ''}`} aria-hidden={!stuck}>
          <strong style={{ color }}>{title}</strong>
        </div>
        <div className="rem-head">
          <button type="button" className="rem-back" onClick={() => setShowList(false)}>‹ Listen</button>
          <button type="button" className={`rem-select-btn ${ui.selectMode ? 'on' : ''}`} onClick={() => ui.setSelectMode(!ui.selectMode)}>
            <CheckSquare size={15} aria-hidden /> {ui.selectMode ? 'Fertig' : 'Auswählen'}
          </button>
        </div>
        <div className="rem-title-row">
          <h1 ref={titleRef} className="rem-list-title" style={{ color }}>{title}</h1>
          {ownList && (
            <button type="button" className="icon" onClick={() => setEditList((x) => !x)} aria-label="Liste bearbeiten" title="Liste bearbeiten"><Pencil size={16} /></button>
          )}
        </div>
        {ownList && editList && (
          <div className="rem-edit-list">
            <input value={ownList.name} onChange={(e) => update('taskLists', ownList.id, { name: e.target.value })} aria-label="Name der Liste" />
            <ColorPicker value={ownList.color} onChange={(c) => update('taskLists', ownList.id, { color: c })} />
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (confirm(`Liste „${ownList.name}“ löschen? Die Aufgaben bleiben unter „Ohne Liste“.`)) {
                  remove('taskLists', ownList.id);
                  setListId('heute');
                }
              }}
            >
              Liste löschen
            </button>
          </div>
        )}
        {project && (
          <p className="muted small rem-project-meta">
            <ProgressPie share={projectShare(project.id)} size={14} /> {Math.round(projectShare(project.id) * 100)} % erledigt
            {project.due && <> · {deadlineLabel(project.due, t)}</>} · <a href={`#/projekte/${project.id}`}>Projekt öffnen</a>
          </p>
        )}

        <div className="rem-filter">
          <label className="rem-search">
            <Search size={15} aria-hidden />
            <input type="search" placeholder={`In „${title}“ suchen`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Aufgaben durchsuchen" />
          </label>
          {tags.length > 0 && (
            <div className="rem-tags" role="group" aria-label="Nach Tag filtern">
              <button type="button" className={`tchip ${tag === null ? 'on dark' : ''}`} onClick={() => setTag(null)} aria-pressed={tag === null}>Alle</button>
              {tags.map((x) => (
                <button key={x} type="button" className={`tchip ${tag === x ? 'on dark' : ''}`} onClick={() => setTag(tag === x ? null : x)} aria-pressed={tag === x}>@{x}</button>
              ))}
            </div>
          )}
        </div>

        {listId !== 'erledigt' && (
          <TaskForm
            courseId={listId.startsWith('kurs:') ? listId.slice(5) : null}
            projectId={project?.id ?? null}
            defaults={{
              flagged: listId === 'markiert',
              plannedFor: listId === 'heute' ? t : undefined,
              someday: listId === 'irgendwann',
              listId: ownList?.id,
            }}
          />
        )}

        {listId === 'heute' ? (
          <TodayView tasks={tasks} filtered={!!query || !!tag} entries={entries} />
        ) : listId === 'geplant' ? (
          <UpcomingView tasks={tasks} entries={entries} />
        ) : listId === 'erledigt' ? (
          tasks.length === 0 ? <TaskEmpty text="Noch nichts erledigt." /> : logbook(tasks, t).map((g) => (
            <div key={g.date || 'frueher'} className="rem-group">
              <h3>{g.label}</h3>
              <TaskList tasks={g.tasks} sortable={false} />
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
        ) : (
          <TaskList tasks={tasks} showCourse={showCourse} emptyText={query || tag ? 'Nichts gefunden.' : undefined} />
        )}
      </section>

      {(selected.length > 0 || ui.selectMode) && (
        <div className="bulk-bar" role="toolbar" aria-label="Ausgewählte Aufgaben">
          <strong className="bulk-count">{selected.length} ausgewählt</strong>
          <label className="bulk-btn">
            <CalendarDays size={15} aria-hidden /> Frist
            <input type="date" disabled={!selected.length} onChange={(e) => actions.due(selected, e.target.value || null)} aria-label="Frist setzen" />
          </label>
          <select className="bulk-btn" disabled={!selected.length} value="" onChange={(e) => {
            const v = e.target.value;
            if (v === 'morgen') actions.tomorrow(selected);
            else if (v) actions.when(selected, v === 'ohne' ? '' : (v as 'heute' | 'abends' | 'irgendwann'));
            e.target.value = '';
          }} aria-label="Wann">
            <option value="">Wann …</option>
            <option value="heute">Heute</option>
            <option value="abends">Heute Abend</option>
            <option value="morgen">Morgen</option>
            <option value="irgendwann">Irgendwann</option>
            <option value="ohne">Ohne Datum</option>
          </select>
          <select className="bulk-btn" disabled={!selected.length} value="" onChange={(e) => e.target.value && actions.move(selected, e.target.value)} aria-label="In Liste verschieben">
            <option value="">Liste …</option>
            <option value="course:">Ohne Liste</option>
            {data.courses.map((c) => <option key={c.id} value={`course:${c.id}`}>{c.name}</option>)}
            {data.taskLists.map((l) => <option key={l.id} value={`list:${l.id}`}>{l.name}</option>)}
            {projects.map((p) => <option key={p.id} value={`project:${p.id}`}>Projekt: {p.title}</option>)}
          </select>
          <button type="button" className="bulk-btn" disabled={!selected.length} onClick={() => actions.flag(selected)}>Markieren</button>
          <button type="button" className="bulk-btn" disabled={!selected.length} onClick={() => { actions.complete(selected); ui.clearSelection(); }}>Erledigt</button>
          <button type="button" className="bulk-btn danger" disabled={!selected.length} onClick={() => { actions.remove(selected); ui.clearSelection(); }}>Löschen</button>
          <button type="button" className="icon bulk-close" onClick={() => ui.setSelectMode(false)} aria-label="Auswahl beenden"><X size={16} /></button>
        </div>
      )}

      {help && <ShortcutHelp onClose={() => setHelp(false)} />}
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="color-dots" role="radiogroup" aria-label="Farbe">
      {LIST_COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c} className={value === c ? 'on' : ''} style={{ background: c }} onClick={() => onChange(c)} />
      ))}
    </div>
  );
}

type Entries = ReturnType<typeof useCalendarEntries>;

/** „Heute“ mit Fortschritt, Überfälligem, Abends und dem heute Erledigten */
function TodayView({ tasks, filtered, entries }: { tasks: Task[]; filtered: boolean; entries: Entries }) {
  const { data } = useStore();
  const actions = useTaskActions();
  const t = today();
  const overdue = tasks.filter((x) => x.due !== null && x.due < t);
  const rest = tasks.filter((x) => !overdue.includes(x));
  const done = doneToday(data.tasks, t).filter((x) => !filtered || tasks.includes(x));
  const total = tasks.length + done.length;
  const planned = tasks.reduce((s, x) => s + (x.estimate ?? 0), 0);
  const now = new Date();
  const busy = entries
    .filter((e) => e.kind !== 'task' && e.kind !== 'project' && isTimedOn(e, t))
    .map((e) => [toMin(e.time), e.endTime ? toMin(e.endTime) : toMin(e.time) + 60] as [number, number]);
  const free = freeMinutes(busy, Math.max(now.getHours() * 60 + now.getMinutes(), 8 * 60), 22 * 60);

  return (
    <>
      {total > 0 && (
        <div className="today-head">
          <ProgressRing share={total ? done.length / total : 0} />
          <div className="col tight">
            <strong>{done.length} von {total} erledigt</strong>
            {planned > 0 && (
              <span className={`muted small ${free > 0 && planned > free ? 'warn' : ''}`}>
                {formatMinutes(planned)} geplant{free > 0 && <> · {formatMinutes(free)} frei zwischen Terminen</>}
              </span>
            )}
          </div>
        </div>
      )}
      {planned > 0 && free > 0 && (
        <div className={`today-bar ${planned > free ? 'over' : ''}`} role="img" aria-label={`${formatMinutes(planned)} von ${formatMinutes(free)} freier Zeit verplant`}>
          <span style={{ width: `${Math.min(100, (planned / free) * 100)}%` }} />
        </div>
      )}
      {overdue.length > 0 && (
        <div className="rem-overdue-box">
          <div className="rem-overdue-head">
            <strong>Überfällig · {overdue.length}</strong>
            <span className="row">
              <button type="button" onClick={() => actions.tomorrow(overdue.map((x) => x.id))}>Auf morgen</button>
              <button type="button" className="primary" onClick={() => actions.due(overdue.map((x) => x.id), t)}>Alles auf heute</button>
            </span>
          </div>
          <TaskList tasks={overdue} />
        </div>
      )}
      {rest.length === 0 && overdue.length === 0 ? (
        done.length > 0 ? (
          <div className="today-done" role="status">
            <span className="today-burst" aria-hidden><i /><i /><i /><i /><i /><i /></span>
            <strong>Alles erledigt für heute!</strong>
            <span className="muted small">{done.length} {done.length === 1 ? 'Aufgabe' : 'Aufgaben'} geschafft.</span>
          </div>
        ) : (
          <TaskEmpty text={filtered ? 'Nichts gefunden.' : 'Für heute ist nichts geplant.'} />
        )
      ) : (
        <>
          {rest.some((x) => !x.evening) && <TaskList tasks={rest.filter((x) => !x.evening)} />}
          {rest.some((x) => x.evening) && (
            <div className="rem-group rem-evening">
              <h3><Moon size={16} aria-hidden /> Heute Abend</h3>
              <TaskList tasks={rest.filter((x) => x.evening)} />
            </div>
          )}
        </>
      )}
      {done.length > 0 && (
        <div className="rem-group rem-done-today">
          <h3>Erledigt · {done.length}</h3>
          <TaskList tasks={done} sortable={false} />
        </div>
      )}
    </>
  );
}

/** „Anstehend“: Wochenleiste, Termine und Aufgaben nach Tagen */
function UpcomingView({ tasks, entries }: { tasks: Task[]; entries: Entries }) {
  const t = today();
  const week = Array.from({ length: 7 }, (_, i) => addDays(t, i));
  const eventsOn = (d: string) => sortEntries(entries.filter((e) => e.kind !== 'task' && e.kind !== 'project' && onDay(e, d)));
  const groups = groupUpcoming(tasks, t, week.filter((d) => eventsOn(d).length > 0));
  const scrollTo = (d: string) => document.getElementById(`up-${d}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <>
      <div className="week-strip" role="group" aria-label="Nächste 7 Tage">
        {week.map((d) => {
          const deadline = tasks.some((x) => x.due === d);
          const planned = tasks.some((x) => upcomingDate(x, t) === d) || eventsOn(d).length > 0;
          return (
            <button key={d} type="button" className={`week-day ${d === t ? 'today' : ''}`} onClick={() => scrollTo(d)} data-drop={`day:${d}`} aria-label={`${dayLabel(d, t)}, ${formatDate(d)}`}>
              <span className="wd">{parseDate(d).toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')}</span>
              <strong>{Number(d.slice(8))}</strong>
              <i className={deadline ? 'dot red' : planned ? 'dot' : 'dot none'} aria-hidden />
            </button>
          );
        })}
      </div>
      {groups.length === 0 ? (
        <TaskEmpty text="Nichts geplant." />
      ) : (
        groups.map((g) => {
          const events = g.date ? eventsOn(g.date) : [];
          return (
            <div key={g.key} id={g.date ? `up-${g.date}` : undefined} className="rem-group up-group">
              <h3 className={g.key === 'ueberfaellig' ? 'danger' : ''}>
                {g.date ? <>{dayLabel(g.date, t)} <span className="muted">{parseDate(g.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}</span></> : 'Überfällig'}
              </h3>
              {events.map((e) => (
                <a key={e.key} className="up-event" href={e.href ?? '#/kalender'}>
                  <CalendarDays size={13} aria-hidden />
                  {e.time && <span className="muted">{e.time}</span>}
                  <span className="grow">{e.label}</span>
                </a>
              ))}
              {g.tasks.length > 0 && <TaskList tasks={g.tasks} />}
            </div>
          );
        })
      )}
    </>
  );
}

/** Übersicht der Tastenkürzel (Taste ?) */
function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const keys: [string, string][] = [
    ['N', 'Neue Aufgabe'],
    ['↑ ↓', 'Aufgabe wählen (mit Shift: mehrere)'],
    ['Leertaste', 'Abhaken'],
    ['Enter', 'Details öffnen'],
    ['T', 'Auf heute'],
    ['E', 'Heute Abend'],
    ['M', 'Auf morgen'],
    ['I', 'Irgendwann'],
    ['F', 'Markieren'],
    ['Entf', 'Löschen'],
    ['⌘/Strg + A', 'Alle auswählen'],
    ['⌘/Strg + Klick', 'Mehrere auswählen'],
    ['Esc', 'Auswahl aufheben'],
  ];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal shortcut-help" role="dialog" aria-modal="true" aria-label="Tastenkürzel">
        <div className="row between">
          <h2>Tastenkürzel</h2>
          <button type="button" className="icon" onClick={onClose} aria-label="Schließen"><X size={18} /></button>
        </div>
        <dl>
          {keys.map(([k, label]) => (
            <div key={k}><dt>{label}</dt><dd><kbd>{k}</kbd></dd></div>
          ))}
        </dl>
      </div>
    </div>
  );
}

