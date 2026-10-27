# AntonOS 🎓

Ein persönliches Studien-Betriebssystem im Browser, inspiriert von Notion-Templates wie *Academia OS*, aber als eigene Web-App.

## Funktionen

- **Dashboard:** offene Aufgaben, fällige Lernkarten, nächste Prüfung, Notenschnitt, Schnellnotiz, Ziele und Kursfortschritt auf einen Blick
- **Kurse:** mit Kürzel, Semester, Dozent/in, Raum, ECTS und Farbe. Jede Kursseite bündelt Aufgaben, Prüfungen, Lernkarten, Noten und Notizen.
- **Aufgaben:** Aufgaben, Lektüre, Projekte und Bewerbungen mit Status, Priorität und Fälligkeit, filterbar
- **Notizen:** pro Kurs, mit Suche und automatischem Speichern
- **Lernkarten:** Wiederholung nach dem Prinzip der verteilten Wiederholung (vereinfachter SM-2-Algorithmus wie bei Anki), bedienbar per Tastatur (Leertaste, 1–4)
- **Prüfungen:** mit Countdown
- **Noten:** deutsches Notensystem (1,0–5,0). Teilnoten werden pro Kurs gewichtet, der Gesamtschnitt nach ECTS. Wie in vielen Prüfungsordnungen wird nach der ersten Nachkommastelle abgeschnitten.
- **Ziele:** Vision Board nach Lebensbereichen mit Fortschritt
- **Fokus:** Timer mit Ablenkungszähler und Wochenübersicht
- **Einstellungen:** Backup als JSON exportieren und importieren, Beispieldaten laden, alles zurücksetzen

Alle Daten bleiben lokal im Browser (`localStorage`). Es gibt keinen Server und kein Konto.

## Loslegen

```bash
npm install
npm run dev        # Entwicklungsserver auf http://localhost:5173
npm test           # Tests für Spaced Repetition, Noten und Datumslogik
npm run build      # Produktions-Build nach dist/
```

Beim ersten Start werden Beispieldaten geladen. Unter *Einstellungen → Alles löschen* startest du mit einem leeren System.

## Aufbau

```
src/
  types.ts          Datenmodell
  store.tsx         Zustand + Speicherung im Browser
  demo.ts           Beispieldaten
  lib/              reine Logik (Daten, Spaced Repetition, Noten) + Tests
  components/       wiederverwendbare UI-Bausteine
  pages/            eine Datei pro Bereich
```

Technik: React 19, TypeScript, Vite, Vitest.
