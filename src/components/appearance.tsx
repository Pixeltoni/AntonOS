import { useEffect } from 'react';
import { useStore } from '../store';
import type { ThemeMode } from '../types';

/** Setzt helles oder dunkles Design für die ganze App. */
export function AppearanceLayer() {
  const { data } = useStore();
  const theme = data.settings.appearance.theme;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'hell') root.dataset.theme = 'light';
    else if (theme === 'dunkel') root.dataset.theme = 'dark';
    else delete root.dataset.theme;
  }, [theme]);

  return null;
}

const THEMES: { theme: ThemeMode; label: string }[] = [
  { theme: 'system', label: 'Wie System' },
  { theme: 'hell', label: 'Hell' },
  { theme: 'dunkel', label: 'Dunkel' },
];

/** Auswahl Hell/Dunkel – im Dashboard-Bearbeiten und in den Einstellungen. */
export function AppearanceEditor() {
  const { data, updateSettings } = useStore();
  const a = data.settings.appearance;

  return (
    <div className="col appearance-editor">
      <label className="row small">
        Design
        <select value={a.theme} onChange={(e) => updateSettings({ appearance: { ...a, theme: e.target.value as ThemeMode } })}>
          {THEMES.map((t) => <option key={t.theme} value={t.theme}>{t.label}</option>)}
        </select>
      </label>
    </div>
  );
}
