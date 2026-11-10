import { useState } from 'react';
import { useStore } from '../store';
import type { Admission, Course, ExerciseSheet, Grade } from '../types';
import { courseGrade, courseNeed, degreeNeed, formatGrade, TARGET_STEPS, truncateGrade } from '../lib/grades';
import { admissionState, defaultAdmission, describeAdmission, nextSheetNumber, type AdmissionStatus } from '../lib/sheets';
import { addDays, formatDate, relativeLabel, today } from '../lib/dates';
import { formatNumber, parseNumber } from '../lib/training';
import { Sheet } from './sheet';
import { Sym } from './icons';

type Tone = 'ok' | 'warn' | 'bad' | '';

/** Auswahl eines Notenziels (1,0 … 4,0) */
function TargetSelect({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  return (
    <select className="goal-select" aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">kein Ziel</option>
      {TARGET_STEPS.map((s) => <option key={s} value={s}>{formatGrade(s, 1)}</option>)}
    </select>
  );
}

/** Satz zum Notenziel eines Kurses: was in den offenen Teilen noch nötig ist */
export function courseGoalText(course: Course, grades: Grade[]): { text: string; tone: Tone } | null {
  const target = course.target ?? null;
  if (target === null) return null;
  const need = courseNeed(grades, course.id, target);
  if (!need) {
    const g = courseGrade(grades, course.id);
    if (g === null) return null;
    const final = truncateGrade(g);
    return final <= target + 1e-9 ? { text: `Ziel erreicht: ${formatGrade(final, 1)}`, tone: 'ok' } : { text: `Ziel knapp verfehlt: ${formatGrade(final, 1)}`, tone: 'bad' };
  }
  const where = need.open >= 100 - 1e-6 ? 'Du brauchst' : `In den restlichen ${formatNumber(need.open)} % brauchst du`;
  if (need.needed === null) return { text: `${formatGrade(target, 1)} ist nicht mehr drin, bestenfalls ${formatGrade(need.best, 1)}.`, tone: 'bad' };
  if (need.needed >= 4) return { text: `Sicher: Jede bestandene Note reicht für ${formatGrade(target, 1)}.`, tone: 'ok' };
  return { text: `${where} mindestens eine ${formatGrade(need.needed, 1)}.`, tone: need.needed <= 1.3 ? 'warn' : '' };
}

/** Zeile „🎯 Ziel 2,0 – In den restlichen 70 % brauchst du mindestens eine 2,3.“ */
export function CourseGoal({ course }: { course: Course }) {
  const { data, update } = useStore();
  const info = courseGoalText(course, data.grades);
  return (
    <div className="goal-row">
      <span className="goal-label"><Sym emoji="🎯" size={13} /> Notenziel</span>
      <TargetSelect label={`Notenziel für ${course.name}`} value={course.target ?? null} onChange={(target) => update('courses', course.id, { target })} />
      {info && <span className={`goal-text ${info.tone}`}>{info.text}</span>}
    </div>
  );
}

/** Kachel „Ganzes Studium“: nötiger Schnitt in den restlichen ECTS */
export function DegreeGoal() {
  const { data, updateSettings } = useStore();
  const degree = { ects: 180, target: null, ...(data.settings.degree ?? {}) };
  const [ects, setEcts] = useState(String(degree.ects));
  const need = degree.target !== null ? degreeNeed(data.courses, data.grades, degree.ects, degree.target) : null;
  const save = (patch: Partial<typeof degree>) => updateSettings({ degree: { ...degree, ...patch } });

  let text = 'Wähle einen Wunsch-Schnitt, dann rechnet Daywerk rückwärts.';
  let tone: Tone = '';
  if (degree.target !== null) {
    const goal = formatGrade(degree.target, 1);
    if (!need) text = 'Alle ECTS sind benotet – oder die ECTS bis zum Abschluss sind zu niedrig eingestellt.';
    else if (need.needed === null) { text = `${goal} ist nicht mehr erreichbar, bestenfalls ${formatGrade(need.best, 1)}.`; tone = 'bad'; }
    else if (need.needed >= 4) { text = `${goal} ist sicher: Jede bestandene Note reicht.`; tone = 'ok'; }
    else { text = `Für ${goal} brauchst du in den restlichen ${formatNumber(need.open)} ECTS im Schnitt ${formatGrade(need.needed, 1)} oder besser.`; tone = need.needed <= 1.3 ? 'warn' : ''; }
  }

  return (
    <section className="health-tile degree-goal" style={{ ['--h' as string]: '#5856D6' }}>
      <span className="health-label"><Sym emoji="🎯" size={14} /> Notenziel fürs Studium</span>
      <p className={`goal-text big ${tone}`}>{text}</p>
      {need?.current != null && <span className="muted small">Bisher {formatGrade(need.current)} aus {formatNumber(need.graded)} ECTS</span>}
      <div className="degree-inputs">
        <label>Wunsch-Schnitt<TargetSelect label="Wunsch-Schnitt fürs Studium" value={degree.target} onChange={(target) => save({ target })} /></label>
        <label>ECTS bis zum Abschluss
          <input
            inputMode="numeric"
            value={ects}
            onChange={(e) => setEcts(e.target.value)}
            onBlur={() => {
              const n = Math.round(parseNumber(ects) ?? 0);
              if (n > 0 && n <= 600) save({ ects: n });
              else setEcts(String(degree.ects));
            }}
          />
        </label>
      </div>
    </section>
  );
}

/* ---------- Übungsblätter und Klausurzulassung ---------- */

const STATUS_COLOR: Record<AdmissionStatus, string> = {
  geschafft: '#34C759', 'auf Kurs': '#34C759', knapp: '#FF9500', unmöglich: '#FF3B30', offen: '#8E8E93',
};

/** Balken: erreicht, Hochrechnung und die Grenze der Zulassung */
function AdmissionBar({ course, sheets }: { course: Course; sheets: ExerciseSheet[] }) {
  const s = admissionState(course.admission!, sheets);
  const of = (n: number) => `${s.total > 0 ? Math.min(100, (n / s.total) * 100) : 0}%`;
  return (
    <div className="adm">
      <div className="adm-head">
        <strong>{formatNumber(s.earned)} von {formatNumber(s.required)} Punkten</strong>
        <span className="adm-status" style={{ ['--c' as string]: STATUS_COLOR[s.status] }}>{s.status}</span>
      </div>
      <div className="adm-bar" role="img" aria-label={`${formatNumber(s.earned)} von ${formatNumber(s.total)} Punkten, Zulassung ab ${formatNumber(s.required)}`} style={{ ['--c' as string]: course.color }}>
        <i style={{ width: of(s.earned) }} />
        {s.status !== 'geschafft' && s.share !== null && <u style={{ left: of(s.earned), width: of(Math.max(0, s.projected - s.earned)) }} />}
        <em style={{ left: of(s.required) }} />
      </div>
      <p className="muted small">{describeAdmission(s)}</p>
    </div>
  );
}

function SheetEditor({ course, sheet, onClose }: { course: Course; sheet?: ExerciseSheet; onClose: () => void }) {
  const { data, add, update, remove } = useStore();
  const own = data.sheets.filter((s) => s.courseId === course.id);
  const admission = course.admission ?? defaultAdmission();
  const last = [...own].filter((s) => s.due).sort((a, b) => (b.due ?? '').localeCompare(a.due ?? ''))[0];
  const [number, setNumber] = useState(String(sheet?.number ?? nextSheetNumber(own)));
  const [due, setDue] = useState(sheet?.due ?? (last?.due ? addDays(last.due, 7) : addDays(today(), 7)));
  const [time, setTime] = useState(sheet?.dueTime ?? last?.dueTime ?? '');
  const [points, setPoints] = useState(sheet?.points != null ? formatNumber(sheet.points) : '');
  const [max, setMax] = useState(formatNumber(sheet?.max ?? admission.maxPerSheet));
  const task = sheet?.taskId ? data.tasks.find((t) => t.id === sheet.taskId) : undefined;

  const save = () => {
    const n = Math.max(1, Math.round(parseNumber(number) ?? 1));
    const m = Math.max(1, parseNumber(max) ?? admission.maxPerSheet);
    const p = points.trim() ? Math.min(m, parseNumber(points) ?? 0) : null;
    const title = `Übungsblatt ${n}`;
    if (sheet) {
      update('sheets', sheet.id, { number: n, due: due || null, dueTime: time || undefined, points: p, max: m });
      if (task) {
        // Mit Punkten ist das Blatt offensichtlich abgegeben
        update('tasks', task.id, { title, due: due || null, dueTime: time || undefined, ...(p !== null && task.status !== 'erledigt' ? { status: 'erledigt' as const } : {}) });
      }
    } else {
      const taskId = add('tasks', { title, courseId: course.id, kind: 'Aufgabe', status: p !== null ? 'erledigt' : 'offen', priority: 'hoch', due: due || null, dueTime: time || undefined });
      add('sheets', { courseId: course.id, number: n, due: due || null, dueTime: time || undefined, points: p, max: m, taskId });
    }
    onClose();
  };

  return (
    <Sheet title={sheet ? `Blatt ${sheet.number}` : 'Neues Übungsblatt'} submitLabel={sheet ? 'Sichern' : 'Hinzufügen'} onClose={onClose} onSubmit={save}>
      <div className="modal-grid">
        <label>Nummer<input inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} /></label>
        <label>Mögliche Punkte<input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} /></label>
      </div>
      <div className="modal-grid">
        <label>Abgabe<input type="date" value={due ?? ''} onChange={(e) => setDue(e.target.value)} /></label>
        <label>Uhrzeit<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      <label>Erreichte Punkte
        <input inputMode="decimal" autoFocus={!!sheet} value={points} placeholder="leer = noch nicht korrigiert" onChange={(e) => setPoints(e.target.value)} />
      </label>
      {!sheet && <p className="muted small">Die Abgabe landet als Aufgabe mit Frist in deiner Liste. Sobald Punkte eingetragen sind, ist sie erledigt.</p>}
      {sheet && (
        <button type="button" className="danger" onClick={() => {
          if (!confirm(`Blatt ${sheet.number} löschen?${task ? ' Die Aufgabe dazu wird auch gelöscht.' : ''}`)) return;
          remove('sheets', sheet.id);
          if (task) remove('tasks', task.id);
          onClose();
        }}>Blatt löschen</button>
      )}
    </Sheet>
  );
}

