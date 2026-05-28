const pendingReservations = new Map();

const PAYMENT_TIMEOUT_MS = 24 * 60 * 60 * 1000;

function registerPendingReservation({
  from,
  sock,
  folio
}) {
  clearPendingReservation(from);

  const timeout = setTimeout(async () => {
    if (!pendingReservations.has(from)) return;

    pendingReservations.delete(from);

    await sock.sendMessage(from, {
      text: `Reservacion cancelada

No recibimos el anticipo por transferencia dentro de las 24 horas.

Si deseas reservar nuevamente, escribe:
menu`
    });
  }, PAYMENT_TIMEOUT_MS);

  pendingReservations.set(from, {
    folio,
    timeout
  });
}

function clearPendingReservation(from) {
  const pending = pendingReservations.get(from);

  if (!pending) return null;

  clearTimeout(pending.timeout);
  pendingReservations.delete(from);

  return pending;
}

function hasPendingReservation(from) {
  return pendingReservations.has(from);
}

module.exports = {
  registerPendingReservation,
  clearPendingReservation,
  hasPendingReservation
};
