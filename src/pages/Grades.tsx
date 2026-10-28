import { useState } from 'react';
import { useStore } from '../store';
import type { Course, Grade, ID } from '../types';
import { courseGrade, formatGrade, gradeLabel, PASS_LIMIT, summary } from '../lib/grades';
import { Empty, PageHeader } from '../components/ui';
import { Sheet } from '../components/sheet';

/** Prüft eine Note nach deutschem System. Gibt eine Fehlermeldung oder null zurück. */
export function checkGrade(raw: string, weightRaw: string): string | null {
  const v = Number(raw.replace(',', '.'));
  const w = Number(weightRaw.replace(',', '.'));
  if (!raw.trim()) return 'Bitte gib eine Note ein.';
  if (!Number.isFinite(v) || v < 1 || v > 5) return 'Noten gehen von 1,0 (sehr gut) bis 5,0 (nicht bestanden).';
  if (!(w > 0) || w > 100) return 'Die Gewichtung muss zwischen 1 und 100 % liegen.';
  return null;
}

const gradeColor = (v: number | null) => (v === null ? '#8E8E93' : v <= 1.5 ? '#34C759' : v <= 2.5 ? '#30B0C7' : v <= 3.5 ? '#FF9500' : v <= PASS_LIMIT ? '#FF9F0A' : '#FF3B30');

function GradeSheet({ course, grade, onClose }: { course: Course; grade?: Grade; onClose: () => void }) {
  const { add, update, remove } = useStore();
  const [title, setTitle] = useState(grade?.title ?? '');
  const [value, setValue] = useState(grade ? formatGrade(grade.value, 1) : '');
  const [weight, setWeight] = useState(String(grade?.weight ?? 100));
  const [error, setError] = useState('');
  return (
    <Sheet
      title={grade ? 'Note bearbeiten' : `Note · ${course.name}`}
      submitLabel={grade ? 'Sichern' : 'Hinzufügen'}
      onClose={onClose}
      onSubmit={() => {
        const problem = !title.trim() ? 'Bitte gib an, wofür die Note ist (z. B. Klausur).' : checkGrade(value, weight);
        if (problem) {
          setError(problem);
          return;
        }
        const final = { title: title.trim(), value: Number(value.replace(',', '.')), weight: Number(weight.replace(',', '.')) };
        if (grade) update('grades', grade.id, final);
        else add('grades', { courseId: course.id, ...final });
        onClose();
      }}
    >
      <label>Leistung<input autoFocus value={title} placeholder="z. B. Klausur, Projekt, Referat" onChange={(e) => setTitle(e.target.value)} /></label>
      <div className="modal-grid">
        <label>Note (1,0–5,0)<input inputMode="decimal" value={value} placeholder="z. B. 1,7" onChange={(e) => { setValue(e.target.value); setError(''); }} /></label>
        <label>Gewichtung in %<input inputMode="decimal" value={weight} onChange={(e) => { setWeight(e.target.value); setError(''); }} /></label>
      </div>
      <div className="grade-chips" role="group" aria-label="Schnellauswahl">
        {['1,0', '1,3', '1,7', '2,0', '2,3', '2,7', '3,0', '3,3', '3,7', '4,0', '5,0'].map((g) => (
          <button key={g} type="button" className={value === g ? 'on' : ''} onClick={() => { setValue(g); setError(''); }}>{g}</button>
        ))}
      </div>
      {error && <p className="danger small" role="alert">{error}</p>}
      {grade && (
        <button type="button" className="danger" onClick={() => { if (confirm('Note löschen?')) { remove('grades', grade.id); onClose(); } }}>Note löschen</button>
      )}
    </Sheet>
  );
}

function EctsRing({ earned, planned }: { earned: number; planned: number }) {
  const share = planned > 0 ? Math.min(1, earned / planned) : 0;
  const r = 50;
  const c = 2 * Math.PI * r;
  return (
    <svg width="124" height="124" viewBox="0 0 124 124" aria-hidden>
      <circle cx="62" cy="62" r={r} fill="none" stroke="var(--ring-track)" strokeWidth="14" />
      <circle cx="62" cy="62" r={r} fill="none" stroke="#34C759" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${share * c} ${c}`} transform="rotate(-90 62 62)" />
      <text x="62" y="68" textAnchor="middle" fontSize="20" fontWeight="700" fill="currentColor">{Math.round(share * 100)} %</text>
    </svg>
  );
}

export function Grades() {
  const { data } = useStore();
  const s = summary(data.courses, data.grades);
  const [sheet, setSheet] = useState<{ course: Course; grade?: Grade } | null>(null);
  const courseOf = (id: ID) => data.courses.find((c) => c.id === id)!;

  return (
    <>
      <PageHeader title="Noten" subtitle="Deutsches Notensystem, Schnitt nach ECTS gewichtet" />
      <div className="health-grid">
        <section className="health-tile" style={{ ['--h' as string]: '#5856D6' }}>
          <span className="health-label">🎓 Notenschnitt</span>
          <span className="health-value">{formatGrade(s.truncated, 1)}</span>
          <span className="muted small">{s.average === null ? 'Noch keine Noten eingetragen' : `exakt ${formatGrade(s.average)} · ${gradeLabel(s.average)}`}</span>
        </section>
        <section className="health-tile health-row" style={{ ['--h' as string]: '#34C759' }}>
          <EctsRing earned={s.earnedEcts} planned={s.plannedEcts} />
          <span className="col">
            <span className="health-label">📚 ECTS</span>
            <span className="health-value">{s.earnedEcts} <small>/ {s.plannedEcts}</small></span>
            <span className="muted small">bestanden von geplant</span>
          </span>
        </section>
      </div>
      {data.courses.length === 0 && <Empty>Leg zuerst <a href="#/kurse">Kurse</a> an, um Noten einzutragen.</Empty>}
      {data.courses.map((c) => {
        const own = data.grades.filter((g) => g.courseId === c.id);
        const grade = courseGrade(data.grades, c.id);
        const weightSum = own.reduce((sum, g) => sum + g.weight, 0);
        return (
          <section key={c.id} className="grade-group">
            <div className="grade-group-head">
              <span className="grade-course"><span className="exam-dot" style={{ background: c.color }} aria-hidden />{c.name}</span>
              <span className="muted small">{c.ects} ECTS</span>
              <span className="grade-pill" style={{ ['--g' as string]: gradeColor(grade) }}>{formatGrade(grade, 1)}</span>
            </div>
            <ul className="ios-list">
              {own.map((g) => (
                <li key={g.id}>
                  <button type="button" className="grow row-button" onClick={() => setSheet({ course: courseOf(g.courseId), grade: g })}>
                    <span className="task-title">{g.title}</span>
                    <span className="muted small">{g.weight} % der Kursnote</span>
                  </button>
                  <span className="grade-pill small" style={{ ['--g' as string]: gradeColor(g.value) }}>{formatGrade(g.value, 1)}</span>
                </li>
              ))}
              <li>
                <button type="button" className="row-button add-row" onClick={() => setSheet({ course: c })}>+ Note eintragen</button>
              </li>
            </ul>
            {own.length > 0 && weightSum !== 100 && (
              <p className="muted small grade-hint">Gewichtungen ergeben {weightSum} % – die Kursnote wird anteilig berechnet.</p>
            )}
          </section>
        );
      })}
      {sheet && <GradeSheet course={sheet.course} grade={sheet.grade} onClose={() => setSheet(null)} />}
    </>
  );
}
