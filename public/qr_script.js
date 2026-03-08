// public/.../qr.js
// -----------------------------------------------------------------------------
// Erzeugt dynamisch einen QR‑Code für den Viewer (3v3 oder 5v5),
// abhängig davon, auf welcher Admin-Seite sich der Benutzer befindet.
//
// Ablauf:
// 1) Button-Klick → aktuellen Modus erkennen (3v3 oder 5v5)
// 2) Viewer-URL zusammenbauen
// 3) QR-Code über externen Dienst generieren
// 4) Bild im <img>-Element anzeigen
// -----------------------------------------------------------------------------

const input = document.getElementById('qrBase');
const qrimg = document.getElementById('qr-img');
const button = document.getElementById('btnSaveQRBase');

button.addEventListener('click', () => {
    const inputValue = input.value;

    // Modus automatisch erkennen anhand der URL
    const is5v5 = window.location.pathname.includes('/5v5/');
    const viewerPath = is5v5 ? '/5v5/viewer.html' : '/3v3/viewer';

    // Feste Domain des Deployments
    const fullUrl = `https://tsv-koenigsbrunn-hallenmasters.onrender.com${viewerPath}`;

    // QR-Code erzeugen (externer Dienst)
    qrimg.src = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(fullUrl)}`;
    qrimg.alt = `QR Code for ${fullUrl}`;
});
