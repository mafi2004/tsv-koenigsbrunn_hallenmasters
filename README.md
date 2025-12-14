
# Funino Spielplan – GitHub Pages Projekt

Eine statische Webseite, die einen **dynamisch anpassbaren Spielplan** für ein Funino-Hallenturnier (3 Felder, 3 Gruppen à 6 Teams) bereitstellt.

## Live-Demo

Lade die Dateien in ein GitHub-Repository und aktiviere **GitHub Pages** (siehe unten). Die Seite funktioniert vollständig ohne Backend.

## Features
- Konfiguration: Startzeit, Spielzeit, Pause, Anzahl Felder
- Gruppen-Rotation (z. B. `A,B,C,A,B,C`)
- Round-Robin-Generator pro Gruppe
- Filter nach Gruppe, Feld und Team
- Export als CSV/JSON, Druck-/PDF-Ansicht
- Persistenz via `localStorage`

## Ordnerstruktur
```
.
├── index.html           # Hauptseite (inkl. CSS/JS)
├── assets/
│   └── favicon.svg      # Favicon
├── .nojekyll            # Deaktiviert Jekyll für GitHub Pages
└── LICENSE              # MIT-Lizenz
```

## Nutzung
1. **Teams eintragen**: In den Textfeldern je Gruppe pro Zeile einen Teamnamen.
2. **Parameter setzen**: Startzeit, Spielzeit, Pausenzeit, Felder und Rotationsmuster.
3. **Spielplan generieren**: Button klicken – Tabelle füllt sich automatisch.
4. **Filter/Export/Druck**: Oben rechts verfügbar.

## Deployment auf GitHub Pages
1. Erstelle bei GitHub ein neues Repository (z. B. `funino-turnier`).
2. Lade alle Dateien aus diesem Projekt in den Root des Repos hoch.
3. Gehe zu **Settings → Pages** und wähle:
   - *Build and deployment*: **Deploy from a branch**
   - *Branch*: **main** (oder dein Standardbranch)
   - *Folder*: **/** (Root)
4. Speichern und nach wenigen Minuten ist die Seite unter `https://<dein-account>.github.io/<repo-name>/` erreichbar.

> Optional: Füge eine `CNAME`-Datei hinzu, wenn du eine **eigene Domain** verwenden möchtest.

## Anpassungen
- **Mehr Gruppen**: Das Script unterstützt bereits Labels über das Rotationsmuster; für UI-Erweiterungen (z. B. Gruppe D/E) bitte `index.html` anpassen.
- **Gemischte Slots** (alle Gruppen gleichzeitig auf unterschiedlichen Feldern): Kann integriert werden, indem die Slot-Logik geändert wird.
- **Ergebnis-Erfassung**: Erweiterbar um Spielstände und Tabellen.

## Lizenz
[MIT](LICENSE)
