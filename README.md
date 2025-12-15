
# TSV Königsbrunn – Hallenmasters · Kombi (Shortlink + QR, 2‑Spalten Layout, Fix)

**Fixes**
- Regel‑Editor initialisiert die Selects **zuverlässig** (A/B/C × F1–F3) und setzt das CL‑Preset.
- Button **„Slots & Runde 1“** ist neu **robust** (mit Fehlermeldung im roten Banner bei Problemen).
- QR‑Modal + Shortlink funktionieren; PNG‑Download hängt sich an das gerenderte QR‑Canvas.
- Sticky‑Header Fix aktiv, Slot‑Logik erweitert, Rotation auf vorhandene Gruppen gefiltert.

## Nutzung
1. `admin.html` öffnen → konfigurieren → **Slots & Runde 1**.
2. Ergebnisse speichern oder Sieger‑Buttons (Team 1/2 siegt).
3. **Zuschauer‑Link (kurz)** generieren oder **QR‑Code anzeigen**; Zuschauer öffnen `viewer.html#s=...`.
4. Optional: `schedule.json` exportieren und ins Repo‑Root legen.

## Deployment (GitHub Pages)
- Dateien ins Repo‑Root: `admin.html`, `viewer.html`, `assets/`, `.nojekyll`.

## Lizenz
MIT
=======
# TSV Königsbrunn – Hallenmasters · Kombi (Shortlink + QR, 2‑Spalten, Version im Footer)

Diese Version zeigt in der **Fußzeile der Admin-Seite**:
- **Version**: v1.3.0
- **Build-Zeit**: 2025-12-14 16:45
- **Geladen**: wird beim Initialisieren mit der **aktuellen lokalen Zeit** gefüllt.
