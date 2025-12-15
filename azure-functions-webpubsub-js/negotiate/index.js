module.exports = async function (context, req, connection) {
  // Liefert die von der Binding generierte WebSocket-Verbindungsinfo
  // z.B. { url, accessToken, ... }
  context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: connection };
};
