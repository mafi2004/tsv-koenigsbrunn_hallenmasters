const io = require("socket.io-client");

test("receives matches:updated", done => {
  const socket = io("http://localhost:3000/minis5");

  socket.on("matches:updated", () => {
    socket.disconnect();
    done();
  });

  // Trigger event
  setTimeout(() => {
    global.emitMatchesUpdated(); // Hilfsfunktion im Testserver
  }, 200);
});
