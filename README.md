
# TSV Königsbrunn – Hallenmasters · Nächste Runde (Champions‑League‑Modus, Sticky‑Header Fix)

Diese Variante zeigt **pro Gruppe immer nur die nächste Runde** und enthält den Fix, dass der **Sticky‑Tabellenkopf** nicht mehr die oberste Datenzeile überdeckt:
- Dynamischer Offset per CSS‑Variablen `--page-header-height` + `--table-sticky-top`
- JavaScript misst die `<header>`‑Höhe und setzt den Offset automatisch (auch responsive)
- `html { scroll-padding-top: ... }` verbessert das Scroll‑Verhalten

## Preset „Champions‑League‑Modus“
- **Feld 1:** `W1 vs W2`
- **Feld 2:** `W3 vs L1`
- **Feld 3:** `L3 vs L2`

## Nutzung
1. Preset wählen (oder Regel‑Editor nutzen)
2. **Slots & Runde 1 anlegen**
3. Ergebnisse pro Gruppe speichern (Tore oder Sieger‑Buttons) → nach 3 Ergebnissen wird **die nächste Runde** automatisch erzeugt und angezeigt

## Deployment (GitHub Pages)
1. Repository: `tsv-koenigsbrunn-hallenmasters`
2. Dateien im Repo‑Root hochladen
3. **Settings → Pages → Deploy from a branch → main / root**

## Lizenz
MIT (siehe LICENSE)
