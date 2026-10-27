import { useState } from 'react';
import { useStore } from '../store';
import type { ID, Project, ProjectStatus } from '../types';
import { formatDate, relativeLabel, today } from '../lib/dates';
import { TaskForm, TaskList } from '../components/TaskList';
import { Cover, ImageInput } from '../components/widgets';
import { Empty, PageHeader, Panel, Progress } from '../components/ui';

export const PROJECT_STATUSES: ProjectStatus[] = ['geplant', 'aktiv', 'pausiert', 'abgeschlossen'];
const AREAS = ['Studium', 'Privat', 'Arbeit', 'Finanzen', 'Reisen'];

type Draft = Omit<Project, 'id'>;
const blank = (): Draft => ({ title: '', area: 'Privat', status: 'aktiv', due: null, cover: '', description: '' });

function ProjectForm({ initial, onSave, onCancel }: { initial: Draft; onSave: (p: Draft) => void; onCancel: () => void }) {
  const [p, setP] = useState(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setP((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        if (p.title.trim()) onSave({ ...p, title: p.title.trim() });
      }}
    >
      <label>Titel<input value={p.title} onChange={(e) => set('title', e.target.value)} required /></label>
      <label>Bereich<input list="project-areas" value={p.area} onChange={(e) => set('area', e.target.value)} /></label>
      <datalist id="project-areas">{AREAS.map((a) => <option key={a} value={a} />)}</datalist>
      <label>Status
        <select value={p.status} onChange={(e) => set('status', e.target.value as ProjectStatus)}>
          {PROJECT_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label>Deadline<input type="date" value={p.due ?? ''} onChange={(e) => set('due', e.target.value || null)} /></label>
      <label className="full">Titelbild<ImageInput value={p.cover} onChange={(v) => set('cover', v)} /></label>
      <label className="full">Beschreibung<textarea rows={2} value={p.description} onChange={(e) => set('description', e.target.value)} /></label>
      <div className="row end">
        <button type="button" onClick={onCancel}>Abbrechen</button>
        <button className="primary" type="submit">Speichern</button>
      </div>
    </form>
  );
}

/** Fortschritt eines Projekts aus seinen Aufgaben, in Prozent (oder null ohne Aufgaben). */
export function useProjectProgress(id: ID): number | null {
  const { data } = useStore();
  const tasks = data.tasks.filter((t) => t.projectId === id);
  if (tasks.length === 0) return null;
  return (tasks.filter((t) => t.status === 'erledigt').length / tasks.length) * 100;
}

export function ProjectCard({ project }: { project: Project }) {
  const progress = useProjectProgress(project.id);
  const t = today();
  return (
    <a className="gallery-card" href={`#/projekte/${project.id}`}>
      <Cover src={project.cover} seed={project.id} emoji="🚀" />
      <div className="gallery-body">
        <strong>{project.title}</strong>
        <div className="meta">
          <span className="tag">{project.area}</span>
          <span className={`tag status-${project.status}`}>{project.status}</span>
          {project.due && <span title={formatDate(project.due)}>{relativeLabel(project.due, t)}</span>}
        </div>
        {progress !== null && <Progress value={progress} />}
      </div>
    </a>
  );
}

export function Projects() {
  const { data, add } = useStore();
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState<ProjectStatus | ''>('');
  const list = data.projects.filter((p) => !status || p.status === status);

  return (
    <>
      <PageHeader
        title="Projekte"
        actions={
          <>
            <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus | '')} aria-label="Status filtern">
              <option value="">Alle</option>
              {PROJECT_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
            {!adding && <button className="primary" onClick={() => setAdding(true)}>+ Projekt</button>}
          </>
        }
      />
      {adding && (
        <Panel title="Neues Projekt">
          <ProjectForm initial={blank()} onCancel={() => setAdding(false)} onSave={(p) => { add('projects', p); setAdding(false); }} />
        </Panel>
      )}
      {list.length === 0 ? <Empty>Keine Projekte.</Empty> : (
        <div className="gallery">{list.map((p) => <ProjectCard key={p.id} project={p} />)}</div>
      )}
    </>
  );
}

export function ProjectDetail({ id }: { id: ID }) {
  const { data, update, remove } = useStore();
  const [editing, setEditing] = useState(false);
  const project = data.projects.find((p) => p.id === id);
  const progress = useProjectProgress(id);
  if (!project) return <Empty>Projekt nicht gefunden. <a href="#/projekte">Zurück</a></Empty>;

  return (
    <>
      <Cover src={project.cover} seed={project.id} emoji="🚀" className="banner" />
      <PageHeader
        title={project.title}
        subtitle={[project.area, project.status, project.due && `bis ${formatDate(project.due)}`].filter(Boolean).join(' · ')}
        actions={
          <>
            <button onClick={() => setEditing((e) => !e)}>{editing ? 'Schließen' : 'Bearbeiten'}</button>
            <button className="danger" onClick={() => { if (confirm('Projekt löschen? Die Aufgaben bleiben erhalten.')) { remove('projects', id); location.hash = '#/projekte'; } }}>Löschen</button>
          </>
        }
      />
      {editing && (
        <Panel title="Projekt bearbeiten">
          <ProjectForm initial={project} onCancel={() => setEditing(false)} onSave={(p) => { update('projects', id, p); setEditing(false); }} />
        </Panel>
      )}
      {project.description && <Panel><p>{project.description}</p></Panel>}
      <Panel title={progress === null ? 'Aufgaben' : `Aufgaben · ${Math.round(progress)} % erledigt`}>
        {progress !== null && <Progress value={progress} />}
        <TaskForm projectId={id} />
        <TaskList tasks={data.tasks.filter((t) => t.projectId === id)} />
      </Panel>
    </>
  );
}
