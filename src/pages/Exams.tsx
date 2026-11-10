import { useMemo, useState } from 'react';
import { useStore } from '../store';
import type { Exam, ID } from '../types';
import { daysBetween, formatDate, parseDate, today } from '../lib/dates';
import { isDue } from '../lib/srs';
import { CourseSelect, Empty, PageHeader } from '../components/ui';
import { AddButton, Sheet } from '../components/sheet';
import { useCalendarEntries } from '../components/calendar';
import { useFocus } from '../components/focus';
import { defaultStudy, planStudy, statusLabel, type StudyBlock } from '../lib/studyplan';
import { focusMode } from '../lib/focus';
import { admissionShort } from '../components/studium';
import { Sym } from '../components/icons';

type Draft = Omit<Exam, 'id'>;

function ExamSheet({ initial, id, onClose }: { initial: Draft; id?: ID; onClose: () => void }) {
  const { add, update, remove } = useStore();
  const [e, setE] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setE((x) => ({ ...x, [k]: v }));
  return (
    <Sheet
      title={id ? 'Prüfung bearbeiten' : 'Neue Prüfung'}
      submitLabel={id ? 'Sichern' : 'Hinzufügen'}
      onClose={onClose}
      submitDisabled={!e.title.trim() || !e.date}
      onSubmit={() => {
        const final = { ...e, title: e.title.trim(), location: e.location.trim() };
        // Lernplan beginnt mit dem Tag, an dem er eingetragen wird
        if (final.studyHours && !initial.studyHours) final.planFrom = today();
        if (id) update('exams', id, final);
        else add('exams', final);
        onClose();
      }}
    >
      <label>Titel<input autoFocus value={e.title} placeholder="z. B. Klausur Analysis I" onChange={(x) => set('title', x.target.value)} /></label>
      <label>Kurs<CourseSelect value={e.courseId} onChange={(courseId) => set('courseId', courseId)} /></label>
      <div className="modal-grid">
        <label>Datum<input type="date" value={e.date} onChange={(x) => set('date', x.target.value)} required /></label>
        <label>Uhrzeit<input type="time" value={e.time} onChange={(x) => set('time', x.target.value)} /></label>
      </div>
      <label>Ort<input value={e.location} placeholder="z. B. Audimax" onChange={(x) => set('location', x.target.value)} /></label>
      <label>
        Lernplan: Stunden bis zur Prüfung
        <input
          type="number"
          min={0}
          max={500}
          step={1}
          inputMode="numeric"
          placeholder="leer = kein Lernplan"
          value={e.studyHours ?? ''}
          onChange={(x) => set('studyHours', x.target.value === '' ? null : Math.max(0, Math.min(500, Number(x.target.value))))}
        />
        <span className="muted small">Daywerk verteilt die Zeit in freie Lücken im Kalender und plant jeden Tag neu. Gezählt wird der Fokus-Timer im Lernmodus für den Kurs.</span>
      </label>
      {id && (
        <button type="button" className="danger" onClick={() => { if (confirm('Prüfung löschen?')) { remove('exams', id); onClose(); } }}>
          Prüfung löschen
        </button>
      )}
    </Sheet>
  );
}

/** Lernplan einer Prüfung: Fortschritt, Status und die nächsten Blöcke */
function StudyPlanCard({ exam, blocks, status }: { exam: Exam; blocks: StudyBlock[]; status: ReturnType<typeof planStudy>['status'][number] }) {
  const focus = useFocus();
  const t = today();
  const next = blocks.filter((b) => b.examId === exam.id).slice(0, 3);
  const share = status.goal ? Math.min(1, status.done / status.goal) : 0;
  const label = statusLabel(status);
  const startFocus = () => {
    // Läuft schon ein Timer, bleibt er unverändert – sonst gingen Zeit und Zuordnung verloren
    if (focus.timer.active) {
      location.hash = '#/fokus';
      return;
    }
    focus.configure({ mode: 'lernen', courseId: exam.courseId });
    focus.start();
    location.hash = '#/fokus';
  };
  return (
    <div className="study-plan">
      <div className="row between small">
        <span><Sym emoji="📚" size={13} /> {Math.round(status.done / 6) / 10} von {Math.round(status.goal / 6) / 10} Std.</span>
        <span className={status.behind > 30 && status.done < status.goal ? 'danger' : 'ok'}>{label}</span>
      </div>
      <div className="study-bar" aria-hidden><i style={{ width: `${share * 100}%` }} /></div>
      {next.length > 0 ? (
        <ul className="study-next small">
          {next.map((b) => (
            <li key={`${b.day}-${b.start}`}>
              <span>{b.day === t ? 'Heute' : parseDate(b.day).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })}</span>
              <span className="muted">{b.start}–{b.end}</span>
            </li>
          ))}
        </ul>
      ) : (
        status.done < status.goal && <p className="muted small">Bis zur Prüfung ist im Kalender keine Lücke mehr frei.</p>
      )}
      {status.unplanned > 0 && next.length > 0 && <p className="muted small">{Math.round(status.unplanned / 6) / 10} Std. passen nicht mehr in den Kalender.</p>}
      <button type="button" className="primary small" onClick={startFocus}>{focusMode('lernen').icon} Jetzt lernen</button>
    </div>
  );
}