function AdmissionEditor({ course, onClose }: { course: Course; onClose: () => void }) {
  const { update } = useStore();
  const a = course.admission ?? defaultAdmission();
  const [sheets, setSheets] = useState(String(a.sheets));
  const [maxPer, setMaxPer] = useState(formatNumber(a.maxPerSheet));
  const [required, setRequired] = useState(formatNumber(a.required));
  const [unit, setUnit] = useState<Admission['unit']>(a.unit);
  return (
    <Sheet
      title="Klausurzulassung"
      submitLabel="Sichern"
      onClose={onClose}
      onSubmit={() => {
        update('courses', course.id, {
          admission: {
            sheets: Math.max(1, Math.round(parseNumber(sheets) ?? a.sheets)),
            maxPerSheet: Math.max(1, parseNumber(maxPer) ?? a.maxPerSheet),
            required: Math.max(0, parseNumber(required) ?? a.required),
            unit,
          },
        });
        onClose();
      }}
    >
      <div className="modal-grid">
        <label>Blätter im Semester<input inputMode="numeric" value={sheets} onChange={(e) => setSheets(e.target.value)} /></label>
        <label>Punkte pro Blatt<input inputMode="decimal" value={maxPer} onChange={(e) => setMaxPer(e.target.value)} /></label>
      </div>
      <label>Zulassung ab<input inputMode="decimal" value={required} onChange={(e) => setRequired(e.target.value)} /></label>
      <div className="segmented" role="radiogroup" aria-label="Einheit der Grenze">
        <button type="button" role="radio" aria-checked={unit === 'prozent'} className={unit === 'prozent' ? 'selected' : ''} onClick={() => setUnit('prozent')}>% der Punkte</button>
        <button type="button" role="radio" aria-checked={unit === 'punkte'} className={unit === 'punkte' ? 'selected' : ''} onClick={() => setUnit('punkte')}>Punkte</button>
      </div>
      <button type="button" className="danger" onClick={() => { if (confirm('Klausurzulassung für diesen Kurs ausschalten? Die Blätter bleiben erhalten.')) { update('courses', course.id, { admission: null }); onClose(); } }}>
        Zulassung ausschalten
      </button>
    </Sheet>
  );
}

