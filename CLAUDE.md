# AntonOS – Hinweise für Claude

Persönlicher Life-Organizer (Studium, Aufgaben, Kalender, Finanzen …) als React-PWA im Apple-Stil.
Nutzer und Sprache: **Deutsch** – Oberfläche, Code-Kommentare und Commit-Nachrichten auf Deutsch.
Funktionsübersicht für Nutzer steht in `README.md` (nur bei Bedarf lesen).

## Befehle
- `npm test` – Vitest (nur `src/lib/*.test.ts`, reine Logik)
- `npm run build` – Typecheck (`tsc --noEmit`) + Vite-Build nach `dist/`
- `npm run dev` – Entwicklungsserver auf http://localhost:5173
- `npm run ios` – Build + `cap sync ios` (kopiert `dist/` ins Xcode-Projekt `ios/`)
- Vor jedem Push: `npm test` und `npm run build` müssen grün sein.

## Aufbau
- Stack: React 19, TypeScript, Vite, Vitest, lucide-react, Supabase (nur Sync). Kein Router, kein CSS-Framework.
- `src/App.tsx` – Shell, Sidebar und Hash-Routing (`#/seite/param`, Switch in `Page`); Startseite am Handy `heute`, am PC `dashboard`
- Handy-Gerüst in `components/shell.tsx`: Tab-Leiste (3 wählbare Tabs in `settings.tabs` + Bereiche + Suche), Plus-Knopf, Wischen zum Schließen von Blättern; Seiten `pages/Today.tsx` (Heute, nach Tageszeit) und `pages/Areas.tsx` (Kacheln). Bereichsfarben, Kachel-Hinweise und Tageszeit in `lib/areas.ts`
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
- iOS-App: Capacitor (`capacitor.config.ts`, Projekt in `ios/`, Swift Package Manager). Anton hat keinen Mac – gebaut und zu TestFlight hochgeladen wird über `.github/workflows/ios.yml` (manuell starten, Secrets siehe Datei). Native Brücke in `src/lib/native.ts` (`isNativeApp()`), Erinnerungen werden im Voraus beim System angemeldet (`src/lib/schedule.ts`, `components/native.tsx`). Neue Erinnerungsarten dort mit gleichem `tag` wie im Web ergänzen, sonst kommen sie doppelt. Eigenes Plugin `AntonAlarm` (echter Wecker über AlarmKit, iOS 26) in `ios/App/App/AntonAlarm.swift`, angemeldet über `AntonBridgeViewController` (Main.storyboard); neue Swift-Dateien von Hand in `project.pbxproj` eintragen.
- Weitere iPhone-Funktionen im Plugin `AntonExtras` (`ios/App/App/AntonExtras.swift`, JS in `lib/native.ts`, Logik in `components/extras.tsx`): Face ID (`LockGate`), Apple Health (Entitlement `com.apple.developer.healthkit`), Texterkennung für Kassenzettel, Orts-Mitteilungen (Kennung `antonos-ort-…`) und die Live-Aktivität des Fokus-Timers (`FocusActivity.swift` gehört zu App und Widget-Erweiterung, Ansicht in `FocusLiveActivity.swift`; Felder gleich halten mit `FocusActivityState`). Siri/Kurzbefehle in `AntonIntents.swift` (Warteschlange `IntentQueue`, abgeholt per `takeIntents`).
- iOS-Widgets: Erweiterung `ios/App/AntonOSWidgets` (WidgetKit, ab iOS 17, Kontrollzentrum ab 18). Die App rechnet den Stand in `src/lib/widgets.ts` (`widgetSnapshot`) und legt ihn per Plugin `AntonWidgets` (`ios/App/App/AntonWidgets.swift`) in die App Group `group.io.github.pixeltoni.antonos`; im Widget Abgehaktes kommt als Warteschlange zurück (`resolveWidgetActions`, `components/ioswidgets.tsx`). Felder in `WidgetSnapshot` und `WidgetData.swift` gleich halten. Links `antonos://open/<seite>`, `antonos://assistent`, `antonos://fokus-start`. Widget „Läufer“ (`LaeuferWidget.swift`) animiert per Schrift-Trick: `AntonLaeufer.otf` macht aus den Sekunden eines `Text(.., style: .timer)` 60 Bilder; neu erzeugen mit `python3 scripts/laeufer-font.py` (fonttools). Genauso das Tamagotchi „Haustier“ (`HaustierWidget.swift`: Laune nur aus der letzten Mahlzeit in `TierLaune.aus`, Füttern-Knopf `FeedPetIntent`, krank ab 24 h, tot nach 48 h, neues Ei `HatchPetIntent`, Zustand unter `tier.*` in der App Group): je Laune eine Schrift `AntonTier*.otf` aus `scripts/haustier-font.py`; gemeinsamer Baukasten `scripts/sekundenschrift.py`. Neue Schriften in `Info.plist` (`UIAppFonts`) und `project.pbxproj` eintragen. `.github/workflows/ios-check.yml` baut bei PRs mit iOS-Änderungen ohne Signatur.
- Antons eigene Lieder als Wecktöne (urheberrechtlich geschützt): nur verschlüsselt in `ios/eigene-toene.tar.gz.enc` (je `antonos-lied-<id>.wav`, 29 s, 22,05 kHz mono), entpackt in `ios.yml` mit Secret `TOENE_SCHLUESSEL`. Neues Lied: Archiv neu verschlüsseln, in `SONGS` (`lib/tones.ts`) und `project.pbxproj` eintragen. Nie unverschlüsselt committen.

## Commits
Kurze deutsche Überschrift, die beschreibt, was sich für Nutzer ändert (z. B. „Wochenrückblick und Stimmung“), darunter Stichpunkte.
