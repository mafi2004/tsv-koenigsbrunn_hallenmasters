
# TSV Königsbrunn – Hallenmasters · Dynamischer Funino-Spielplan

Diese GitHub Pages Seite bietet einen **Ergebnis-abhängigen Spielplan**: Nach jeder Runde werden die Paarungen der nächsten Runde gemäß frei konfigurierbaren Regeln (Sieger/Verlierer je Feld) **automatisch berechnet**.

## Features
- 3 Felder · 3 Gruppen à 6 Teams (anpassbar)
- **Ergebnis-Erfassung** pro Spiel (Toreingabe)
- **Regel-Editor**: definiere pro Gruppe, wie Sieger/Verlierer der vorherigen Runde den nächsten Paarungen zugeordnet werden (\`W1/L1/W2/L2/W3/L3\` → Sieger/Verlierer von Feld 1/2/3)
- **Seed-Runde**: Runde 1 wird aus der Teamliste initialisiert (0/1 auf Feld1, 2/3 auf Feld2, 4/5 auf Feld3)
- Filter, CSV/JSON-Export, Druckansicht
- Persistenz: `localStorage`

## Beispielregel (Gruppe A)
- Sieger von Feld 3 → **Feld 2** gegen Verlierer von Feld 1
- Sieger von Feld 1 **bleibt** (Feld 1)
- Verlierer von Feld 3 **bleibt** (Feld 3)
- Standard-Gegner: Feld 1: \`W1 vs L2\`; Feld 2: \`W3 vs L1\`; Feld 3: \`L3 vs W2\`. Du kannst das im Regel-Editor ändern.

## Nutzung
1. Teams je Gruppe eingeben (pro Zeile ein Team).
2. Zeiten und Rotationsmuster setzen.
3. **Slots & Runde 1 anlegen**.
4. Ergebnisse pro Spiel eingeben → die **nächste Runde** für die betreffende Gruppe wird automatisch berechnet.

## Deployment (GitHub Pages)
1. Repository anlegen: `tsv-koenigsbrunn-hallenmasters`
2. Dateien im Repo-Root hochladen (siehe Ordnerstruktur unten).
3. `Settings → Pages → Deploy from a branch → main / root`.

## Ordnerstruktur
```
.
├── index.html           # Seite mit CSS/JS & Rule-Editor
├── assets/
│   └── favicon.svg      # Favicon
├── .nojekyll            # Jekyll deaktivieren
└── LICENSE              # MIT-Lizenz
```

## Hinweise
- **Unentschieden**: Bei Gleichstand kann die nächste Runde nicht abgeleitet werden. Bitte einen Sieger festlegen (Hausregel: 1 Punkt Unterschied, Golden Goal, oder manuelle Markierung). 
- **Validierung**: Der Rule-Editor prüft derzeit keine Duplikate. Achte darauf, dass jede der sechs Rollen (\`W1,L1,W2,L2,W3,L3\`) genau einmal verwendet wird.
- **Mehr Runden**: Standardmäßig werden Slots für bis zu 6 Runden pro Gruppe angelegt. Du kannst das im Code (`roundsNeeded`) anpassen.

## Lizenz
MIT (siehe LICENSE)
