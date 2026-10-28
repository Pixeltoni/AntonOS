# AntonOS – Hinweise für Claude

Persönlicher Life-Organizer (Studium, Aufgaben, Kalender, Finanzen …) als React-PWA im Apple-Stil.
Nutzer und Sprache: **Deutsch** – Oberfläche, Code-Kommentare und Commit-Nachrichten auf Deutsch.
Funktionsübersicht für Nutzer steht in `README.md` (nur bei Bedarf lesen).

## Befehle
- `npm test` – Vitest (nur `src/lib/*.test.ts`, reine Logik)
- `npm run build` – Typecheck (`tsc --noEmit`) + Vite-Build nach `dist/`
- `npm run dev` – Entwicklungsserver auf http://localhost:5173
- Vor jedem Push: `npm test` und `npm run build` müssen grün sein.

## Aufbau
- Stack: React 19, TypeScript, Vite, Vitest, lucide-react, Supabase (nur Sync). Kein Router, kein CSS-Framework.
- `src/App.tsx` – Shell, Sidebar und Hash-Routing (`#/seite/param`, Switch in `Page`)
- `src/store.tsx` – zentraler Zustand (`useStore`: `add`, `update`, `remove`, `mutate` …), gespeichert in `localStorage` (`antonos:v1`), `normalize()` für alte/fremde Daten
- `src/types.ts` – alle Datentypen (`Data` = komplette App-Daten)
- `src/demo.ts` – Beispieldaten und Standard-Einstellungen
- `src/pages/` – eine Datei pro Seite (exportieren teils auch Dashboard-Widgets)
- `src/components/` – geteilte UI (`ui.tsx` Grundbausteine, `icons.tsx`, `sync.tsx` Cloud-Sync, `spotify.tsx`, `calendar.tsx`, `homescreen.tsx` Widgets …)
- `src/lib/` – reine Logik ohne React, mit Tests daneben (`dates.ts`, `recurrence.ts`, `finance.ts`, `srs.ts`, `quickadd.ts`, `layout.ts` …)
- `src/styles.css` – alle Styles in einer Datei
- `vite.config.ts` – erzeugt auch `sw.js` (Service Worker, Offline-Cache) und `version.json`

## Konventionen
- Datum als String `YYYY-MM-DD` (`DateStr`); immer Helfer aus `src/lib/dates.ts` nutzen, nie `toISOString()` für Tage (Zeitzone).
- Neue Logik nach `src/lib/` und dort testen; Komponenten bleiben schlank.
- Neue Datensammlung in `Data`: in `emptyData()` (`store.tsx`) ergänzen und `SCHEMA_VERSION` in `src/lib/version.ts` erhöhen.
- Neue Seite: Fall in `Page` (`App.tsx`), Eintrag in `DEFAULT_SIDEBAR` (`src/lib/layout.ts`), Symbol in `PAGE_ICONS` (`components/icons.tsx`).
- Neues Dashboard-Widget: `WidgetId` (`types.ts`), `DEFAULT_DASHBOARD`/`WIDGET_LABELS` (`lib/layout.ts`), Darstellung in `pages/Dashboard.tsx`.
- Supabase-Adresse und Publishable Key in `src/lib/cloud.ts` sind absichtlich öffentlich (RLS).
- Deploy: Push auf Branch `Main` → GitHub Pages (`.github/workflows/deploy.yml`).

## Commits
Kurze deutsche Überschrift, die beschreibt, was sich für Nutzer ändert (z. B. „Wochenrückblick und Stimmung“), darunter Stichpunkte.
