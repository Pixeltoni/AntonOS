import { useState } from 'react';
import { useStore } from '../store';
import type { ID } from '../types';
import { CourseBadge, CourseSelect, Empty, PageHeader, Panel } from '../components/ui';

export function Notes({ selected }: { selected: ID | null }) {
  const { data, add, update, remove } = useStore();
  const [course, setCourse] = useState<ID | null>(null);
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const notes = data.notes
    .filter((n) => (course === null || n.courseId === course) && (!q || `${n.title} ${n.content}`.toLowerCase().includes(q)))
    .sort((a, b) => b.updated.localeCompare(a.updated));
  const note = data.notes.find((n) => n.id === selected);

  const create = () => {
    const id = add('notes', { title: '', courseId: course, content: '', updated: new Date().toISOString() });
    location.hash = `#/notizen/${id}`;
  };
  const edit = (patch: Partial<{ title: string; content: string; courseId: ID | null }>) =>
    note && update('notes', note.id, { ...patch, updated: new Date().toISOString() });

  return (
    <>
      <PageHeader title="Notizen" actions={<button className="primary" onClick={create}>+ Notiz</button>} />
      <div className="split">
        <Panel>
          <div className="col">
            <input placeholder="Suchen …" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Notizen durchsuchen" />
            <CourseSelect value={course} onChange={setCourse} noneLabel="Alle Kurse" />
          </div>
          {notes.length === 0 ? <Empty>Keine Notizen gefunden.</Empty> : (
            <ul className="list">
              {notes.map((n) => (
                <li key={n.id} className={n.id === selected ? 'active' : ''}>
                  <a className="grow" href={`#/notizen/${n.id}`}>
                    <div className="task-title">{n.title || 'Ohne Titel'}</div>
                    <div className="meta">
                      <CourseBadge id={n.courseId} />
                      <span>{new Date(n.updated).toLocaleDateString('de-DE')}</span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel>
          {!note ? (
            <Empty>Wähle links eine Notiz aus oder leg eine neue an.</Empty>
          ) : (
            <div className="col editor">
              <input className="title-input" placeholder="Titel" value={note.title} onChange={(e) => edit({ title: e.target.value })} />
              <div className="row between">
                <CourseSelect value={note.courseId} onChange={(courseId) => edit({ courseId })} />
                <button
                  className="danger"
                  onClick={() => {
                    if (confirm('Notiz löschen?')) {
                      remove('notes', note.id);
                      location.hash = '#/notizen';
                    }
                  }}
                >
                  Löschen
                </button>
              </div>
              <textarea
                placeholder="Schreib los … (wird automatisch gespeichert)"
                value={note.content}
                onChange={(e) => edit({ content: e.target.value })}
              />
              <a href={note.courseId ? `#/lernen/${note.courseId}` : '#/lernen'}>Lernkarten zu diesem Thema anlegen →</a>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
