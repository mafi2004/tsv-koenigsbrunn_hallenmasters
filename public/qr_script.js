const input = document.getElementById('qrBase');
const qrimg = document.getElementById('qr-img');
const button = document.getElementById('btnSaveQRBase');

button.addEventListener('click', () => {
    const inputValue = input.value;

    if (!inputValue) {
        alert("invalid URL");
        return;
    }

    // Modus automatisch erkennen
    const is5v5 = window.location.pathname.includes('/5v5/');
    const viewerPath = is5v5 ? '/5v5/viewer.html' : '/viewer.html';

    const fullUrl = `http://${inputValue}:3001${viewerPath}`;

    qrimg.src = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(fullUrl)}`;
    qrimg.alt = `QR Code for ${fullUrl}`;
});
