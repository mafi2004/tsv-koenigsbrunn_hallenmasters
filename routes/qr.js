
// routes/qr.js
const express = require('express');
const QRCode = require('qrcode');

const router = express.Router();

/**
 * GET /api/qr?text=...&size=...&margin=...&ec=...
 * Liefert ein PNG (image/png) mit QR-Code zum gegebenen Text.
 * Query:
 *  - text (required): Inhalt (URL/Text), z. B. https://deinservice/3v3/viewer.html
 *  - size (optional): Pixelbreite, Default 256, erlaubt 64..1024
 *  - margin (optional): Rand in Modulen, Default 1, 0..8
 *  - ec (optional): Fehlerkorrektur L|M|Q|H (Default M)
 */
router.get('/', async (req, res) => {
  try {
    const text = String(req.query.text || '').trim();
    if (!text) {
      return res.status(400).json({ error: 'Parameter "text" fehlt oder ist leer.' });
    }

    const sizeReq = Number(req.query.size);
    const size = Number.isFinite(sizeReq) ? Math.min(Math.max(sizeReq, 64), 1024) : 256;

    const marginReq = Number(req.query.margin);
    const margin = Number.isFinite(marginReq) ? Math.min(Math.max(marginReq, 0), 8) : 1;

    const ec = String(req.query.ec || 'M').toUpperCase();
    const ecLevel = ['L','M','Q','H'].includes(ec) ? ec : 'M';

    const buffer = await QRCode.toBuffer(text, {
      type: 'png',
      width: size,
      margin,
      errorCorrectionLevel: ecLevel
    });

    res.setHeader('Content-Type', 'image/png');
    // Für Admin-CacheBust ist no-store ok; alternativ: kurz cachen.
    res.setHeader('Cache-Control', 'no-store');
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
