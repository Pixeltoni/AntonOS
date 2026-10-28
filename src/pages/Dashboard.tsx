import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import type { WidgetConfig, WidgetId, WidgetSize, WidgetVariant } from '../types';
import { addDays, formatDate, hours, relativeLabel, today } from '../lib/dates';
import { courseGrade, formatGrade, summary } from '../lib/grades';
import { formatMoney, isHabitDone, monthTotals, safeHttpUrl, safeImageSrc } from '../lib/life';
import { DEFAULT_DASHBOARD, HEIGHTS, mergeWithDefaults, moveItem, moveTo, normalizeWidgets, SIZES, VARIANT_LABELS, WIDGET_LABELS } from '../lib/layout';
import { isDue } from '../lib/srs';
import { TaskForm, TaskList } from '../components/TaskList';
import { Agenda, Clock, Cover, ImageInput, PeriodBars } from '../components/widgets';
import { CalendarView } from '../components/calendar';
import { SpotifyPlayer } from '../components/spotify';
import { AppearanceEditor } from '../components/appearance';
import { RingsWidget } from '../components/rings';
import { Icon, PAGE_ICONS, stripEmoji, WIDGET_ICONS } from '../components/icons';
import { FocusWidget, useFocus } from '../components/focus';
import { focusMode } from '../lib/focus';
import { noteTitle } from '../lib/notes';
import { CountdownWidget, SmartStack, TodayWidget, useDragReorder, WidgetGallery } from '../components/homescreen';
import { CourseBadge, Empty, Panel, Progress, Stat } from '../components/ui';
import { HabitsToday } from './Habits';
import { ProjectCard, useProjectProgress } from './Projects';
import { BudgetWidget, sortTx, TransactionList } from './Finance';
import { ShoppingWidget } from './Shopping';
import { MealsWidget } from './Meals';
import { BirthdaysWidget } from './People';
import { TripWidget } from './Trips';
import { ReviewWidget } from './Review';
import { MediaCard, READ_KINDS, WATCH_KINDS } from './Media';
import { WorkoutList } from './Training';
import { AlbumCard } from './Albums';
import { ToolLinks } from './Tools';
import { VisionBoard } from './Goals';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Guten Morgen';
  if (h < 18) return 'Hallo';
  return 'Guten Abend';
}

const QUICK_ACTIONS = [
  { label: 'Neue Notiz', icon: '📝', href: '#/notizen' },
  { label: 'Neue Aufgabe', icon: '✅', href: '#/aufgaben' },
  { label: 'Neue Ausgabe', icon: '💸', href: '#/finanzen' },
  { label: 'Neues Projekt', icon: '🚀', href: '#/projekte' },
  { label: 'Neue Lernkarte', icon: '🧠', href: '#/lernen' },
  { label: 'Neues Training', icon: '🏋️', href: '#/training' },
  { label: 'Neues Buch / Serie', icon: '📚', href: '#/lesen' },
  { label: 'Neues Album', icon: '📸', href: '#/alben' },
];

const TOP_NAV = [
  { label: 'Kalender', path: 'kalender' },
  { label: 'Aufgaben', path: 'aufgaben' },
  { label: 'Gewohnheiten', path: 'gewohnheiten' },
  { label: 'Finanzen', path: 'finanzen' },
  { label: 'Ziele', path: 'ziele' },
  { label: 'Training', path: 'training' },
  { label: 'Studium', path: 'kurse' },
  { label: 'Musik', path: 'musik' },
];

/** Wie viele Einträge eine Liste je nach Ansicht zeigt. */
const pick = (v: WidgetVariant, kompakt: number, standard: number, detail: number) =>
  v === 'kompakt' ? kompakt : v === 'detail' ? detail : standard;

