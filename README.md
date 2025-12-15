
# TSV Königsbrunn – Hallenmasters · Nächste Runde (Champions‑League‑Modus, Patch 2)

**Änderungen gegenüber der letzten Version:**

1. **Sticky‑Header Fix (robust):**
   - `ResizeObserver` misst dynamisch die `<header>`‑Höhe → CSS‑Variable `--page-header-height` wird automatisch aktualisiert.
   - `thead th { top: var(--table-sticky-top) }` verhindert das Überdecken der ersten Datenzeile.
   - `html { scroll-padding-top: ... }` verbessert das Scroll‑Verhalten.

2. **„Zu wenige Slots…“ behoben:**
   - Slot‑Generierung filtert das Rotationsmuster auf **tatsächlich vorhandene Gruppen** (z. B. nur `A`).
   - **Automatisches Erweitern** der Slots, wenn für eine Gruppe weitere Runden benötigt werden (`ensureSlotFor`).

3. **Champions‑League‑Modus (Preset)** bleibt: `F1=W1‑W2`, `F2=W3‑L1`, `F3=L3‑L2`. Regel‑Editor weiterhin vorhanden.

## Nutzung
1. Preset wählen (oder eigenes Mapping)
2. **Slots & Runde 1 anlegen**
3. Pro Gruppe alle 3 Ergebnisse speichern (Tore oder Sieger‑Buttons) → automatische Erzeugung der **nächsten Runde**

## Deployment (GitHub Pages)
1. Repository: `tsv-koenigsbrunn-hallenmasters`
2. Dateien ins Repo‑Root
3. **Settings → Pages → Deploy from a branch → main / root**

## Lizenz
MIT (siehe LICENSE)
