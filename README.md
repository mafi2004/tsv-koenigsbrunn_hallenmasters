
# TSV Königsbrunn – Hallenmasters · Funino-Spielplan (nur nächste Runde)

Diese Version zeigt **pro Gruppe immer nur die nächste Runde**. Erst wenn **alle drei Ergebnisse** der aktuellen Runde gespeichert sind, wird die nächste Runde gemäß den konfigurierten Regeln automatisch **erzeugt und angezeigt**.

## So funktioniert's
- **Slots & Runde 1 anlegen**: Erstellt Zeitslots aus Startzeit + (Spielzeit + Pause) basierend auf dem Rotationsmuster (z. B. `A,B,C`). Runde 1 wird aus der Teamliste initialisiert (0/1 auf Feld1, 2/3 auf Feld2, 4/5 auf Feld3).
- **Ergebnisse speichern**: Für jede Gruppe müssen **alle 3 Felder** (Feld 1–3) ein Ergebnis erhalten (kein Unentschieden). Danach werden Sieger/Verlierer (`W1/L1/W2/L2/W3/L3`) ermittelt.
- **Nächste Runde erzeugen**: Die Paarungen der nächsten Runde werden gemäß **Regel‑Editor** pro Gruppe zugeordnet und sofort angezeigt.
- **Sieger-Buttons**: Du kannst ohne Toreingabe per Button "Team 1 siegt" / "Team 2 siegt" einen Sieger markieren (intern 1:0 bzw. 0:1).

## Konfiguration
- **Gruppen & Teams**: Je Zeile ein Team (A/B/C).
- **Zeiten**: Startzeit, Spielzeit, Pause.
- **Rotation**: Muster wie `A,B,C,A,B,C` bestimmt die **Slot‑Reihenfolge**; pro Gruppenrunde wird jeweils der **n-te Slot** der Gruppe genutzt.
- **Regeln** (je Gruppe): Weise die Rollen `W1,L1,W2,L2,W3,L3` den Feldern 1–3 der nächsten Runde zu.

## Deployment (GitHub Pages)
1. Repository: `tsv-koenigsbrunn-hallenmasters`
2. Dateien im Repo‑Root hochladen (siehe Struktur unten).
3. `Settings → Pages → Deploy from a branch → main / root`.

## Ordnerstruktur
```
.
├── index.html           # Seite mit "nur nächste Runde"-Logik
├── assets/
│   └── favicon.svg
├── .nojekyll
└── LICENSE
```

## Hinweise
- **Unentschieden**: Ohne Sieger wird die nächste Runde **nicht** erzeugt (TBD). Nutzt ggf. die Sieger‑Buttons.
- **Felder**: Diese Version geht von **3 Feldern** aus (Fix). Anpassbar im Code.
- **Persistenz**: `localStorage` speichert Ergebnisse, Matches und aktuelle Runde (`funino_*_v4`).

## Lizenz
MIT (siehe LICENSE)
