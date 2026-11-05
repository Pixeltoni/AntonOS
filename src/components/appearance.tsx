import { useEffect } from 'react';
import { useStore } from '../store';
import type { Appearance, ThemeMode } from '../types';
import { backgroundCss, dimOpacity } from '../lib/appearance';
import { ImageInput } from './widgets';

/** Setzt helles oder dunkles Design und das eigene Hintergrundbild für die ganze App. */
export function AppearanceLayer() {
  const { data } = useStore();
  const a = data.settings.appearance;
  const theme = a.theme;
  const bg = backgroundCss(a);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'hell') root.dataset.theme = 'light';
    else if (theme === 'dunkel') root.dataset.theme = 'dark';
    else delete root.dataset.theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.toggle('has-bg', bg !== null);
  }, [bg]);

  if (!bg) return null;
  return (
    <div className="app-bg" aria-hidden>
      <div className="app-bg-image" style={{ background: bg }} />
      {/* Schleier in der Grundfarbe: hell im hellen, dunkel im dunklen Design */}
      <div className="app-bg-dim" style={{ opacity: dimOpacity(a) }} />
    </div>
  );
}

const THEMES: { theme: ThemeMode; label: string }[] = [
  { theme: 'system', label: 'Wie System' },
  { theme: 'hell', label: 'Hell' },
  { theme: 'dunkel', label: 'Dunkel' },
];

/** Hell/Dunkel und Hintergrundbild – im Dashboard-Bearbeiten und in den Einstellungen. */
export function AppearanceEditor() {
  const { data, updateSettings } = useStore();
  const a = data.settings.appearance;
  const set = (patch: Partial<Appearance>) => updateSettings({ appearance: { ...a, ...patch } });
  const bg = backgroundCss(a);

  return (
    <div className="col appearance-editor">
      <label className="row small">
        Design
        <select value={a.theme} onChange={(e) => set({ theme: e.target.value as ThemeMode })}>
          {THEMES.map((t) => <option key={t.theme} value={t.theme}>{t.label}</option>)}
        </select>
      </label>
      <div className="col">
        <span className="small">Hintergrundbild</span>
        <ImageInput value={a.image} onChange={(image) => set({ image })} label="Hintergrundbild" maxSize={1600} />
      </div>
      {a.image && !bg && <span className="danger small">Das Bild konnte nicht gelesen werden – bitte einen Link mit https:// oder ein Foto wählen.</span>}
      {bg && (
        <>
          <div className="bg-preview" aria-hidden>
            <div className="app-bg-image" style={{ background: bg }} />
            <div className="app-bg-dim" style={{ opacity: dimOpacity(a) }} />
            <span>Aa</span>
          </div>
          <label className="row small">
            Schleier
            <input type="range" min={0} max={80} step={5} value={a.dim} onChange={(e) => set({ dim: Number(e.target.value) })} className="grow" aria-label="Schleier über dem Bild" />
            <span className="muted">{a.dim} %</span>
          </label>
          <p className="muted small">Der Schleier hellt das Bild im hellen Design auf und dunkelt es im dunklen ab, damit Schrift gut lesbar bleibt.</p>
        </>
      )}
    </div>
  );
}
