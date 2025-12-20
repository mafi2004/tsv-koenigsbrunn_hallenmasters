const input = document.getElementById('qrBase');
const qrimg = document.getElementById('qr-img');
const button = document.getElementById('btnSaveQRBase');

button.addEventListener('click', () => {
	const inputValue = input.value;
	
	if (!inputValue) {
		alert("invalid URL");
		return;
	}
	else {
		qrimg.src = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${'http://' + encodeURIComponent(inputValue)+ ':3001/viewer.html'}`;
        qrimg.alt = `QR Code for ${inputValue}`; 
	}
});