function Banner({ editing }: { editing: boolean }) {
  const { data } = useStore();
  const cover = safeImageSrc(data.settings.cover);
  return (
    <div className="banner-wrap">
      {cover ? <img className="banner" src={cover} alt="" /> : <div className="banner placeholder-banner" />}
      <div className="banner-title">
        <h1>{greeting()}, {data.settings.name || 'du'} 👋</h1>
        <p>{formatDate(today())}</p>
      </div>
      {!editing && <a className="button banner-edit" href="#/dashboard/bearbeiten">✏️ Bearbeiten</a>}
    </div>
  );
}

function ProjectRow({ id, title }: { id: string; title: string }) {
  const progress = useProjectProgress(id);
  return (
    <li className="col">
      <a href={`#/projekte/${id}`}>{title}</a>
      {progress !== null && <Progress value={progress} />}
    </li>
  );
}

interface WidgetDef {
  title: string | null;
  link?: [string, string];
  /** Welche Ansichten sinnvoll sind (Standard: alle drei) */
  variants?: WidgetVariant[];
  render: (v: WidgetVariant) => ReactNode;
}

/** Inhalt aller Widgets. Titel `null` = ohne eigenen Rahmen. */
function useWidgets(): Record<WidgetId, WidgetDef> {
  const { data } = useStore();
  const t = today();
  const weekEnd = addDays(t, 7);

  const open = data.tasks.filter((x) => x.status !== 'erledigt');
  const thisWeek = open.filter((x) => x.due !== null && x.due <= weekEnd);
  // Ohne Datum notierte Aufgaben (z. B. aus der Schnellnotiz) sollen nicht aus dem Blick geraten
  const upNext = open.filter((x) => x.due === null || x.due <= weekEnd);
  const dueCards = data.cards.filter((c) => isDue(c, t)).length;
  const exams = [...data.exams].filter((e) => e.date >= t).sort((a, b) => a.date.localeCompare(b.date));
  const grades = summary(data.courses, data.grades);
  const weekStart = addDays(t, -6);
  const focusMinutes = data.sessions.filter((s) => s.date >= weekStart && s.date <= t).reduce((s, x) => s + x.minutes, 0);
  const activeProjects = data.projects.filter((p) => p.status === 'aktiv');
  const watching = data.media.filter((m) => WATCH_KINDS.includes(m.kind) && m.status === 'läuft');
  const reading = data.media.filter((m) => READ_KINDS.includes(m.kind) && m.status === 'läuft');
  const notes = [...data.notes].sort((a, b) => b.updated.localeCompare(a.updated));
  const workouts = [...data.workouts].sort((a, b) => b.date.localeCompare(a.date));
  const albums = [...data.albums].sort((a, b) => b.date.localeCompare(a.date));
  const month = monthTotals(data.transactions, t.slice(0, 7));
  const habitsDone = data.habits.filter((h) => isHabitDone(data.habitLogs, h, t)).length;
  const workouts30 = data.workouts.filter((w) => w.done && w.date >= addDays(t, -29)).length;

  const media = (items: typeof watching, empty: string) => (v: WidgetVariant) =>
    items.length === 0 ? <Empty>{empty}</Empty> : v === 'kompakt' ? (
      <ul className="list dense">
        {items.map((m) => <li key={m.id}><span className="grow">{m.title}</span><span className="muted small">{m.progress}</span></li>)}
      </ul>
    ) : (
      <div className="gallery small-cards">{items.map((m) => <MediaCard key={m.id} item={m} compact={v === 'standard'} />)}</div>
    );

  return {
    topnav: {
      title: null,
      variants: ['kompakt', 'standard'],
      render: (v) => (
        <nav className={`top-nav ${v}`} aria-label="Bereiche">
          {TOP_NAV.map((n) => (
            <a key={n.path} href={`#/${n.path}`} title={n.label}>
              <Icon icon={PAGE_ICONS[n.path]} size={16} />
              {v !== 'kompakt' && <span>{n.label}</span>}
            </a>
          ))}
        </nav>
      ),
    },
    stats: {
      title: null,
      render: (v) => (
        <div className="stats">
          <Stat label="Offene Aufgaben" value={open.length} hint={v === 'kompakt' ? undefined : `${thisWeek.length} diese Woche`} href="#/aufgaben" />
          <Stat label="Karten fällig" value={dueCards} hint={v === 'kompakt' ? undefined : 'heute wiederholen'} href="#/lernen" />
          <Stat label="Nächste Prüfung" value={exams[0] ? relativeLabel(exams[0].date, t) : '–'} hint={v === 'kompakt' ? undefined : exams[0]?.title} href="#/pruefungen" />
          {v !== 'kompakt' && (
            <>
              <Stat label="Notenschnitt" value={formatGrade(grades.truncated, 1)} hint={`${hours(focusMinutes)} h Fokus (7 Tage)`} href="#/noten" />
              <Stat label="Ausgaben im Monat" value={formatMoney(month.expenses)} href="#/finanzen" />
            </>
          )}
          {v === 'detail' && (
            <>
              <Stat label="Gewohnheiten heute" value={`${habitsDone}/${data.habits.length}`} href="#/gewohnheiten" />
              <Stat label="Saldo im Monat" value={formatMoney(month.balance)} href="#/finanzen" />
              <Stat label="ECTS" value={grades.earnedEcts} hint={`von ${grades.plannedEcts}`} href="#/noten" />
            </>
          )}
        </div>
      ),
    },
    clock: { title: '', render: (v) => <Clock variant={v} /> },
    quick: {
      title: '⚡ Schnellaktionen',
      render: (v) => (
        <div className={`quick ${v}`}>
          {QUICK_ACTIONS.map((a) => (
            <a key={a.label} href={a.href} title={a.label}>
              <span aria-hidden>{a.icon}</span>
              {v !== 'kompakt' && ` ${a.label}`}
            </a>
          ))}
        </div>
      ),
    },
    notes: {
      title: '📝 Letzte Notizen',
      link: ['#/notizen', 'Alle →'],
      render: (v) => notes.length === 0 ? <Empty>Keine Notizen.</Empty> : (
        <ul className="list">
          {notes.slice(0, pick(v, 3, 6, 8)).map((n) => (
            <li key={n.id} className={v === 'detail' ? 'col' : ''}>
              <a href={`#/notizen/${n.id}`}>{noteTitle(n)}</a>
              {v === 'detail' && (
                <>
                  <div className="meta"><CourseBadge id={n.courseId} /><span>{new Date(n.updated).toLocaleDateString('de-DE')}</span></div>
                  {n.content && <p className="muted small clamp">{n.content}</p>}
                </>
              )}
            </li>
          ))}
        </ul>
      ),
    },
    music: { title: null, render: (v) => <SpotifyPlayer compact variant={v} /> },
    tools: {
      title: '🧰 Nützliche Tools',
      link: ['#/tools', 'Verwalten →'],
      render: (v) => v === 'kompakt' ? (
        <div className="row wrap">
          {data.tools.map((tool) => {
            const url = safeHttpUrl(tool.url);
            return url ? <a key={tool.id} className="chip" href={url} target="_blank" rel="noopener noreferrer">{tool.name}</a> : null;
          })}
        </div>
      ) : (
        <ToolLinks tools={v === 'standard' ? data.tools.slice(0, 8) : data.tools} />
      ),
    },
    tasks: {
      title: '✅ Aufgaben',
      link: ['#/aufgaben', 'Alle →'],
      render: (v) => v === 'kompakt' ? <TaskList tasks={upNext.slice(0, 6)} compact /> : (
        <>
          <TaskForm compact />
          <TaskList tasks={v === 'detail' ? open : upNext} />
        </>
      ),
    },
    projects: {
      title: '🚀 Aktive Projekte',
      link: ['#/projekte', 'Alle →'],
      render: (v) => activeProjects.length === 0 ? <Empty>Keine aktiven Projekte.</Empty> : v === 'kompakt' ? (
        <ul className="list">{activeProjects.map((p) => <ProjectRow key={p.id} id={p.id} title={p.title} />)}</ul>
      ) : (
        <div className="gallery small-cards">
          {activeProjects.map((p) => (
            <div key={p.id} className="col">
              <ProjectCard project={p} />
              {v === 'detail' && p.description && <p className="muted small">{p.description}</p>}
            </div>
          ))}
        </div>
      ),
    },
    transactions: {
      title: '💸 Letzte Buchungen',
      link: ['#/finanzen', 'Finanzen →'],
      render: (v) => (
        <>
          {v === 'detail' && (
            <div className="row wrap small">
              <span>Einnahmen <strong className="positive">{formatMoney(month.income)}</strong></span>
              <span>Ausgaben <strong>{formatMoney(month.expenses)}</strong></span>
              <span>Saldo <strong>{formatMoney(month.balance)}</strong></span>
            </div>
          )}
          <TransactionList txs={sortTx(data.transactions).slice(0, pick(v, 3, 5, 10))} />
        </>
      ),
    },
    watching: { title: '📺 Gerade am Schauen', link: ['#/schauen', 'Alle →'], render: media(watching, 'Nichts am Laufen.') },
    reading: { title: '📖 Gerade am Lesen', link: ['#/lesen', 'Alle →'], render: media(reading, 'Kein Buch offen.') },
    habits: { title: '✨ Gewohnheiten heute', link: ['#/gewohnheiten', 'Alle →'], render: (v) => <HabitsToday variant={v} /> },
    review: { title: '🌟 Wie geht\'s dir?', link: ['#/rueckblick', 'Rückblick →'], render: (v) => <ReviewWidget variant={v} /> },
    shopping: { title: '🛒 Einkaufsliste', link: ['#/einkauf', 'Öffnen →'], render: (v) => <ShoppingWidget variant={v} /> },
    meals: { title: '🍽️ Essen', link: ['#/essen', 'Plan →'], render: (v) => <MealsWidget variant={v} /> },
    birthdays: { title: '🎂 Geburtstage', link: ['#/menschen', 'Alle →'], render: (v) => <BirthdaysWidget variant={v} /> },
    trip: { title: '✈️ Nächste Reise', link: ['#/reisen', 'Reisen →'], variants: ['standard'], render: () => <TripWidget /> },
    stack: { title: null, variants: ['standard'], render: () => <SmartStack /> },
    today: { title: null, variants: ['standard'], render: () => <TodayWidget /> },
    countdown: { title: null, variants: ['standard'], render: () => <CountdownWidget /> },
    budget: { title: '💳 Budget', link: ['#/finanzen', 'Finanzen →'], render: (v) => <BudgetWidget variant={v} /> },
    focus: { title: '⏱️ Fokus', link: ['#/fokus', 'Öffnen →'], render: () => <FocusWidget /> },
    rings: { title: '⭕ Aktivitätsringe', link: ['#/gewohnheiten', 'Details →'], render: (v) => <RingsWidget variant={v} /> },
    period: { title: '⏳ Fortschritt', render: (v) => <PeriodBars variant={v} /> },
    exams: {
      title: '📅 Anstehende Prüfungen',
      link: ['#/pruefungen', 'Alle →'],
      render: (v) => exams.length === 0 ? <Empty>Keine Prüfungen.</Empty> : v === 'kompakt' ? (
        <div className="countdown">
          <span className="countdown-value">{relativeLabel(exams[0].date, t)}</span>
          <span className="muted">{exams[0].title}</span>
        </div>
      ) : (
        <ul className="list">
          {exams.slice(0, v === 'detail' ? 20 : 3).map((e) => (
            <li key={e.id}>
              <div className="grow">
                <div className="task-title">{e.title}</div>
                <div className="meta">
                  <CourseBadge id={e.courseId} />
                  {v === 'detail' && <span>{formatDate(e.date)}{e.time && `, ${e.time} Uhr`}{e.location && ` · ${e.location}`}</span>}
                </div>
              </div>
              <strong>{relativeLabel(e.date, t)}</strong>
            </li>
          ))}
        </ul>
      ),
    },
    trainings: {
      title: '🏋️ Letzte Trainings',
      link: ['#/training', 'Alle →'],
      render: (v) => (
        <>
          {v === 'detail' && <p className="small">{workouts30} Trainings in den letzten 30 Tagen</p>}
          <WorkoutList workouts={workouts.slice(0, pick(v, 3, 5, 10))} />
        </>
      ),
    },
    calendar: {
      title: '🗓️ Kalender',
      link: ['#/kalender', 'Groß anzeigen →'],
      render: (v) => v === 'kompakt' ? <Agenda days={7} /> : (
        <>
          <CalendarView />
          {v === 'detail' && <Agenda days={14} />}
        </>
      ),
    },
    courses: {
      title: '📚 Kurse',
      link: ['#/kurse', 'Alle →'],
      render: (v) => data.courses.length === 0 ? <Empty>Leg deinen ersten Kurs an.</Empty> : v === 'kompakt' ? (
        <div className="row wrap">
          {data.courses.map((c) => <a key={c.id} className="chip" href={`#/kurse/${c.id}`} style={{ borderColor: c.color }}>{c.name}</a>)}
        </div>
      ) : (
        <div className="course-grid">
          {data.courses.map((c) => {
            const tasks = data.tasks.filter((x) => x.courseId === c.id);
            const done = tasks.filter((x) => x.status === 'erledigt').length;
            const nextExam = exams.find((e) => e.courseId === c.id);
            return (
              <a key={c.id} className="course-card" href={`#/kurse/${c.id}`} style={{ ['--c' as string]: c.color }}>
                <strong>{c.name}</strong>
                <span className="muted">{c.code} · {c.ects} ECTS</span>
                <Progress value={tasks.length ? (done / tasks.length) * 100 : 0} color={c.color} />
                <span className="muted small">{done} von {tasks.length} Aufgaben erledigt</span>
                {v === 'detail' && (
                  <span className="small">
                    Note {formatGrade(courseGrade(data.grades, c.id), 1)}
                    {nextExam && ` · Prüfung ${relativeLabel(nextExam.date, t)}`}
                  </span>
                )}
              </a>
            );
          })}
        </div>
      ),
    },
    albums: {
      title: '📸 Letzte Alben',
      link: ['#/alben', 'Alle →'],
      render: (v) => albums.length === 0 ? <Empty>Noch keine Alben.</Empty> : v === 'kompakt' ? (
        <div className="thumbs">
          {albums.slice(0, 6).map((a) => <a key={a.id} href="#/alben" title={a.title}><Cover src={a.cover} seed={a.id} emoji="📸" /></a>)}
        </div>
      ) : (
        <div className="gallery">{albums.slice(0, v === 'detail' ? 12 : 4).map((a) => <AlbumCard key={a.id} album={a} />)}</div>
      ),
    },
    vision: { title: '🌄 Vision Board', link: ['#/ziele', 'Ziele →'], render: (v) => <VisionBoard variant={v} /> },
  };
}

