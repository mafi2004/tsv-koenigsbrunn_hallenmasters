# TSV Königsbrunn – Hallenmasters · Kombi (Shortlink + QR, 2‑Spalten Layout)

Diese Version bringt:
- **2‑Spalten Layout**: links Konfiguration, rechts die Tabelle „Nur nächste Runde“.
- **Kurzlink** via Hash + Kompression (LZ‑String, URI‑safe), keine „URI Too Long“.
- **QR‑Code**: Anzeige im Modal + PNG‑Download.
- **Sticky‑Header Fix**: Tabellenkopf überdeckt keine Daten.
- **Slot‑Logik** für beliebige Gruppen (A allein funktioniert) mit automatischer Erweiterung.

## Nutzung
1. `admin.html` öffnen → konfigurieren → **Slots & Runde 1**.
2. Ergebnisse speichern oder Sieger‑Buttons benutzen.
3. **Zuschauer‑Link (kurz)** erzeugen **oder** **QR‑Code anzeigen**.
4. Zuschauer öffnen `viewer.html#s=...` oder nutzen `schedule.json` (Fallback).

## Deployment
- Dateien ins Repo‑Root: `admin.html`, `viewer.html`, `assets/`, `.nojekyll`.
- Admin: `https://<account>.github.io/<repo>/admin.html`

## Lizenz
MIT
