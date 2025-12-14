
# TSV Königsbrunn – Hallenmasters · Dynamischer Funino-Spielplan (mit Sieger-Buttons)

Diese GitHub Pages Seite bietet einen **Ergebnis-abhängigen Spielplan**: Nach jeder Runde werden die Paarungen der nächsten Runde gemäß frei konfigurierbaren Regeln (Sieger/Verlierer je Feld) **automatisch berechnet**. Zusätzlich kannst du per **Sieger-Button** (Team1/Team2) ohne Toreingabe direkt einen Sieger markieren.

## Neu in dieser Version
- **Sieger-Buttons** pro Spiel ("Team1 siegt" / "Team2 siegt"): setzt intern 1:0 bzw. 0:1 und triggert die Neuberechnung.
- Anzeige "✓ gespeichert" bei bereits hinterlegten Ergebnissen.
- Vorbelegung der Toreingabefelder mit gespeicherten Werten.

## Nutzung
1. Teams je Gruppe eintragen (pro Zeile ein Team).
2. Zeiten und Rotationsmuster setzen.
3. **Slots & Runde 1 anlegen**.
4. Für jedes Spiel: Entweder Tore eingeben und **Speichern**, oder **Sieger-Button** klicken.

## Deployment (GitHub Pages)
1. Repository anlegen: `tsv-koenigsbrunn-hallenmasters`
2. Dateien im Repo-Root hochladen.
3. `Settings → Pages → Deploy from a branch → main / root`.

## Hinweise
- **Unentschieden**: Markiere den Sieger über den Button (falls ihr Golden Goal o. Ä. nutzt). Ohne Sieger bleibt die nächste Runde für diese Gruppe **TBD**.
- **Regel-Editor**: Stelle sicher, dass die Rollen `W1,L1,W2,L2,W3,L3` sinnvoll verteilt sind (aktuell keine Duplikatsprüfung).
- **Rundenanzahl**: Standardmäßig bis zu 6 Runden pro Gruppe (im Code `roundsNeeded` anpassbar).

## Lizenz
MIT (siehe LICENSE)
