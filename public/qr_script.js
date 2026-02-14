const input = document.getElementById('qrBase');
const qrimg = document.getElementById('qr-img');
const button = document.getElementById('btnSaveQRBase');

button.addEventListener('click', () => {
    const inputValue = input.value;

    // Modus automatisch erkennen
    const is5v5 = window.location.pathname.includes('/5v5/');
    const viewerPath = is5v5 ? '/5v5/viewer.html' : '/3v3/viewer';

    const fullUrl = `https://tsv-koenigsbrunn-hallenmasters.onrender.com${viewerPath}`;

    qrimg.src = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(fullUrl)}`;
    qrimg.alt = `QR Code for ${fullUrl}`;
});
