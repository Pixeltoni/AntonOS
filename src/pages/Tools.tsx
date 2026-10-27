import { useState } from 'react';
import { useStore } from '../store';
import type { Tool } from '../types';
import { safeHttpUrl } from '../lib/life';
import { Empty, PageHeader, Panel } from '../components/ui';

const CATEGORIES = ['Studium', 'Produktivität', 'Design', 'KI', 'Finanzen', 'Sonstiges'];

export function ToolLinks({ tools, onRemove }: { tools: Tool[]; onRemove?: (id: string) => void }) {
  if (tools.length === 0) return <Empty>Noch keine Tools. <a href="#/tools">Hinzufügen →</a></Empty>;
  return (
    <ul className="list">
      {tools.map((t) => {
        const url = safeHttpUrl(t.url);
        return (
          <li key={t.id}>
            <span className="tool-icon" aria-hidden>{t.name.trim()[0]?.toUpperCase()}</span>
            {url ? <a className="grow" href={url} target="_blank" rel="noopener noreferrer">{t.name}</a> : <span className="grow">{t.name}</span>}
            <span className="tag">{t.category}</span>
            {onRemove && <button className="icon" onClick={() => onRemove(t.id)} aria-label="Löschen" title="Löschen">×</button>}
          </li>
        );
      })}
    </ul>
  );
}

export function Tools() {
  const { data, add, remove } = useStore();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [error, setError] = useState('');

  const groups = [...new Set(data.tools.map((t) => t.category))];

  return (
    <>
      <PageHeader title="Nützliche Tools" subtitle="Deine wichtigsten Links an einem Ort" />
      <Panel title="Tool hinzufügen">
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const safe = safeHttpUrl(url);
            if (!name.trim() || !safe) {
              setError('Bitte Name und gültige Webadresse angeben.');
              return;
            }
            add('tools', { name: name.trim(), url: safe, category });
            setName('');
            setUrl('');
            setError('');
          }}
        >
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
          <input className="grow" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Webadresse" />
          <input list="tool-categories" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kategorie" />
          <datalist id="tool-categories">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          <button className="primary" type="submit">Hinzufügen</button>
        </form>
        {error && <p className="danger small">{error}</p>}
      </Panel>
      {groups.length === 0 && <Empty>Noch keine Tools.</Empty>}
      <div className="board">
        {groups.map((g) => (
          <Panel key={g} title={g}>
            <ToolLinks tools={data.tools.filter((t) => t.category === g)} onRemove={(id) => remove('tools', id)} />
          </Panel>
        ))}
      </div>
    </>
  );
}
