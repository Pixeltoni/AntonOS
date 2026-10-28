import { useState } from 'react';
import { useStore } from '../store';
import type { Tool } from '../types';
import { safeHttpUrl } from '../lib/life';
import { Empty, PageHeader } from '../components/ui';
import { AddButton, colorFor, Sheet } from '../components/sheet';

const CATEGORIES = ['Studium', 'Produktivität', 'Design', 'KI', 'Finanzen', 'Sonstiges'];

/** App-Symbol wie auf dem Home-Bildschirm */
function ToolIcon({ tool, editing, onEdit }: { tool: Tool; editing?: boolean; onEdit?: (t: Tool) => void }) {
  const url = safeHttpUrl(tool.url);
  const host = url ? new URL(url).hostname.replace(/^www\./, '') : '';
  const face = (
    <>
      <span className="app-icon" style={{ background: colorFor(tool.name) }} aria-hidden>{tool.name.trim()[0]?.toUpperCase() ?? '?'}</span>
      <span className="app-name">{tool.name}</span>
    </>
  );
  if (editing && onEdit) {
    return <button type="button" className="app wiggle" onClick={() => onEdit(tool)} title={`${tool.name} bearbeiten`}>{face}</button>;
  }
  return url ? (
    <a className="app" href={url} target="_blank" rel="noopener noreferrer" title={host}>{face}</a>
  ) : (
    <span className="app">{face}</span>
  );
}

/** Für das Dashboard: kompakte App-Symbole */
export function ToolLinks({ tools }: { tools: Tool[] }) {
  if (tools.length === 0) return <Empty>Noch keine Tools. <a href="#/tools">Hinzufügen →</a></Empty>;
  return <div className="app-grid compact">{tools.map((t) => <ToolIcon key={t.id} tool={t} />)}</div>;
}

type Draft = Omit<Tool, 'id'>;

function ToolSheet({ initial, id, onClose }: { initial: Draft; id?: string; onClose: () => void }) {
  const { add, update, remove } = useStore();
  const [t, setT] = useState<Draft>(initial);
  const [error, setError] = useState('');
  return (
    <Sheet
      title={id ? 'Tool bearbeiten' : 'Neues Tool'}
      submitLabel={id ? 'Sichern' : 'Hinzufügen'}
      onClose={onClose}
      onSubmit={() => {
        const safe = safeHttpUrl(t.url);
        if (!t.name.trim() || !safe) {
          setError('Bitte Name und gültige Webadresse angeben.');
          return;
        }
        const final = { name: t.name.trim(), url: safe, category: t.category.trim() || 'Sonstiges' };
        if (id) update('tools', id, final);
        else add('tools', final);
        onClose();
      }}
    >
      <label>Name<input autoFocus value={t.name} placeholder="z. B. Moodle" onChange={(e) => setT({ ...t, name: e.target.value })} /></label>
      <label>Webadresse<input value={t.url} placeholder="https://…" inputMode="url" onChange={(e) => setT({ ...t, url: e.target.value })} /></label>
      <label>
        Kategorie
        <input list="tool-categories" value={t.category} onChange={(e) => setT({ ...t, category: e.target.value })} />
        <datalist id="tool-categories">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      {error && <p className="danger small" role="alert">{error}</p>}
      {id && <button type="button" className="danger" onClick={() => { if (confirm('Tool löschen?')) { remove('tools', id); onClose(); } }}>Tool löschen</button>}
    </Sheet>
  );
}

export function Tools() {
  const { data } = useStore();
  const [sheet, setSheet] = useState<{ initial: Draft; id?: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const groups = [...new Set(data.tools.map((t) => t.category))];

  return (
    <>
      <PageHeader
        title="Tools"
        subtitle="Deine wichtigsten Links an einem Ort"
        actions={
          <>
            {data.tools.length > 0 && <button type="button" className={editing ? 'primary' : ''} onClick={() => setEditing((e) => !e)}>{editing ? 'Fertig' : 'Bearbeiten'}</button>}
            <AddButton label="Neues Tool" onClick={() => setSheet({ initial: { name: '', url: '', category: CATEGORIES[0] } })} />
          </>
        }
      />
      {editing && <p className="muted small">Tippe auf ein Symbol, um es zu bearbeiten oder zu löschen.</p>}
      {groups.length === 0 && <Empty>Noch keine Tools. Tippe auf +, um deinen ersten Link anzulegen.</Empty>}
      {groups.map((g) => (
        <section key={g} className="panel">
          <div className="panel-head"><h2>{g}</h2></div>
          <div className="app-grid">
            {data.tools.filter((t) => t.category === g).map((t) => (
              <ToolIcon key={t.id} tool={t} editing={editing} onEdit={(x) => setSheet({ initial: { name: x.name, url: x.url, category: x.category }, id: x.id })} />
            ))}
          </div>
        </section>
      ))}
      {sheet && <ToolSheet initial={sheet.initial} id={sheet.id} onClose={() => setSheet(null)} />}
    </>
  );
}
