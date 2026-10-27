import { useState } from 'react';
import { useStore } from '../store';
import type { ID } from '../types';
import { daysBetween, formatDate, relativeLabel, today } from '../lib/dates';
import { CourseBadge, CourseSelect, Empty, PageHeader, Panel } from '../components/ui';

export function Exams() {
  const { data, add, remove } = useStore();
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState<ID | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const t = today();

  const sorted = [...data.exams].sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = sorted.filter((e) => e.date >= t);
  const past = sorted.filter((e) => e.date < t).reverse();

  return (
    <>
      <PageHeader title="Prüfungen" subtitle={`${upcoming.length} anstehend`} />
      <Panel title="Prüfung eintragen">
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim() || !date) return;
            add('exams', { title: title.trim(), courseId, date, time, location });
            setTitle('');
            setDate('');
            setTime('');
            setLocation('');
          }}
        >
          <input className="grow" placeholder="Titel, z. B. Klausur" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Titel" />
          <CourseSelect value={courseId} onChange={setCourseId} />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Datum" required />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Uhrzeit" />
          <input placeholder="Ort" value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Ort" />
          <button className="primary" type="submit">Hinzufügen</button>
        </form>
      </Panel>
      {[{ title: 'Anstehend', list: upcoming }, { title: 'Vergangen', list: past }].map(({ title: heading, list }) => (
        <Panel key={heading} title={heading}>
          {list.length === 0 ? <Empty>Keine Einträge.</Empty> : (
            <ul className="list">
              {list.map((e) => {
                const days = daysBetween(t, e.date);
                return (
                  <li key={e.id}>
                    <div className="grow">
                      <div className="task-title">{e.title}</div>
                      <div className="meta">
                        <CourseBadge id={e.courseId} />
                        <span>{formatDate(e.date)}{e.time && `, ${e.time} Uhr`}</span>
                        {e.location && <span>{e.location}</span>}
                      </div>
                    </div>
                    <strong className={days >= 0 && days <= 7 ? 'danger' : ''}>{relativeLabel(e.date, t)}</strong>
                    <button className="icon" onClick={() => remove('exams', e.id)} aria-label="Löschen" title="Löschen">×</button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      ))}
    </>
  );
}