export function Exams() {
  const { data } = useStore();
  const entries = useCalendarEntries();
  const plan = useMemo(
    () => planStudy(data.exams, data.sessions, entries.filter((x) => x.kind !== 'study'), data.settings.study ?? defaultStudy(), new Date()),
    [data.exams, data.sessions, data.settings.study, entries],
  );
  const [sheet, setSheet] = useState<{ initial: Draft; id?: ID } | null>(null);
  const t = today();

  const sorted = [...data.exams].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const upcoming = sorted.filter((e) => e.date >= t);
  const past = sorted.filter((e) => e.date < t).reverse();
  const course = (id: ID | null) => data.courses.find((c) => c.id === id);
  const open = (e: Exam) => setSheet({ initial: { ...e }, id: e.id });

  return (
    <>
      <PageHeader
        title="Prüfungen"
        subtitle={upcoming.length ? `${upcoming.length} anstehend · die nächste in ${daysBetween(t, upcoming[0].date)} Tagen` : 'Keine Prüfung geplant'}
        actions={<AddButton label="Neue Prüfung" onClick={() => setSheet({ initial: { title: '', courseId: null, date: '', time: '', location: '' } })} />}
      />
      {upcoming.length === 0 ? <Empty>Keine anstehenden Prüfungen. Tippe auf +, um eine einzutragen.</Empty> : (
        <div className="exam-grid">
          {upcoming.map((e) => {
            const days = daysBetween(t, e.date);
            const c = course(e.courseId);
            const due = c ? data.cards.filter((x) => x.courseId === c.id && isDue(x, t)).length : 0;
            const tasks = c ? data.tasks.filter((x) => x.courseId === c.id && x.status !== 'erledigt').length : 0;
            const admission = admissionShort(c, data.sheets);
            return (
              <article key={e.id} className={`exam-card ${days <= 7 ? 'soon' : ''}`} style={{ ['--c' as string]: c?.color ?? '#FF9500' }}>
                <button type="button" className="exam-main" onClick={() => open(e)} aria-label={`${e.title} bearbeiten`}>
                  <span className="exam-course">{c?.name ?? 'Ohne Kurs'}</span>
                  <span className="exam-count">
                    <b>{days === 0 ? 'Heute' : days}</b>
                    {days > 0 && <span>{days === 1 ? 'Tag' : 'Tage'}</span>}
                  </span>
                  <strong className="exam-title">{e.title}</strong>
                  <span className="muted small">
                    {parseDate(e.date).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' })}
                    {e.time && `, ${e.time} Uhr`}
                    {e.location && ` · ${e.location}`}
                  </span>
                </button>
                {plan.status.some((s) => s.examId === e.id) && (
                  <StudyPlanCard exam={e} blocks={plan.blocks} status={plan.status.find((s) => s.examId === e.id)!} />
                )}
                {c && (
                  <div className="exam-prep">
                    <a href={`#/lernen/${c.id}`}><Sym emoji="🧠" size={13} /> {due} Karten fällig</a>
                    <a href={`#/kurse/${c.id}`}><Sym emoji="✅" size={13} /> {tasks} offene Aufgaben</a>
                    {admission && <a href={`#/kurse/${c.id}`} style={{ color: admission.color }}><Sym emoji="📝" size={13} /> {admission.text}</a>}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {past.length > 0 && (
        <details className="panel past-exams">
          <summary>Vergangen ({past.length})</summary>
          <ul className="ios-list">
            {past.map((e) => (
              <li key={e.id}>
                <span className="exam-dot" style={{ background: course(e.courseId)?.color ?? '#8E8E93' }} aria-hidden />
                <button type="button" className="grow row-button" onClick={() => open(e)}>
                  <span className="task-title">{e.title}</span>
                  <span className="muted small">{formatDate(e.date)}{course(e.courseId) ? ` · ${course(e.courseId)!.name}` : ''}</span>
                </button>
                {course(e.courseId) && <a className="small" href="#/noten">Note eintragen →</a>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {sheet && <ExamSheet initial={sheet.initial} id={sheet.id} onClose={() => setSheet(null)} />}
    </>
  );
}
