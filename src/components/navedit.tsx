import type { NavItem } from '../types';
import { moveItem } from '../lib/layout';
import { NavIcon } from './icons';

/** Sidebar bzw. Bereiche bearbeiten: umbenennen, verschieben, Gruppe wählen, ausblenden */
export function SidebarEditor({ items, onChange, onDone }: { items: NavItem[]; onChange: (items: NavItem[]) => void; onDone: () => void }) {
  const groups = [...new Set(items.map((i) => i.group).filter(Boolean))];
  const set = (index: number, patch: Partial<NavItem>) => onChange(items.map((x, i) => (i === index ? { ...x, ...patch } : x)));
  return (
    <div className="sidebar-editor">
      <p className="muted small">Umbenennen, verschieben, Gruppe wählen oder ausblenden. Ein Emoji ersetzt das Symbol – leer lassen für das Standard-Symbol.</p>
      <datalist id="nav-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
      {items.map((item, i) => (
        <div key={item.path} className={`nav-edit ${item.hidden ? 'is-hidden' : ''}`}>
          <div className="row">
            <span className="nav-edit-icon" title="Standard-Symbol"><NavIcon item={item} /></span>
            <input className="emoji-input" value={item.icon} placeholder="Emoji" onChange={(e) => set(i, { icon: e.target.value })} aria-label={`Eigenes Emoji für ${item.label} (leer = Standard-Symbol)`} maxLength={4} />
            <input className="grow" value={item.label} onChange={(e) => set(i, { label: e.target.value })} aria-label={`Name für ${item.path}`} />
          </div>
          <div className="row">
            <input className="grow" list="nav-groups" placeholder="ohne Gruppe" value={item.group} onChange={(e) => set(i, { group: e.target.value })} aria-label={`Gruppe für ${item.label}`} />
            <button className="icon" onClick={() => onChange(moveItem(items, i, -1))} aria-label={`${item.label} nach oben`} title="Nach oben">↑</button>
            <button className="icon" onClick={() => onChange(moveItem(items, i, 1))} aria-label={`${item.label} nach unten`} title="Nach unten">↓</button>
            {item.path !== 'einstellungen' && (
              <button className="icon" onClick={() => set(i, { hidden: !item.hidden })} aria-label={item.hidden ? `${item.label} einblenden` : `${item.label} ausblenden`} title={item.hidden ? 'Einblenden' : 'Ausblenden'}>
                {item.hidden ? '🙈' : '👁'}
              </button>
            )}
          </div>
        </div>
      ))}
      <div className="row between">
        <button onClick={() => confirm('Sidebar auf den Standard zurücksetzen?') && onChange([])}>Zurücksetzen</button>
        <button className="primary" onClick={onDone}>Fertig</button>
      </div>
    </div>
  );
}

