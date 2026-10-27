import { useState } from 'react';
import { useStore } from '../store';
import type { ID, TaskKind, TaskStatus } from '../types';
import { KINDS, STATUSES, TaskForm, TaskList } from '../components/TaskList';
import { CourseSelect, PageHeader, Panel } from '../components/ui';

export function Tasks() {
  const { data } = useStore();
  const [status, setStatus] = useState<TaskStatus | 'aktiv' | ''>('aktiv');
  const [kind, setKind] = useState<TaskKind | ''>('');
  const [course, setCourse] = useState<ID | null>(null);

  const tasks = data.tasks.filter(
    (x) =>
      (status === '' || (status === 'aktiv' ? x.status !== 'erledigt' : x.status === status)) &&
      (kind === '' || x.kind === kind) &&
      (course === null || x.courseId === course),
  );

  return (
    <>
      <PageHeader title="Aufgaben" subtitle="Aufgaben, Lektüre, Projekte und Bewerbungen" />
      <Panel>
        <TaskForm />
      </Panel>
      <Panel
        title={`${tasks.length} Einträge`}
        actions={
          <div className="row wrap">
            <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus | 'aktiv' | '')} aria-label="Status filtern">
              <option value="aktiv">Nicht erledigt</option>
              <option value="">Alle Status</option>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select value={kind} onChange={(e) => setKind(e.target.value as TaskKind | '')} aria-label="Art filtern">
              <option value="">Alle Arten</option>
              {KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
            <CourseSelect value={course} onChange={setCourse} noneLabel="Alle Kurse" />
          </div>
        }
      >
        <TaskList tasks={tasks} />
      </Panel>
    </>
  );
}