/**
 * Lückenloses Raster: Jeder Kasten belegt so viele 4-px-Zeilen, wie er hoch ist.
 * Mit `grid-auto-flow: dense` rutschen kleinere Kästen in frei gebliebene Lücken.
 */
function useMasonry(ref: React.RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    const ROW = 4;
    const GAP = 16;
    const layout = () => {
      for (const item of Array.from(grid.children) as HTMLElement[]) {
        const inner = item.firstElementChild as HTMLElement | null;
        if (!inner) continue;
        item.style.gridRowEnd = `span ${Math.max(1, Math.ceil((inner.getBoundingClientRect().height + GAP) / ROW))}`;
      }
    };
    const ro = new ResizeObserver(layout);
    ro.observe(grid);
    for (const item of Array.from(grid.children)) if (item.firstElementChild) ro.observe(item.firstElementChild);
    layout();
    return () => ro.disconnect();
  });
}

function EditBar({ widget, def, index, layout, onChange, onDragStart }: { widget: WidgetConfig; def: WidgetDef; index: number; layout: WidgetConfig[]; onChange: (l: WidgetConfig[]) => void; onDragStart: (e: React.PointerEvent) => void }) {
  const set = (patch: Partial<WidgetConfig>) => onChange(layout.map((w) => (w.id === widget.id ? { ...w, ...patch } : w)));
  const variants = def.variants ?? (['kompakt', 'standard', 'detail'] as WidgetVariant[]);
  return (
    <div className="edit-bar">
      <div className="row edit-head">
        <button type="button" className="drag-handle" onPointerDown={onDragStart} aria-label={`${stripEmoji(WIDGET_LABELS[widget.id])} verschieben (ziehen)`} title="Zum Verschieben ziehen">⠿</button>
        <strong className="edit-title small">{WIDGET_ICONS[widget.id] && <Icon icon={WIDGET_ICONS[widget.id]!} size={15} />} {stripEmoji(WIDGET_LABELS[widget.id])}</strong>
      </div>
      <div className="edit-controls">
        <button onClick={() => onChange(moveItem(layout, index, -1))} aria-label="Nach vorn" title="Nach vorn">←</button>
        <button onClick={() => onChange(moveItem(layout, index, 1))} aria-label="Nach hinten" title="Nach hinten">→</button>
        <select value={widget.size} onChange={(e) => set({ size: e.target.value as WidgetConfig['size'] })} aria-label="Breite">
          {SIZES.map((s) => <option key={s.size} value={s.size}>{s.label}</option>)}
        </select>
        <select value={widget.height} onChange={(e) => set({ height: e.target.value as WidgetConfig['height'] })} aria-label="Höhe">
          {HEIGHTS.map((h) => <option key={h.height} value={h.height}>{h.label}</option>)}
        </select>
        <select value={variants.includes(widget.variant) ? widget.variant : 'standard'} onChange={(e) => set({ variant: e.target.value as WidgetVariant })} aria-label="Ansicht">
          {variants.map((v) => <option key={v} value={v}>{VARIANT_LABELS[v]}</option>)}
        </select>
        <button onClick={() => set({ hidden: true })} title="Ausblenden">Ausblenden</button>
      </div>
    </div>
  );
}

