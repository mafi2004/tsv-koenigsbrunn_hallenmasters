// server/routes/qr.js
// -----------------------------------------------------------------------------
// Diese Datei stellt eine API‑Route zur Erzeugung von QR‑Codes bereit.
//
// Hauptaufgabe:
// - GET /api/qr → Liefert ein PNG-Bild mit einem QR‑Code
//
// Der QR‑Code kann über Query‑Parameter konfiguriert werden:
//   text   (Pflicht)  → Inhalt des QR‑Codes (URL/Text)
//   size   (optional) → Pixelbreite (64..1024), Default 256
//   margin (optional) → Rand in Modulen (0..8), Default 1
//   ec     (optional) → Fehlerkorrekturlevel L|M|Q|H, Default M
//
// Die Route wird z. B. genutzt, um QR‑Codes für Viewer‑Links im Admin‑Panel
// zu erzeugen.
// -----------------------------------------------------------------------------

const express = require('express');
const QRCode = require('qrcode');

const router = express.Router();

/**
 * GET /api/qr
 * Erzeugt einen QR‑Code als PNG‑Buffer.
 *
 * Query‑Parameter:
 *  - text   (required): Inhalt des QR‑Codes
 *  - size   (optional): Pixelbreite (64..1024), Default 256
 *  - margin (optional): Rand in Modulen (0..8), Default 1
 *  - ec     (optional): Fehlerkorrekturlevel L|M|Q|H, Default M
 *
 * Rückgabe:
 *  - Content-Type: image/png
 *  - PNG‑Buffer des QR‑Codes
 */
router.get('/', async (req, res) => {
  try {
    // Pflichtparameter: Text
    const text = String(req.query.text || '').trim();
    if (!text) {
      return res.status(400).json({ error: 'Parameter "text" fehlt oder ist leer.' });
    }

    // Größe validieren
    const sizeReq = Number(req.query.size);
    const size = Number.isFinite(sizeReq)
      ? Math.min(Math.max(sizeReq, 64), 1024)
      : 256;

    // Rand validieren
    const marginReq = Number(req.query.margin);
    const margin = Number.isFinite(marginReq)
      ? Math.min(Math.max(marginReq, 0), 8)
      : 1;

    // Fehlerkorrekturlevel validieren
    const ec = String(req.query.ec || 'M').toUpperCase();
    const ecLevel = ['L', 'M', 'Q', 'H'].includes(ec) ? ec : 'M';

    // QR‑Code erzeugen
    const buffer = await QRCode.toBuffer(text, {
      type: 'png',
      width: size,
      margin,
      errorCorrectionLevel: ecLevel
    });

    // PNG zurückgeben
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store'); // kein Browser‑Caching
    res.send(buffer);

  } catch (err) {
    console.error('QR-Error:', err);
    res.status(500).json({
      error: 'QR-Erzeugung fehlgeschlagen',
      details: String(err?.message || err)
    });
  }
});

module.exports = router;
