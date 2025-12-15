# TSV Königsbrunn – Hallenmasters · Kombi (Shortlink + QR)

Diese Version kombiniert Admin- und Zuschauer-Seite mit einem **kurzen Zuschauer-Link** (Kompression + URL-Hash) **und QR-Code**.

## Was ist neu?
- **Kurzlink**: Admin erzeugt `viewer.html#s=<komprimiert>` (LZ-String, URI-safe). Der Hash wird nicht an den Server geschickt.
- **QR-Code**: Button "QR-Code anzeigen" erzeugt einen scannbaren Code direkt im Browser (ohne externe Pakete). PNG-Download inklusive.
- **Fallback**: Export als `schedule.json`; die Zuschauer-Seite lädt diese automatisch, wenn kein Hash vorhanden ist.

## Nutzung
1. `admin.html` öffnen → konfigurieren → **Slots & Runde 1**.
2. Ergebnisse pflegen → **Zuschauer-Link (kurz)** oder **QR-Code anzeigen**.
3. Link/QR teilen; Zuschauer öffnen `viewer.html`.
4. Optional: `schedule.json` ins Repo-Root legen.

## Deployment (GitHub Pages)
- Dateien ins Root hochladen: `admin.html`, `viewer.html`, `assets/`, `.nojekyll`.
- Admin: `https://<account>.github.io/<repo>/admin.html`

## Lizenz
MIT
