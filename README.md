
# TSV Königsbrunn – Hallenmasters · Kombi-Projekt (Admin + Zuschauer)

Dieses Projekt enthält **zwei Seiten**:

- `admin.html` – **Admin-Dashboard** für Konfiguration, Ergebnisse, und Veröffentlichung.
- `viewer.html` – **Read-Only Zuschauer-Ansicht** mit Zeiten, Feldern, Gruppen und Teams.

## Datenfluss (ohne Backend)
- Die Admin-Seite erzeugt aus dem aktuellen Zustand ein kompaktes JSON-Payload (nur **nächste Runde je Gruppe** mit Zeiten).
- **Veröffentlichung:**
  1. **Share-Link** (empfohlen): Ein Klick auf **„Zuschauer-Link generieren“** erstellt einen Link `viewer.html?s=<BASE64>`, der die Daten **im URL-Parameter** transportiert – ideal für schnelles Teilen per Messenger.
  2. **JSON-Export:** Button **„Export schedule.json“** speichert eine Datei. Du kannst sie ins **Repo-Root** hochladen, dann lädt `viewer.html` diese Datei automatisch.

> Hinweis: Ohne Server kann die Admin-Seite nicht direkt Dateien ins Repo schreiben. Der **Share-Link** ist deshalb der einfachste Weg.

## Champions‑League‑Modus (Preset)
- Feld 1: `W1 vs W2`
- Feld 2: `W3 vs L1`
- Feld 3: `L3 vs L2`

Du kannst das Mapping im **Regel‑Editor** überschreiben (pro Gruppe A/B/C).

## „Nur nächste Runde“
- Die Admin-Seite zeigt pro Gruppe **nur die nächste Runde**.
- Erst nach **drei gespeicherten Ergebnissen** (kein Unentschieden) wird die nächste Runde erstellt.

## Sticky‑Header Fix
Die Tabellenköpfe überdecken keine Daten mehr. Ein **ResizeObserver** misst die `<header>`‑Höhe und setzt einen dynamischen Offset (auch mobil/responsive).

## Deployment (GitHub Pages)
1. Repository anlegen: `tsv-koenigsbrunn-hallenmasters`
2. Dateien im **Root** hochladen:
   - `admin.html`, `viewer.html`, `assets/`, `.nojekyll`
3. Settings → Pages → Deploy from a branch → **main / root**
4. Admin-Link öffnen: `https://<account>.github.io/tsv-koenigsbrunn-hallenmasters/admin.html`
5. Zuschauer-Link über **„Zuschauer-Link generieren“** kopieren und verteilen.

## Optional
- Statusleisten „A: 2/3 Ergebnisse“
- Live-Tabelle (Punkte, Tore, TD)
- Branding (Logo, Farben), Impressum/Datenschutz

## Lizenz
MIT (siehe LICENSE)
