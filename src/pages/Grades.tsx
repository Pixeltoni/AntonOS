import { useState } from 'react';
import { useStore } from '../store';
import type { Course } from '../types';
import { courseGrade, formatGrade, gradeLabel, PASS_LIMIT, summary } from '../lib/grades';
import { Empty, PageHeader, Panel, Progress, Stat } from '../components/ui';

function GradeForm({ course }: { course: Course }) {
  const { add } = useStore();
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [weight, setWeight] = useState('100');

  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        const v = Number(value.replace(',', '.'));
        const w = Number(weight);
        if (!title.trim() || !(v >= 1 && v <= 5) || !(w > 0)) return;
        add('grades', { courseId: course.id, title: title.trim(), value: v, weight: w });
        setTitle('');
        setValue('');
      }}
    >
      <input className="grow" placeholder="Leistung, z. B. Klausur" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Leistung" />
      <input className="narrow" placeholder="Note" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Note (1,0–5,0)" />
      <label className="row">
        <input className="narrow" type="number" min={1} value={weight} onChange={(e) => setWeight(e.target.value)} aria-label="Gewichtung in Prozent" /> %
      </label>
      <button type="submit">Hinzufügen</button>
    </form>
  );
}

export function Grades() {
  const { data, remove } = useStore();
  const s = summary(data.courses, data.grades);

  return (
    <>
      <PageHeader title="Noten" subtitle="Deutsches Notensystem, Schnitt nach ECTS gewichtet" />
      <div className="stats">
        <Stat label="Notenschnitt" value={formatGrade(s.truncated, 1)} hint={s.average === null ? 'noch keine Noten' : `exakt ${formatGrade(s.average)} · ${gradeLabel(s.average)}`} />
        <Stat label="ECTS erreicht" value={s.earnedEcts} hint={`von ${s.plannedEcts} geplant`} />
      </div>
      {s.plannedEcts > 0 && (
        <Panel>
          <Progress value={(s.earnedEcts / s.plannedEcts) * 100} />
        </Panel>
      )}
      {data.courses.length === 0 && <Empty>Leg zuerst <a href="#/kurse">Kurse</a> an, um Noten einzutragen.</Empty>}
      {data.courses.map((c) => {
        const own = data.grades.filter((g) => g.courseId === c.id);
        const grade = courseGrade(data.grades, c.id);
        const weightSum = own.reduce((sum, g) => sum + g.weight, 0);
        return (
          <Panel
            key={c.id}
            title={c.name}
            actions={
              <span className={grade !== null && grade > PASS_LIMIT ? 'danger' : 'muted'}>
                {c.ects} ECTS · Kursnote <strong>{formatGrade(grade)}</strong>
              </span>
            }
          >
            {own.length > 0 && (
              <ul className="list">
                {own.map((g) => (
                  <li key={g.id}>
                    <span className="grow">{g.title}</span>
                    <span>{formatGrade(g.value, 1)}</span>
                    <span className="muted">{g.weight} %</span>
                    <button className="icon" onClick={() => remove('grades', g.id)} aria-label="Löschen" title="Löschen">×</button>
                  </li>
                ))}
              </ul>
            )}
            {own.length > 0 && weightSum !== 100 && (
              <p className="muted small">Gewichtungen ergeben {weightSum} % – die Kursnote wird anteilig berechnet.</p>
            )}
            <GradeForm course={c} />
          </Panel>
        );
      })}
    </>
  );
}