/** Kurzer Stand für andere Seiten (z. B. Prüfungen): „Zulassung: auf Kurs · 82/100“ */
export function admissionShort(course: Course | undefined, sheets: ExerciseSheet[]): { text: string; color: string } | null {
  if (!course?.admission) return null;
  const s = admissionState(course.admission, sheets.filter((x) => x.courseId === course.id));
  return { text: `Zulassung: ${s.status} · ${formatNumber(s.earned)}/${formatNumber(s.required)} Punkte`, color: STATUS_COLOR[s.status] };
}

/** Panel im Kurs: Übungsblätter mit Punkten, Abgaben und Zulassung */
export function SheetsPanel({ course }: { course: Course }) {
  const { data, update } = useStore();
  const [editor, setEditor] = useState<null | { kind: 'sheet'; sheet?: ExerciseSheet } | { kind: 'rule' }>(null);
  const sheets = data.sheets.filter((s) => s.courseId === course.id).sort((a, b) => a.number - b.number);
  const t = today();

  return (
    <section className="panel sheets-panel">
      <div className="panel-head">
        <h2>Übungsblätter</h2>
        <div className="row">
          {course.admission && <button type="button" className="link" onClick={() => setEditor({ kind: 'rule' })}>Regel</button>}
          <button type="button" className="link" onClick={() => setEditor({ kind: 'sheet' })}>+ Blatt</button>
        </div>
      </div>
      {course.admission ? (
        <AdmissionBar course={course} sheets={sheets} />
      ) : (
        <div className="row between wrap">
          <span className="muted small">Brauchst du Punkte aus den Übungen für die Klausur? Dann rechnet Daywerk mit, ob du auf Kurs bist.</span>
          <button type="button" onClick={() => { update('courses', course.id, { admission: defaultAdmission() }); setEditor({ kind: 'rule' }); }}>Zulassung einrichten</button>
        </div>
      )}
      {sheets.length > 0 && (
        <ul className="ios-list">
          {sheets.map((s) => {
            const task = s.taskId ? data.tasks.find((x) => x.id === s.taskId) : undefined;
            const submitted = s.points !== null || task?.status === 'erledigt';
            const late = !submitted && s.due !== null && s.due < t;
            return (
              <li key={s.id}>
                <button type="button" className="grow row-button" onClick={() => setEditor({ kind: 'sheet', sheet: s })}>
                  <span className="task-title">Blatt {s.number}</span>
                  <span className={`small ${late ? 'danger' : 'muted'}`}>
                    {s.due ? `Abgabe ${relativeLabel(s.due, t)}${s.dueTime ? `, ${s.dueTime}` : ''} · ${formatDate(s.due)}` : 'ohne Frist'}
                    {submitted && s.points === null ? ' · abgegeben' : ''}
                  </span>
                </button>
                {s.points !== null ? (
                  <span className="sheet-points" style={{ ['--c' as string]: course.color }}>{formatNumber(s.points)}<small>/{formatNumber(s.max)}</small></span>
                ) : (
                  <button type="button" className="link small" onClick={() => setEditor({ kind: 'sheet', sheet: s })}>Punkte</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editor?.kind === 'sheet' && <SheetEditor course={course} sheet={editor.sheet} onClose={() => setEditor(null)} />}
      {editor?.kind === 'rule' && <AdmissionEditor course={course} onClose={() => setEditor(null)} />}
    </section>
  );
}
