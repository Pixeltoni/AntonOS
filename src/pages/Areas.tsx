import { useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { today } from '../lib/dates';
import { areaColor, areaHints, TAB_COUNT } from '../lib/areas';
import { groupNav } from '../lib/layout';
import { Icon, NavIcon, PAGE_ICONS } from '../components/icons';
import { useNavItems, useTabs } from '../components/shell';
import { SidebarEditor } from '../components/navedit';
import { SyncBadge } from '../components/sync';
import { openAssistant } from '../components/assistant';
import { PageHeader } from '../components/ui';

/** Alle Seiten als bunte Kacheln, gruppiert wie in der Sidebar (wie „Durchsuchen“ in Apple Health) */
export function Areas() {
  const { data, updateSettings } = useStore();
  const items = useNavItems();
  const tabs = useTabs();
  const [editing, setEditing] = useState(false);
  const [pinning, setPinning] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const longPress = useRef(false);
  const t = today();
  const hints = useMemo(() => areaHints(data, t, new Date()), [data, t]);
  const label = (path: string) => items.find((i) => i.path === path)?.label ?? 'Heute';

  const setTab = (slot: number, path: string) => {
    const next = [...tabs];
    const other = next.indexOf(path);
    if (other >= 0) next[other] = next[slot];
    next[slot] = path;
    updateSettings({ tabs: next });
  };

  if (editing) {
    return (
      <>
        <PageHeader title="Bereiche bearbeiten" actions={<button className="primary" onClick={() => setEditing(false)}>Fertig</button>} />
        <section className="panel">
          <h2>Tab-Leiste</h2>
          <p className="muted small">Diese drei Seiten stehen am iPhone unten, danach folgen immer „Bereiche“ und „Suche“.</p>
          {Array.from({ length: TAB_COUNT }, (_, i) => (
            <label key={i} className="row">
              <span className="grow">Tab {i + 1}</span>
              <select value={tabs[i]} onChange={(e) => setTab(i, e.target.value)} aria-label={`Tab ${i + 1}`}>
                {items.filter((x) => x.path !== 'einstellungen').map((x) => <option key={x.path} value={x.path}>{x.label}</option>)}
              </select>
            </label>
          ))}
        </section>
        <section className="panel">
          <h2>Seiten und Gruppen</h2>
          <SidebarEditor items={items} onChange={(sidebar) => updateSettings({ sidebar })} onDone={() => setEditing(false)} />
        </section>
      </>
    );
  }

  const groups = groupNav(items.filter((i) => !i.hidden && i.path !== 'heute' && !tabs.includes(i.path)));
  const startTile = (path: string) => {
    longPress.current = false;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      longPress.current = true;
      navigator.vibrate?.(10);
      setPinning(path);
    }, 500);
  };

  return (
    <div className="areas">
      <PageHeader
        title="Bereiche"
        actions={
          <>
            <button className="icon" onClick={() => openAssistant()} aria-label="Assistentin"><Icon icon={PAGE_ICONS.assistentin} size={20} /></button>
            <button onClick={() => setEditing(true)}>Bearbeiten</button>
          </>
        }
      />
      {pinning && (
        <div className="pin-bar" role="dialog" aria-label="An die Tab-Leiste heften">
          <span><strong>{label(pinning)}</strong> an die Tab-Leiste heften – statt:</span>
          <div className="row wrap">
            {tabs.map((p, i) => (
              <button key={p} onClick={() => { setTab(i, pinning); setPinning(null); }}>{label(p)}</button>
            ))}
            <button className="link-button" onClick={() => setPinning(null)}>Abbrechen</button>
          </div>
        </div>
      )}
      {groups.map((g, gi) => (
        <section key={gi} className="area-group">
          <h2 className="area-label">{g.group || 'Mehr'}</h2>
          <div className="area-tiles">
            {g.items.map((n) => (
              <a
                key={n.path}
                href={`#/${n.path}`}
                className="area-tile"
                style={{ ['--tile' as string]: areaColor(g.group) }}
                onPointerDown={() => startTile(n.path)}
                onPointerUp={() => window.clearTimeout(timer.current)}
                onPointerLeave={() => window.clearTimeout(timer.current)}
                onContextMenu={(e) => { e.preventDefault(); setPinning(n.path); }}
                onClick={(e) => { if (longPress.current) { e.preventDefault(); longPress.current = false; } }}
              >
                <span className="area-tile-icon"><NavIcon item={n} size={20} /></span>
                <strong>{n.label}</strong>
                {hints[n.path] && <small>{hints[n.path]}</small>}
              </a>
            ))}
          </div>
        </section>
      ))}
      <div className="areas-foot">
        <SyncBadge />
        <a href="#/dashboard/bearbeiten">Übersicht bearbeiten</a>
      </div>
      <p className="muted small areas-hint">Tipp: Eine Kachel gedrückt halten, um sie an die Tab-Leiste zu heften.</p>
    </div>
  );
}
