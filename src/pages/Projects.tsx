import { useState } from 'react';
import { useStore } from '../store';
import type { ID, Project, ProjectStatus } from '../types';
import { formatDate, relativeLabel, today } from '../lib/dates';
import { TaskForm, TaskList } from '../components/TaskList';
import { Cover, ImageInput } from '../components/widgets';
import { Empty, PageHeader, Panel, Progress, ProgressPie } from '../components/ui';
import { AddButton } from '../components/sheet';
import { deadlineLabel } from '../lib/things';

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
            {!adding && <AddButton label="Neues Projekt" onClick={() => setAdding(true)} />}
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
  const { data, update, remove, mutate } = useStore();
  const [editing, setEditing] = useState(false);
  const project = data.projects.find((p) => p.id === id);
  const progress = useProjectProgress(id);
  const sections = project?.sections ?? [];
  const tasks = data.tasks.filter((t) => t.projectId === id);
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
      <Panel
        title={progress === null ? 'Aufgaben' : `Aufgaben · ${Math.round(progress)} % erledigt`}
        actions={<button type="button" onClick={() => { const name = prompt('Name des Abschnitts', 'z. B. Recherche')?.trim(); if (name && !sections.includes(name)) update('projects', id, { sections: [...sections, name] }); }}>+ Abschnitt</button>}
      >
        <div className="row project-meta">
          {progress !== null && <ProgressPie share={progress / 100} size={22} />}
          {progress !== null && <Progress value={progress} />}
          {project.due && project.status !== 'abgeschlossen' && (
            <span className={`deadline-chip ${project.due < today() ? 'over' : ''}`}>⚑ {deadlineLabel(project.due, today())}</span>
          )}
        </div>
        <TaskForm projectId={id} />
        <TaskList tasks={tasks.filter((t) => !t.section || !sections.includes(t.section))} />
        {sections.map((sec, i) => (
          <div key={sec} className="project-section">
            <div className="row between project-section-head">
              <h3>{sec}</h3>
              <span className="row">
                {i > 0 && <button type="button" className="icon" aria-label={`${sec} nach oben`} onClick={() => { const next = [...sections]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; update('projects', id, { sections: next }); }}>↑</button>}
                <button type="button" className="icon" aria-label={`${sec} umbenennen`} onClick={() => {
                  const name = prompt('Neuer Name', sec)?.trim();
                  if (!name || name === sec || sections.includes(name)) return;
                  mutate((d) => ({
                    ...d,
                    projects: d.projects.map((p) => (p.id === id ? { ...p, sections: sections.map((s) => (s === sec ? name : s)) } : p)),
                    tasks: d.tasks.map((t) => (t.projectId === id && t.section === sec ? { ...t, section: name } : t)),
                  }));
                }}>✎</button>
                <button type="button" className="icon" aria-label={`${sec} löschen`} onClick={() => {
                  if (!confirm(`Abschnitt „${sec}“ löschen? Die Aufgaben bleiben im Projekt.`)) return;
                  mutate((d) => ({
                    ...d,
                    projects: d.projects.map((p) => (p.id === id ? { ...p, sections: sections.filter((s) => s !== sec) } : p)),
                    tasks: d.tasks.map((t) => (t.projectId === id && t.section === sec ? { ...t, section: undefined } : t)),
                  }));
                }}>×</button>
              </span>
            </div>
            <TaskForm projectId={id} defaults={{ section: sec }} placeholder={`Aufgabe in „${sec}“`} />
            <TaskList tasks={tasks.filter((t) => t.section === sec)} />
          </div>
        ))}
      </Panel>
    </>
  );
}