export function Dashboard({ editing }: { editing: boolean }) {
  const { data, updateSettings } = useStore();
  const widgets = useWidgets();
  const layout = mergeWithDefaults(normalizeWidgets(data.settings.dashboard), DEFAULT_DASHBOARD, 'id');
  const save = (l: WidgetConfig[]) => updateSettings({ dashboard: l });
  const grid = useRef<HTMLDivElement>(null);
  useMasonry(grid);
  const hidden = layout.filter((w) => w.hidden);
  const { timer } = useFocus();
  const [showAll, setShowAll] = useState(false);
  const mode = focusMode(timer.config.mode);
  const focusing = !editing && !showAll && timer.active && timer.phase === 'fokus' && timer.config.filterDashboard;
  const visible = (id: WidgetId) => !focusing || mode.widgets.includes(id);
  const filtered = focusing ? layout.filter((w) => !w.hidden && !visible(w.id)).length : 0;
  const [gallery, setGallery] = useState(false);
  const { drag, start } = useDragReorder((from, to) =>
    save(moveTo(layout, layout.findIndex((w) => w.id === from), layout.findIndex((w) => w.id === to))),
  );
  const renderWidget = (id: WidgetId, v: WidgetVariant) => {
    const def = widgets[id];
    const variant = def.variants && !def.variants.includes(v) ? 'standard' : v;
    const body = def.render(variant);
    return def.title === null ? body : <Panel title={stripEmoji(def.title) || undefined} icon={WIDGET_ICONS[id]}>{body}</Panel>;
  };
  const addWidget = (id: WidgetId, size: WidgetSize) => {
    const rest = layout.filter((w) => w.id !== id);
    // Nach den ganz breiten Leisten oben einfügen, damit es gleich sichtbar ist
    let at = 0;
    while (at < rest.length && (rest[at].size === 'full' || rest[at].hidden)) at++;
    const item = { ...layout.find((w) => w.id === id)!, hidden: false, size };
    save([...rest.slice(0, at), item, ...rest.slice(at)]);
    setGallery(false);
  };

  return (
    <>
      <Banner editing={editing} />
      {focusing && filtered > 0 && (
        <div className="focus-banner" style={{ ['--mode' as string]: mode.color }} role="status">
          <span>{mode.icon} Fokus: {mode.label} – {filtered} Kästen ausgeblendet</span>
          <button type="button" onClick={() => setShowAll(true)}>Alle zeigen</button>
        </div>
      )}
      {editing ? (
        <Panel
          title="🧩 Dashboard bearbeiten"
          actions={
            <div className="row">
              <button className="primary" onClick={() => setGallery(true)}>+ Widget hinzufügen{hidden.length > 0 && ` (${hidden.length})`}</button>
              <button onClick={() => confirm('Kästen auf den Standard zurücksetzen?') && save([])}>Kästen zurücksetzen</button>
              <a className="button primary" href="#/dashboard">Fertig</a>
            </div>
          }
        >
          <p className="muted small">
            Zum Anordnen ein Widget am Griff ⠿ ziehen (oder mit ← →). Pro Widget wählst du Breite, Höhe und Ansicht (kompakt, Standard oder mit mehr Details).
            Über „+ Widget hinzufügen“ holst du ausgeblendete Widgets mit Vorschau zurück.
            Auf kleineren Bildschirmen ordnen sich die Kästen automatisch um.
          </p>
          <div className="form-grid">
            <label>Dein Name<input value={data.settings.name} onChange={(e) => updateSettings({ name: e.target.value })} /></label>
            <label className="full">Titelbild<ImageInput value={data.settings.cover} onChange={(cover) => updateSettings({ cover })} /></label>
          </div>
          <h3>🎨 Design</h3>
          <AppearanceEditor />
        </Panel>
      ) : null}

      <div ref={grid} className={`dash-grid ${editing ? 'editing' : ''}`}>
        {layout.map((w, index) => {
          if (w.hidden || !visible(w.id)) return null;
          const def = widgets[w.id];
          const variant = def.variants && !def.variants.includes(w.variant) ? 'standard' : w.variant;
          const body = def.render(variant);
          const content =
            def.title === null ? body : (
              <Panel title={stripEmoji(def.title) || undefined} icon={WIDGET_ICONS[w.id]} actions={def.link && !editing ? <a href={def.link[0]}>{def.link[1]}</a> : undefined}>
                {body}
              </Panel>
            );
          return (
            <div
              key={w.id}
              data-widget={w.id}
              className={`tile w-${w.size} ${drag?.id === w.id ? 'dragging' : ''} ${drag && drag.over === w.id && drag.id !== w.id ? 'drop-target' : ''}`}
            >
              <div className={`tile-inner h-${w.height} ${editing ? 'editable' : ''}`}>
                {editing && <EditBar widget={w} def={def} index={index} layout={layout} onChange={save} onDragStart={start(w.id)} />}
                <div className="tile-body">{content}</div>
              </div>
            </div>
          );
        })}
      </div>
      {gallery && <WidgetGallery layout={layout} render={renderWidget} onAdd={addWidget} onClose={() => setGallery(false)} />}
    </>
  );
}
