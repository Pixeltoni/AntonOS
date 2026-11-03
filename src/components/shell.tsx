import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useStore } from '../store';
import type { NavItem } from '../types';
import { DEFAULT_SIDEBAR, mergeWithDefaults } from '../lib/layout';
import { normalizeTabs } from '../lib/areas';
import { Icon, NavIcon, PAGE_ICONS } from './icons';
import { openSpotlight } from './spotlight';
import { openAssistant } from './assistant';
import { useFocus } from './focus';

/** Alle Seiten in der Reihenfolge und mit den Namen aus der Sidebar */
export function useNavItems(): NavItem[] {
  const { data } = useStore();
  return mergeWithDefaults(data.settings.sidebar, DEFAULT_SIDEBAR, 'path', 'group');
}

/** Die drei frei wählbaren Tabs */
export function useTabs(): string[] {
  const { data } = useStore();
  const items = useNavItems();
  return normalizeTabs(data.settings.tabs, items.map((i) => i.path));
}

/** Tab-Leiste am unteren Rand (nur am Handy sichtbar, wie in Fitness oder Things) */
export function TabBar({ current }: { current: string }) {
  const items = useNavItems();
  const tabs = useTabs();
  const item = (path: string) => items.find((i) => i.path === path) ?? { path, label: path, icon: '', group: '', hidden: false };
  const areasActive = current === 'bereiche' || !tabs.includes(current);

  // Aktiven Tab nochmal antippen → nach oben scrollen (wie überall auf iOS)
  const onTab = (e: MouseEvent, path: string) => {
    if (path !== current) return;
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <nav className="tabbar" aria-label="Tabs">
      {tabs.map((path) => {
        const it = item(path);
        return (
          <a key={path} href={`#/${path}`} className={current === path ? 'on' : ''} aria-current={current === path ? 'page' : undefined} onClick={(e) => onTab(e, path)}>
            <NavIcon item={it} size={23} />
            <span>{it.label}</span>
          </a>
        );
      })}
      <a href="#/bereiche" className={areasActive ? 'on' : ''} aria-current={current === 'bereiche' ? 'page' : undefined} onClick={(e) => onTab(e, 'bereiche')}>
        <Icon icon={PAGE_ICONS.bereiche} size={23} />
        <span>Bereiche</span>
      </a>
      <button type="button" onClick={openSpotlight}>
        <Icon icon={PAGE_ICONS.suche} size={23} />
        <span>Suche</span>
      </button>
    </nav>
  );
}

const PLUS_ACTIONS: { label: string; emoji: string; prefill?: string; run?: 'focus' }[] = [
  { label: 'Aufgabe', emoji: '✓', prefill: 'Aufgabe: ' },
  { label: 'Termin', emoji: '📅', prefill: 'Termin: ' },
  { label: 'Ausgabe', emoji: '€', prefill: 'Ausgabe: ' },
  { label: 'Notiz', emoji: '📝', prefill: 'Notiz: ' },
  { label: 'Einkauf', emoji: '🛒', prefill: 'Kaufe ' },
  { label: 'Fokus starten', emoji: '⏱', run: 'focus' },
];

/**
 * Runder Plus-Knopf wie „Magic Plus“ in Things: Tippen öffnet die Assistentin,
 * gedrückt halten (oder Rechtsklick) zeigt Abkürzungen.
 */
export function PlusButton({ hidden }: { hidden?: boolean }) {
  const [menu, setMenu] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const long = useRef(false);
  const focus = useFocus();

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  if (hidden) return null;

  const openMenu = () => {
    long.current = true;
    setMenu(true);
    navigator.vibrate?.(10);
  };
  const run = (a: (typeof PLUS_ACTIONS)[number]) => {
    setMenu(false);
    if (a.run === 'focus') {
      if (!focus.timer.running) focus.start();
      location.hash = '#/fokus';
    } else openAssistant(a.prefill ?? '');
  };

  return (
    <>
      {menu && <div className="plus-backdrop" onClick={() => setMenu(false)} aria-hidden="true" />}
      {menu && (
        <div className="plus-menu" role="menu" aria-label="Schnell eintragen">
          {PLUS_ACTIONS.map((a) => (
            <button key={a.label} type="button" role="menuitem" onClick={() => run(a)}>
              <span aria-hidden="true">{a.emoji}</span>
              {a.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className={`plus-fab ${menu ? 'open' : ''}`}
        aria-label={menu ? 'Schließen' : 'Neu eintragen (gedrückt halten für mehr)'}
        aria-expanded={menu}
        onPointerDown={() => {
          long.current = false;
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(openMenu, 450);
        }}
        onPointerUp={() => window.clearTimeout(timer.current)}
        onPointerLeave={() => window.clearTimeout(timer.current)}
        onContextMenu={(e) => {
          e.preventDefault();
          window.clearTimeout(timer.current);
          if (!menu) openMenu();
        }}
        onClick={() => {
          if (long.current) {
            long.current = false;
            return;
          }
          if (menu) setMenu(false);
          else openAssistant();
        }}
      >
        <Icon icon={PAGE_ICONS.plus} size={26} />
      </button>
    </>
  );
}

/**
 * Fenster (Modals) erscheinen am Handy als Blatt von unten (CSS). Hier: nach unten
 * wischen schließt das Blatt – wie in Karten oder Wallet. Das Schließen läuft über
 * den vorhandenen Klick auf den Hintergrund, damit jedes Fenster es ohne Änderung kann.
 */
export function useSheetSwipe() {
  useEffect(() => {
    let sheet: HTMLElement | null = null;
    let startY = 0;
    let dy = 0;
    const phone = () => window.matchMedia('(max-width: 800px)').matches;

    const onStart = (e: TouchEvent) => {
      if (!phone()) return;
      const target = e.target as HTMLElement;
      const el = target.closest<HTMLElement>('.modal, .inspector');
      if (!el) return;
      const backdrop = el.classList.contains('inspector') ? el.previousElementSibling : el.parentElement;
      if (!backdrop?.matches('.modal-backdrop, .inspector-backdrop')) return;
      // Nur ziehen, wenn das Blatt ganz oben ist und nicht in einem Eingabefeld gewischt wird
      if (el.scrollTop > 0 || target.closest('input, textarea, select, [contenteditable="true"], .no-swipe')) return;
      sheet = el;
      startY = e.touches[0].clientY;
      dy = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!sheet) return;
      dy = e.touches[0].clientY - startY;
      if (dy <= 0 || sheet.scrollTop > 0) {
        dy = 0;
        sheet.style.transform = '';
        return;
      }
      sheet.style.transition = 'none';
      sheet.style.transform = `translateY(${dy}px)`;
    };
    const onEnd = () => {
      if (!sheet) return;
      const el = sheet;
      sheet = null;
      el.style.transition = '';
      if (dy > 110) {
        el.style.transform = 'translateY(100%)';
        const backdrop = el.classList.contains('inspector') ? el.previousElementSibling : el.parentElement;
        window.setTimeout(() => {
          backdrop?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        }, 160);
      } else el.style.transform = '';
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, []);
}
