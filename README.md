# 3. Königsbrunner Mini‑Fußball Hallenmasters  
**Turnierverwaltung & Live‑Viewer für 3v3 und 5v5**

Dieses Repository enthält das komplette Web‑System für das  
**3. Königsbrunner Mini‑Fußball Hallenmasters** – bestehend aus:

- einem **Admin‑Panel** (Teams, Spielplan, Zeitmanagement)
- einem **Live‑Viewer** (Tiles, Spielplan, Teams, Hallenlayout, Regeln)
- einer **REST‑API** für Teams & Matches
- einem **Socket.IO‑System** für Live‑Updates
- getrennten Modulen für **3v3** und **5v5**
- Export/Import‑Funktionen
- QR‑Code‑Integration für Zuschauer

Das System ist vollständig mobiloptimiert und für Live‑Betrieb in der Halle ausgelegt.

---

## 🚀 Features

### **Admin‑Panel**
- Passwortgeschützt (lokal via `admin_password.js`)
- Teams verwalten (Hinzufügen, Löschen, Import/Export)
- Spielplan generieren (Startzeit, Spieldauer, Pausen)
- Ergebnisse setzen (Sieger A/B oder Reset)
- Live‑Statistiken (Zuschauer online, Gesamtbesucher)
- QR‑Code‑Generator für Viewer‑Link
- Sofortige Live‑Synchronisation über Socket.IO

### **Viewer**
- **Tiles‑Ansicht** (Spielfeldbelegung, 2 Felder)
- **Spielplan‑Tabelle**
- **Teams‑Übersicht**
- **Hallenlayout** mit Team‑Overlays
- **Regelübersicht**
- **Mirror‑Mode** (Ansicht spiegeln)
- Live‑Updates ohne Reload
- Mobile‑optimiert

---

## 📁 Projektstruktur

public/\
├── 3v3/\
│    ├── admin.html\
│    ├── viewer.html\
│    ├── minis3_admin.js\
│    ├── minis3_viewer.js\
│    └── minis3_styles.css\
├── 5v5/\
│    ├── admin.html\
│    ├── viewer.html\
│    ├── minis5_admin.js\
│    ├── minis5_viewer.js\
│    └── minis5_styles.css\
├── assets/\
│    ├── Fussballwappen_logo.png\
│    ├── bg_hallenmasters_Gym2.jpg\
│    ├── bg_hallenmasters_Gym2_mirrored.jpg\
│    ├── regeln.jpg\
│    └── save_the_date.jpg\
├── api/\
│    └── minis5 (Express‑API)\
└── socket.io/\


---

## 🔌 Backend‑API (Kurzüberblick)

### **Teams**

GET    /api/minis5/teams\
POST   /api/minis5/teams\
DELETE /api/minis5/teams\
DELETE /api/minis5/teams/:id\

### **Matches**

GET    /api/minis5/matches\
DELETE /api/minis5/matches\
POST   /api/minis5/matches/generate\
POST   /api/minis5/matches/updateResult\

### **QR‑Code**

GET /api/qr?text=...&size=128


---

## 🔄 Live‑Updates (Socket.IO)

Der Viewer und das Admin‑Panel reagieren auf folgende Events:

| Event              | Bedeutung |
|-------------------|-----------|
| `matches:updated` | Spielplan geändert |
| `winner:updated`  | Ergebnis geändert |
| `teams:updated`   | Teams geändert |
| `viewerCount5`    | Zuschauerzahl aktualisiert |
| `reset-5v5`       | Viewer/Admin neu laden |
| `reset-all`       | Gesamtsystem neu laden |

---

## 📦 Export / Import

### **Export**
Erzeugt eine Datei:

teams_export.json


mit:

- Teams
- Gruppen
- Zeitplan‑Einstellungen
- Export‑Zeitstempel

### **Import**
- Löscht alle Teams
- Übernimmt Zeitplan‑Einstellungen
- Fügt Teams neu ein

---

## 🔐 Passwortschutz

Das Admin‑Panel ist durch ein Overlay geschützt.  
Das Passwort wird in:

public/admin_password.js


gesetzt und lokal im Browser gespeichert.

---

## 🧩 Mirror‑Mode

Der Viewer kann per Checkbox die Ansicht spiegeln:

- Tiles: Feld 1 ↔ Feld 2  
- Hallenlayout: Team‑Overlays werden gespiegelt  
- Perfekt für Anzeige auf der gegenüberliegenden Hallenseite

---

## 📱 Responsive Design

- Mobile‑optimierte Schriftgrößen
- Tiles und Tabellen passen sich dynamisch an
- Hallenlayout skaliert sauber auf Smartphones

---

## 🛠 Entwicklung

### Starten (lokal)

npm install
npm start


### Ordner für statische Dateien

public/


### API & Socket.IO laufen unter:

/api/minis5
/minis5 (Socket Namespace)


---

## 🧪 Lokale Entwicklung (Empfohlen)

- Lokalen Webserver starten (`npm start`)
- Admin öffnen:
  - `http://localhost/5v5/admin.html`
  - `http://localhost/3v3/admin.html`
- Viewer öffnen:
  - `http://localhost/5v5/viewer.html`
  - `http://localhost/3v3/viewer.html`
- Socket‑Events werden automatisch verbunden


---

## 👤 Autor

**Markus Finke**  
TSV Königsbrunn – Jugendfußball  
Kontakt: finke.markus@gmx.de

---

## ❤️ Hinweise

Dieses System wurde speziell für das  
**3. Königsbrunner Mini‑Fußball Hallenmasters** entwickelt und ist modular aufgebaut, damit es für zukünftige Turniere leicht erweitert werden kann.





