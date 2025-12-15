
# TSV Königsbrunn – Hallenmasters · Nächste Runde (Champions‑League‑Modus)

Diese Variante zeigt **pro Gruppe immer nur die nächste Runde**. Erst wenn **alle drei Ergebnisse** der aktuellen Runde gespeichert sind, wird die nächste Runde erzeugt. Zusätzlich gibt es das Preset **„Champions‑League‑Modus“**:

- **Feld 1:** `W1 vs W2`
- **Feld 2:** `W3 vs L1`
- **Feld 3:** `L3 vs L2`

Das entspricht deiner Beschreibung: *„Gewinner von Feld 3 auf Feld 2 gegen Verlierer von Feld 1; Gewinner von Feld 2 auf Feld 1; Verlierer von Feld 2 auf Feld 3“* — ergänzt um die naheliegenden **Bleiber** `W1` (Feld 1) und `L3` (Feld 3), sodass alle sechs Rollen `W1/L1/W2/L2/W3/L3` genau einmal verwendet werden.

## Bedienung
1. Teams je Gruppe eintragen → **Slots & Runde 1 anlegen**.
2. Ergebnisse je Spiel erfassen **oder** Sieger-Buttons klicken.
3. Sobald je Gruppe **3 Ergebnisse** vorliegen (kein Unentschieden), wird die **nächste Runde** gemäß Preset/Editor erzeugt und angezeigt.

## Regel‑Editor
Das Preset kann überschrieben werden. Für jedes Feld der nächsten Runde wählst du zwei Rollen aus den sechs Rollen der vorherigen Runde.

## Speicherung
Konfiguration, Mapping‑Auswahl, Ergebnisse, Matches & aktuelle Runde werden in `localStorage` gesichert (`funino_cfg_v5`, `funino_state_v5`).

## Deployment (GitHub Pages)
1. Repo anlegen: `tsv-koenigsbrunn-hallenmasters`
2. Dateien im Root hochladen.
3. **Settings → Pages → Deploy from a branch → main / root**.

## Lizenz
MIT (siehe LICENSE)
