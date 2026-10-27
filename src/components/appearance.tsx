import { useEffect } from 'react';
import { useStore } from '../store';
import type { Appearance, BackgroundKind, ThemeMode } from '../types';
import { backgroundCss, dimOpacity, GRADIENTS } from '../lib/appearance';
import { defaultAppearance } from '../demo';
import { ImageInput } from './widgets';

/** Setzt Design, Akzentfarbe und Hintergrund für die ganze App. */
export function AppearanceLayer() {
  const { data } = useStore();
  const a = data.settings.appearance;
  const bg = backgroundCss(a);

  useEffect(() => {
    const root = document.documentElement;
    if (a.theme === 'hell') root.dataset.theme = 'light';
    else if (a.theme === 'dunkel') root.dataset.theme = 'dark';
    else delete root.dataset.theme;
    if (/^#[0-9a-f]{6}$/i.test(a.accent)) root.style.setProperty('--accent', a.accent);
    else root.style.removeProperty('--accent');
    root.classList.toggle('glass', a.glass);
    root.style.setProperty('--glass', String(Math.min(100, Math.max(0, a.glassLevel)) / 100));
    root.classList.toggle('has-bg', bg !== null);
  }, [a.theme, a.accent, a.glass, a.glassLevel, bg]);

  if (!bg) return null;
  return (
    <div className="app-bg" aria-hidden>
      <div className="app-bg-image" style={{ background: bg }} />
      <div className="app-bg-dim" style={{ opacity: dimOpacity(a) }} />
    </div>
  );
}

const KINDS: { kind: BackgroundKind; label: string }[] = [
  { kind: 'standard', label: 'Standard' },
  { kind: 'farbe', label: 'Farbe' },
  { kind: 'verlauf', label: 'Verlauf' },
  { kind: 'bild', label: 'Bild' },
];

const THEMES: { theme: ThemeMode; label: string }[] = [
  { theme: 'system', label: 'Wie System' },
  { theme: 'hell', label: 'Hell' },
  { theme: 'dunkel', label: 'Dunkel' },
];

/** Einstellungen für Hintergrund und Design – im Dashboard-Bearbeiten und in den Einstellungen. */
export function AppearanceEditor() {
  const { data, updateSettings } = useStore();
  const a = data.settings.appearance;
  const set = (patch: Partial<Appearance>) => updateSettings({ appearance: { ...a, ...patch } });

  return (
    <div className="col appearance-editor">
      <div className="row wrap">
        <span className="small muted">Hintergrund:</span>
        <div className="segmented" role="radiogroup" aria-label="Hintergrund">
          {KINDS.map((k) => (
            <button key={k.kind} role="radio" aria-checked={a.background === k.kind} className={a.background === k.kind ? 'selected' : ''} onClick={() => set({ background: k.kind })}>
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {a.background === 'farbe' && (
        <label className="row small">
          Farbe <input type="color" value={a.color} onChange={(e) => set({ color: e.target.value })} />
        </label>
      )}
      {a.background === 'verlauf' && (
        <div className="swatches">
          {GRADIENTS.map((g) => (
            <button
              key={g.id}
              className={`swatch ${a.gradient === g.id ? 'selected' : ''}`}
              style={{ background: g.css }}
              onClick={() => set({ gradient: g.id })}
              aria-label={g.label}
              title={g.label}
            >
              <span>{g.label}</span>
            </button>
          ))}
        </div>
      )}
      {a.background === 'bild' && <ImageInput value={a.image} onChange={(image) => set({ image })} label="Hintergrundbild" maxSize={1920} />}

      {a.background !== 'standard' && (
        <label className="row small">
          Abdunkeln
          <input type="range" min={0} max={80} step={5} value={a.dim} onChange={(e) => set({ dim: Number(e.target.value) })} className="grow" />
          <span className="muted">{a.dim} %</span>
        </label>
      )}

      <div className="row wrap">
        <label className="row small">
          <input type="checkbox" checked={a.glass} onChange={(e) => set({ glass: e.target.checked })} /> Milchglas-Kästen (wie iOS)
        </label>
        <label className="row small">
          Design
          <select value={a.theme} onChange={(e) => set({ theme: e.target.value as ThemeMode })}>
            {THEMES.map((t) => <option key={t.theme} value={t.theme}>{t.label}</option>)}
          </select>
        </label>
        <label className="row small">
          Akzentfarbe
          <input type="color" value={a.accent || '#4f46e5'} onChange={(e) => set({ accent: e.target.value })} />
          {a.accent && <button className="icon" onClick={() => set({ accent: '' })} aria-label="Akzentfarbe zurücksetzen" title="Zurücksetzen">↺</button>}
        </label>
        <button onClick={() => updateSettings({ appearance: defaultAppearance() })}>Design zurücksetzen</button>
      </div>
      {a.glass && (
        <label className="row small">
          Milchigkeit
          <span className="muted">klar</span>
          <input type="range" min={0} max={100} step={5} value={a.glassLevel} onChange={(e) => set({ glassLevel: Number(e.target.value) })} className="grow" aria-label="Milchigkeit" />
          <span className="muted">milchig</span>
        </label>
      )}
      {a.glass && a.background === 'standard' && (
        <p className="muted small">Tipp: Der Glas-Effekt wirkt am schönsten mit einem Bild oder Verlauf als Hintergrund.</p>
      )}
      {a.background === 'bild' && a.image.startsWith('data:') && (
        <p className="muted small">Tipp: Große Bilder lieber als Link einfügen, damit der Browser-Speicher reicht.</p>
      )}
    </div>
  );
}
