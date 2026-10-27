import { useStore } from '../store';
import { addDays, formatDate, hours, relativeLabel, today } from '../lib/dates';
import { formatGrade, summary } from '../lib/grades';
import { isDue } from '../lib/srs';
import { TaskForm, TaskList } from '../components/TaskList';
import { CourseBadge, Empty, PageHeader, Panel, Progress, Stat } from '../components/ui';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Guten Morgen';
  if (h < 18) return 'Hallo';
  return 'Guten Abend';
}

export function Dashboard() {
  const { data } = useStore();
  const t = today();
  const weekEnd = addDays(t, 7);

  const open = data.tasks.filter((x) => x.status !== 'erledigt');
  const thisWeek = open.filter((x) => x.due !== null && x.due <= weekEnd);
  // Ohne Datum notierte Aufgaben (z. B. aus der Schnellnotiz) sollen nicht aus dem Blick geraten
  const upNext = open.filter((x) => x.due === null || x.due <= weekEnd);
  const dueCards = data.cards.filter((c) => isDue(c, t)).length;
  const exams = [...data.exams].filter((e) => e.date >= t).sort((a, b) => a.date.localeCompare(b.date));
  const { truncated } = summary(data.courses, data.grades);
  const weekStart = addDays(t, -6);
  const focusMinutes = data.sessions.filter((s) => s.date >= weekStart && s.date <= t).reduce((s, x) => s + x.minutes, 0);

  return (
    <>
      <PageHeader title={`${greeting()} 👋`} subtitle={formatDate(t)} />

      <div className="stats">
        <Stat label="Offene Aufgaben" value={open.length} hint={`${thisWeek.length} diese Woche`} href="#/aufgaben" />
        <Stat label="Karten fällig" value={dueCards} hint="heute wiederholen" href="#/lernen" />
        <Stat
          label="Nächste Prüfung"
          value={exams[0] ? relativeLabel(exams[0].date, t) : '–'}
          hint={exams[0]?.title}
          href="#/pruefungen"
        />
        <Stat label="Notenschnitt" value={formatGrade(truncated, 1)} hint={`${hours(focusMinutes)} h Fokus (7 Tage)`} href="#/noten" />
      </div>

      <Panel title="Schnellnotiz">
        <TaskForm compact />
      </Panel>

      <div className="grid-2">
        <Panel title="Als Nächstes (7 Tage & ohne Datum)" actions={<a href="#/aufgaben">Alle Aufgaben →</a>}>
          <TaskList tasks={upNext} />
        </Panel>

        <div className="stack">
          <Panel title="Anstehende Prüfungen">
            {exams.length === 0 ? (
              <Empty>Keine Prüfungen eingetragen.</Empty>
            ) : (
              <ul className="list">
                {exams.slice(0, 4).map((e) => (
                  <li key={e.id}>
                    <div className="grow">
                      <div className="task-title">{e.title}</div>
                      <div className="meta">
                        <CourseBadge id={e.courseId} />
                        <span>{formatDate(e.date)}{e.time && `, ${e.time}`}</span>
                      </div>
                    </div>
                    <strong>{relativeLabel(e.date, t)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Ziele" actions={<a href="#/ziele">Vision Board →</a>}>
            {data.goals.length === 0 ? (
              <Empty>Noch keine Ziele.</Empty>
            ) : (
              <ul className="list">
                {data.goals.slice(0, 4).map((g) => (
                  <li key={g.id} className="col">
                    <div className="row between">
                      <span>{g.title}</span>
                      <span className="muted">{g.progress} %</span>
                    </div>
                    <Progress value={g.progress} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Kurse" actions={<a href="#/kurse">Alle Kurse →</a>}>
        {data.courses.length === 0 ? (
          <Empty>Leg deinen ersten Kurs an, um loszulegen.</Empty>
        ) : (
          <div className="course-grid">
            {data.courses.map((c) => {
              const tasks = data.tasks.filter((x) => x.courseId === c.id);
              const done = tasks.filter((x) => x.status === 'erledigt').length;
              return (
                <a key={c.id} className="course-card" href={`#/kurse/${c.id}`} style={{ ['--c' as string]: c.color }}>
                  <strong>{c.name}</strong>
                  <span className="muted">{c.code} · {c.ects} ECTS</span>
                  <Progress value={tasks.length ? (done / tasks.length) * 100 : 0} color={c.color} />
                  <span className="muted small">{done} von {tasks.length} Aufgaben erledigt</span>
                </a>
              );
            })}
          </div>
        )}
      </Panel>
    </>
  );
}
