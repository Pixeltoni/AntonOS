import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronDown, GripVertical, EyeOff, Pin, Star, Zap } from 'lucide-react';
import { useStore } from '../store';
import type { NavItem } from '../types';
import { today } from '../lib/dates';
import { areaBadges, areaHints, areaSummary, areaUrgent, moveNavItem, pushRecent, quickActions, TAB_COUNT, tileColor, type QuickAction } from '../lib/areas';
import { groupNav } from '../lib/layout';
import { petMood } from '../lib/pet';
import { Icon, NavIcon, PAGE_ICONS } from '../components/icons';
import { useNavItems, useTabs } from '../components/shell';
import { SidebarEditor } from '../components/navedit';
import { SyncBadge } from '../components/sync';
import { openAssistant } from '../components/assistant';
import { useCalendarEntries } from '../components/calendar';
import { useFocus } from '../components/focus';
import { usePetPeek } from '../components/pet';
import { useToast } from '../components/toast';
import { PageHeader } from '../components/ui';

/** Zuletzt geöffnete Seiten – nur auf diesem Gerät */
const RECENT_KEY = 'antonos:zuletzt';

function readRecent(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Von der Shell bei jedem Seitenwechsel aufgerufen */
export function rememberPage(path: string) {
  try {
    const before = readRecent();
    const next = pushRecent(before, path);
    if (next !== before) localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* privat/voll – egal */
  }
}

const tileStyle = (color: string) => ({ ['--tile' as string]: color }) as CSSProperties;

/** Alle Seiten als bunte Kacheln, gruppiert wie in der Sidebar (wie „Durchsuchen“ in Apple Health) */
export function Areas() {
  const { data, updateSettings } = useStore();
  const items = useNavItems();
  const tabs = useTabs();
  const entries = useCalendarEntries();
  const pet = usePetPeek();
  const focus = useFocus();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [pinning, setPinning] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [recent] = useState(readRecent);
  const timer = useRef<number | undefined>(undefined);
  const longPress = useRef(false);
  const t = today();
  const now = useMemo(() => new Date(), [data, t]);
  const mood = pet ? petMood(pet, now) : null;
  const hints = useMemo(() => areaHints(data, t, now, { entries, pet: mood }), [data, t, now, entries, mood]);
  const badges = useMemo(() => areaBadges(data, t), [data, t]);
  const urgent = useMemo(() => new Set(areaUrgent(data, t, now)), [data, t, now]);
  const stats = useMemo(() => areaSummary(data, t, now), [data, t, now]);
  const favorites = data.settings.areas?.favorites ?? [];
  const collapsed = data.settings.areas?.collapsed ?? [];
  const label = (path: string) => items.find((i) => i.path === path)?.label ?? 'Heute';
  const saveAreas = (patch: { favorites?: string[]; collapsed?: string[] }) => updateSettings({ areas: { favorites, collapsed, ...patch } });

  const setTab = (slot: number, path: string) => {
    const next = [...tabs];
    const other = next.indexOf(path);
    if (other >= 0) next[other] = next[slot];
    next[slot] = path;
    updateSettings({ tabs: next });
  };

  // Farbe je Kachel: Gruppenfarbe, nach Platz in der Gruppe abgestuft
  const colors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const g of groupNav(items)) g.items.forEach((n, i) => (map[n.path] = tileColor(g.group, i)));
    return map;
  }, [items]);

  const visible = items.filter((i) => !i.hidden && i.path !== 'heute' && !tabs.includes(i.path));
  const groups = groupNav(visible);
  const byPath = (path: string) => items.find((i) => i.path === path);

  const startTile = (path: string) => {
    longPress.current = false;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      longPress.current = true;
      navigator.vibrate?.(10);
      setMenu(path);
    }, 500);
  };
  const press = (path: string) => ({
    onPointerDown: () => startTile(path),
    onPointerUp: () => window.clearTimeout(timer.current),
    onPointerLeave: () => window.clearTimeout(timer.current),
    onPointerCancel: () => window.clearTimeout(timer.current),
    onContextMenu: (e: { preventDefault(): void }) => {
      e.preventDefault();
      window.clearTimeout(timer.current);
      setMenu(path);
    },
    onClick: (e: { preventDefault(): void }) => {
      if (longPress.current) {
        e.preventDefault();
        longPress.current = false;
      }
    },
  });

  const tile = (n: NavItem, opts: { star?: boolean } = {}) => {
    const badge = badges[n.path];
    const hint = badge?.text ?? hints[n.path];
    return (
      <a key={n.path} href={`#/${n.path}`} className={`area-tile${urgent.has(n.path) ? ' wide' : ''}`} style={tileStyle(colors[n.path] ?? 'var(--accent)')} {...press(n.path)}>
        <span className="area-tile-icon"><NavIcon item={n} size={20} /></span>
        {badge && <span className="area-badge" aria-label={`${badge.count} ${badge.text}`}>{badge.count > 99 ? '99+' : badge.count}</span>}
        {opts.star && !badge && favorites.includes(n.path) && <Star className="area-star" size={14} fill="currentColor" aria-label="Favorit" />}
        <strong>{n.label}</strong>
        {hint && <small>{hint}</small>}
      </a>
    );
  };

  if (editing) return <EditAreas items={items} visible={visible} tabs={tabs} colors={colors} setTab={setTab} onDone={() => setEditing(false)} />;

  const q = query.trim().toLowerCase();
  const results = q
    ? items.filter((i) => !i.hidden && i.path !== 'bereiche' && i.path !== 'einstellungen' && (i.label.toLowerCase().includes(q) || (hints[i.path] ?? '').toLowerCase().includes(q)))
    : [];
  const favItems = favorites.map(byPath).filter((n): n is NavItem => !!n && !n.hidden && !tabs.includes(n.path) && n.path !== 'heute');
  const recentItems = recent.map(byPath).filter((n): n is NavItem => !!n && !n.hidden && !tabs.includes(n.path)).slice(0, 4);

  const toggleGroup = (group: string) => saveAreas({ collapsed: collapsed.includes(group) ? collapsed.filter((g) => g !== group) : [...collapsed, group] });

  const runAction = (a: QuickAction) => {
    setMenu(null);
    if ('prefill' in a) openAssistant(a.prefill);
    else if ('href' in a) location.hash = a.href;
    else {
      if (!focus.timer.running) focus.start();
      location.hash = '#/fokus';
    }
  };
  const toggleFavorite = (path: string) => {
    const on = favorites.includes(path);
    saveAreas({ favorites: on ? favorites.filter((p) => p !== path) : [...favorites, path] });
    toast.show(on ? `${label(path)} aus den Favoriten entfernt` : `${label(path)} zu den Favoriten`);
    setMenu(null);
  };
  const hide = (path: string) => {
    const before = items;
    updateSettings({ sidebar: items.map((i) => (i.path === path ? { ...i, hidden: true } : i)) });
    toast.show(`${label(path)} ausgeblendet`, { label: 'Widerrufen', run: () => updateSettings({ sidebar: before }) });
    setMenu(null);
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
      <label className="area-search">
        <Icon icon={PAGE_ICONS.suche} size={17} />
        <input
          type="search"
          placeholder="Bereiche durchsuchen"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) location.hash = `#/${results[0].path}`;
            if (e.key === 'Escape') setQuery('');
          }}
          aria-label="Bereiche durchsuchen"
          enterKeyHint="go"
        />
      </label>
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
      {q ? (
        results.length ? (
          <section className="area-group">
            <h2 className="area-label">{results.length === 1 ? '1 Treffer' : `${results.length} Treffer`}</h2>
            <div className="area-tiles">{results.map((n) => tile(n))}</div>
          </section>
        ) : (
          <p className="muted areas-empty">Keine Seite passt zu „{query.trim()}“.</p>
        )
      ) : (
        <>
          {stats.length > 0 && (
            <div className="area-summary" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
              {stats.map((s) => (
                <a key={s.path} href={`#/${s.path}`} className="area-stat" style={tileStyle(colors[s.path] ?? 'var(--accent)')} aria-label={`${byPath(s.path)?.label ?? ''}: ${s.value} ${s.label}`}>
                  <span className="area-stat-icon" aria-hidden="true"><NavIcon item={byPath(s.path) ?? { path: s.path, label: '', icon: '', group: '', hidden: false }} size={15} /></span>
                  <b>{s.value}</b>
                  <span>{s.label}</span>
                </a>
              ))}
            </div>
          )}
          {recentItems.length > 1 && (
            <section className="area-group">
              <h2 className="area-label">Zuletzt benutzt</h2>
              <div className="area-recent">
                {recentItems.map((n) => (
                  <a key={n.path} href={`#/${n.path}`} style={tileStyle(colors[n.path] ?? 'var(--accent)')} {...press(n.path)}>
                    <span><NavIcon item={n} size={16} /></span>
                    {n.label}
                  </a>
                ))}
              </div>
            </section>
          )}
          {favItems.length > 0 && (
            <section className="area-group">
              <h2 className="area-label"><Star size={12} fill="currentColor" aria-hidden="true" /> Favoriten</h2>
              <div className="area-tiles">{favItems.map((n) => tile(n))}</div>
            </section>
          )}
          {groups.map((g) => {
            const name = g.group || 'Mehr';
            const closed = collapsed.includes(name);
            return (
              <section key={name} className="area-group">
                <button type="button" className={`area-label area-fold${closed ? ' closed' : ''}`} onClick={() => toggleGroup(name)} aria-expanded={!closed}>
                  {name}
                  {closed && <span className="area-count">· {g.items.length}</span>}
                  <ChevronDown size={16} className="area-chevron" aria-hidden="true" />
                </button>
                {closed ? (
                  <div className="area-mini">
                    {g.items.map((n) => (
                      <a key={n.path} href={`#/${n.path}`} style={tileStyle(colors[n.path] ?? 'var(--accent)')} aria-label={n.label} title={n.label} {...press(n.path)}>
                        <NavIcon item={n} size={18} />
                        {badges[n.path] && <span className="area-dot" aria-hidden="true" />}
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="area-tiles">{g.items.map((n) => tile(n, { star: true }))}</div>
                )}
              </section>
            );
          })}
        </>
      )}
      <div className="areas-foot">
        <SyncBadge />
        <a href="#/dashboard/bearbeiten">Übersicht bearbeiten</a>
      </div>
      <p className="muted small areas-hint">Tipp: Eine Kachel gedrückt halten für Schnellaktionen und Favoriten.</p>
      {menu && (
        <QuickMenu
          item={byPath(menu)}
          color={colors[menu] ?? 'var(--accent)'}
          actions={quickActions(menu, data)}
          favorite={favorites.includes(menu)}
          inTabs={tabs.includes(menu)}
          onAction={runAction}
          onFavorite={() => toggleFavorite(menu)}
          onPin={() => { setPinning(menu); setMenu(null); }}
          onHide={() => hide(menu)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

/** Blatt mit Schnellaktionen beim Gedrückthalten einer Kachel */
function QuickMenu(props: {
  item: NavItem | undefined;
  color: string;
  actions: QuickAction[];
  favorite: boolean;
  inTabs: boolean;
  onAction: (a: QuickAction) => void;
  onFavorite: () => void;
  onPin: () => void;
  onHide: () => void;
  onClose: () => void;
}) {
  const { item, onClose } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!item) return null;
  return createPortal(
    <div className="modal-backdrop sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal sheet area-menu" role="dialog" aria-modal="true" aria-label={`Schnellaktionen für ${item.label}`}>
        <div className="area-menu-head">
          <span style={tileStyle(props.color)}><NavIcon item={item} size={18} /></span>
          <strong>{item.label}</strong>
          <a href={`#/${item.path}`} className="link-button" onClick={onClose}>Öffnen</a>
        </div>
        {props.actions.length > 0 && (
          <div className="area-menu-list">
            {props.actions.map((a) => (
              <button key={a.label} type="button" onClick={() => props.onAction(a)}><Zap size={17} aria-hidden="true" />{a.label}</button>
            ))}
          </div>
        )}
        <div className="area-menu-list">
          <button type="button" onClick={props.onFavorite}>
            <Star size={17} fill={props.favorite ? 'currentColor' : 'none'} aria-hidden="true" />
            {props.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}
          </button>
          {!props.inTabs && <button type="button" onClick={props.onPin}><Pin size={17} aria-hidden="true" />An die Tab-Leiste heften</button>}
          {item.path !== 'einstellungen' && <button type="button" className="danger" onClick={props.onHide}><EyeOff size={17} aria-hidden="true" />Ausblenden</button>}
        </div>
        <button type="button" className="area-menu-cancel" onClick={onClose}>Abbrechen</button>
      </div>
    </div>,
    document.body,
  );
}

/** Bearbeiten: Tabs wählen, Kacheln per Ziehen sortieren, darunter Namen, Symbole und Ausblenden */
function EditAreas({ items, visible, tabs, colors, setTab, onDone }: {
  items: NavItem[];
  visible: NavItem[];
  tabs: string[];
  colors: Record<string, string>;
  setTab: (slot: number, path: string) => void;
  onDone: () => void;
}) {
  const { updateSettings } = useStore();
  const [draft, setDraft] = useState<NavItem[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const list = draft ?? items;
  const shown = new Set(visible.map((v) => v.path));
  const groups = groupNav(list.filter((i) => shown.has(i.path)));
  // Alle Gruppen anbieten, auch wenn gerade keine Kachel drin ist
  const allGroups = [...new Set(list.map((i) => i.group))];
  for (const g of allGroups) if (!groups.some((x) => x.group === g)) groups.push({ group: g, items: [] });

  const draftRef = useRef(list);
  draftRef.current = list;

  const startDrag = (path: string) => (e: ReactPointerEvent) => {
    e.preventDefault();
    navigator.vibrate?.(8);
    setDragging(path);
    setDraft(items);
    draftRef.current = items;
    // Am Rand mitscrollen, solange gezogen wird
    let edge = 0;
    const scroller = window.setInterval(() => edge && window.scrollBy(0, edge), 16);
    const move = (ev: PointerEvent) => {
      edge = ev.clientY < 90 ? -10 : ev.clientY > window.innerHeight - 140 ? 10 : 0;
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const current = draftRef.current;
      const target = el?.closest<HTMLElement>('[data-tile]');
      if (target) {
        const over = target.dataset.tile!;
        if (over === path) return;
        const group = current.find((i) => i.path === over)?.group ?? '';
        const from = current.findIndex((i) => i.path === path);
        const to = current.findIndex((i) => i.path === over);
        const next = moveNavItem(current, path, from < to ? { after: over, group } : { before: over, group });
        draftRef.current = next;
        setDraft(next);
        return;
      }
      const zone = el?.closest<HTMLElement>('[data-drop]');
      if (zone) {
        const group = zone.dataset.drop ?? '';
        if (current.find((i) => i.path === path)?.group === group) return;
        const next = moveNavItem(current, path, { group });
        draftRef.current = next;
        setDraft(next);
      }
    };
    const end = () => {
      window.clearInterval(scroller);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      updateSettings({ sidebar: draftRef.current });
      setDragging(null);
      setDraft(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  return (
    <>
      <PageHeader title="Bereiche bearbeiten" actions={<button className="primary" onClick={onDone}>Fertig</button>} />
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
      <div className={`areas areas-editing${dragging ? ' is-dragging' : ''}`}>
        <p className="muted small">Kacheln am Griff ziehen, um sie umzusortieren oder in eine andere Gruppe zu legen.</p>
        {groups.map((g) => (
          <section key={g.group || 'mehr'} className="area-group">
            <h2 className="area-label">{g.group || 'Mehr'}</h2>
            <div className="area-tiles" data-drop={g.group}>
              {g.items.map((n) => (
                <div key={n.path} data-tile={n.path} className={`area-tile${dragging === n.path ? ' dragging' : ''}`} style={tileStyle(colors[n.path] ?? 'var(--accent)')}>
                  <span className="area-tile-icon"><NavIcon item={n} size={20} /></span>
                  <button type="button" className="area-grip" onPointerDown={startDrag(n.path)} aria-label={`${n.label} verschieben`}><GripVertical size={18} /></button>
                  <strong>{n.label}</strong>
                </div>
              ))}
              {g.items.length === 0 && <p className="muted small area-drop-hint">Hierher ziehen</p>}
            </div>
          </section>
        ))}
      </div>
      <section className="panel">
        <h2>Namen, Symbole und Gruppen</h2>
        <SidebarEditor items={items} onChange={(sidebar) => updateSettings({ sidebar })} onDone={onDone} />
      </section>
    </>
  );
}
