import { useState } from 'react';
import { useStore } from '../store';
import type { Course, ID } from '../types';
import { courseGrade, formatGrade } from '../lib/grades';
import { addDays, formatDate, hours, relativeLabel, today } from '../lib/dates';
import { isDue } from '../lib/srs';
import { TaskForm, TaskList } from '../components/TaskList';
import { Empty, PageHeader, Panel, Progress } from '../components/ui';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7', '#ec4899', '#64748b'];

type CourseDraft = Omit<Course, 'id'>;

const blank = (n: number): CourseDraft => ({
  name: '', code: '', semester: '', lecturer: '', room: '', ects: 5, color: COLORS[n % COLORS.length],
});

function CourseForm({ initial, onSave, onCancel }: { initial: CourseDraft; onSave: (c: CourseDraft) => void; onCancel?: () => void }) {
  const [c, setC] = useState(initial);
  const set = <K extends keyof CourseDraft>(k: K, v: CourseDraft[K]) => setC((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        if (c.name.trim()) onSave({ ...c, name: c.name.trim() });
      }}
    >
      <label>Name<input value={c.name} onChange={(e) => set('name', e.target.value)} required /></label>
      <label>Kürzel<input value={c.code} onChange={(e) => set('code', e.target.value)} /></label>
      <label>Semester<input value={c.semester} onChange={(e) => set('semester', e.target.value)} placeholder="WiSe 26/27" /></label>
      <label>Dozent/in<input value={c.lecturer} onChange={(e) => set('lecturer', e.target.value)} /></label>
      <label>Raum<input value={c.room} onChange={(e) => set('room', e.target.value)} /></label>
      <label>ECTS<input type="number" min={0} step={0.5} value={c.ects} onChange={(e) => set('ects', Number(e.target.value))} /></label>
      <label>Farbe<input type="color" value={c.color} onChange={(e) => set('color', e.target.value)} /></label>
      <div className="row end">
        {onCancel && <button type="button" onClick={onCancel}>Abbrechen</button>}
        <button className="primary" type="submit">Speichern</button>
      </div>
    </form>
  );
}

export function Courses() {
  const { data, add } = useStore();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeader
        title="Kurse"
        subtitle={`${data.courses.length} Kurse · ${data.courses.reduce((s, c) => s + c.ects, 0)} ECTS`}
        actions={!adding && <button className="primary" onClick={() => setAdding(true)}>+ Kurs</button>}
      />
      {adding && (
        <Panel title="Neuer Kurs">
          <CourseForm
            initial={blank(data.courses.length)}
            onCancel={() => setAdding(false)}
            onSave={(c) => {
              add('courses', c);
              setAdding(false);
            }}
          />
        </Panel>
      )}
      {data.courses.length === 0 && !adding ? (
        <Empty>Noch keine Kurse.</Empty>
      ) : (
        <div className="course-grid">
          {data.courses.map((c) => {
            const tasks = data.tasks.filter((x) => x.courseId === c.id);
            const done = tasks.filter((x) => x.status === 'erledigt').length;
            const grade = courseGrade(data.grades, c.id);
            return (
              <a key={c.id} className="course-card" href={`#/kurse/${c.id}`} style={{ ['--c' as string]: c.color }}>
                <strong>{c.name}</strong>
                <span className="muted">{[c.code, c.semester].filter(Boolean).join(' · ')}</span>
                <span className="muted small">{c.lecturer}{c.room && ` · ${c.room}`}</span>
                <Progress value={tasks.length ? (done / tasks.length) * 100 : 0} color={c.color} />
                <span className="row between small">
                  <span>{done}/{tasks.length} Aufgaben</span>
                  <span>Note {formatGrade(grade, 1)}</span>
                </span>
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}

export function CourseDetail({ id }: { id: ID }) {
  const { data, update, removeCourse } = useStore();
  const [editing, setEditing] = useState(false);
  const course = data.courses.find((c) => c.id === id);
  if (!course) return <Empty>Kurs nicht gefunden. <a href="#/kurse">Zurück zu den Kursen</a></Empty>;

  const t = today();
  const tasks = data.tasks.filter((x) => x.courseId === id);
  const notes = data.notes.filter((x) => x.courseId === id);
  const cards = data.cards.filter((x) => x.courseId === id);
  const exams = data.exams.filter((x) => x.courseId === id).sort((a, b) => a.date.localeCompare(b.date));
  const grades = data.grades.filter((x) => x.courseId === id);
  const grade = courseGrade(data.grades, id);
  const courseSessions = data.sessions.filter((x) => x.courseId === id);
  const totalFocus = courseSessions.reduce((sum, x) => sum + x.minutes, 0);
  const weekFocus = courseSessions.filter((x) => x.date >= addDays(t, -6)).reduce((sum, x) => sum + x.minutes, 0);

  return (
    <>
      <PageHeader
        title={course.name}
        subtitle={[course.code, course.semester, course.lecturer, course.room, `${course.ects} ECTS`].filter(Boolean).join(' · ')}
        actions={
          <>
            <button onClick={() => setEditing((e) => !e)}>{editing ? 'Schließen' : 'Bearbeiten'}</button>
            <button
              className="danger"
              onClick={() => {
                if (confirm(`„${course.name}“ mit allen Aufgaben, Notizen, Karten, Prüfungen und Noten löschen?`)) {
                  removeCourse(id);
                  location.hash = '#/kurse';
                }
              }}
            >
              Löschen
            </button>
          </>
        }
      />
      <div className="color-bar" style={{ background: course.color }} />
      {editing && (
        <Panel title="Kurs bearbeiten">
          <CourseForm
            initial={course}
            onSave={(c) => {
              update('courses', id, c);
              setEditing(false);
            }}
          />
        </Panel>
      )}

      <div className="grid-2">
        <Panel title="Aufgaben">
          <TaskForm courseId={id} />
          <TaskList tasks={tasks} showCourse={false} />
        </Panel>
        <div className="stack">
          <Panel title="Prüfungen" actions={<a href="#/pruefungen">Verwalten →</a>}>
            {exams.length === 0 ? <Empty>Keine Prüfungen.</Empty> : (
              <ul className="list">
                {exams.map((e) => (
                  <li key={e.id}>
                    <span className="grow">{e.title}<br /><span className="muted small">{formatDate(e.date)}</span></span>
                    <strong>{relativeLabel(e.date, t)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="⏱️ Lernzeit" actions={<a href="#/fokus">Fokus starten →</a>}>
            <p>
              Diese Woche <strong>{hours(weekFocus)} Std.</strong> · insgesamt <strong>{hours(totalFocus)} Std.</strong>
            </p>
          </Panel>
          <Panel title="Lernkarten" actions={<a href={`#/lernen/${id}`}>Lernen →</a>}>
            <p>{cards.length} Karten, davon <strong>{cards.filter((c) => isDue(c, t)).length}</strong> heute fällig.</p>
          </Panel>
          <Panel title="Noten" actions={<a href="#/noten">Verwalten →</a>}>
            <p>Kursnote: <strong>{formatGrade(grade)}</strong></p>
            {grades.length > 0 && (
              <ul className="list">
                {grades.map((g) => (
                  <li key={g.id}><span className="grow">{g.title}</span><span>{formatGrade(g.value, 1)} · {g.weight} %</span></li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Notizen" actions={<a href="#/notizen">Alle Notizen →</a>}>
            {notes.length === 0 ? <Empty>Keine Notizen.</Empty> : (
              <ul className="list">
                {notes.map((n) => <li key={n.id}><a href={`#/notizen/${n.id}`}>{n.title || 'Ohne Titel'}</a></li>)}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
