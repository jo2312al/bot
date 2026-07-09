const {
  readPendingReservationGroupNotifications,
  markReservationGroupNotificationSent
} = require("./groupReservationNotificationService");

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getErrorMessage(error) {
  return error?.stack || error?.message || String(error);
}

function getUniqueSourceLabels(reservations) {
  return Array.from(
    new Set(
      reservations
        .map(reservation =>
          String(reservation.sourceLabel || "").trim()
        )
        .filter(Boolean)
    )
  );
}

function getNotificationHeading(reservations, sourceLabels) {
  if (sourceLabels.length === 1 && reservations.length === 1) {
    return `\uD83C\uDFE8 ${sourceLabels[0].toUpperCase()}`;
  }

  if (sourceLabels.length === 1) {
    return `\uD83C\uDFE8 ${sourceLabels[0].toUpperCase()} (${reservations.length})`;
  }

  if (reservations.length === 1) {
    return "\uD83C\uDFE8 NUEVA RESERVA";
  }

  return `\uD83C\uDFE8 NUEVAS RESERVAS IMPORTADAS (${reservations.length})`;
}

function getReservationDates(reservation) {
  return Array.isArray(reservation.dates) && reservation.dates.length
    ? reservation.dates.join(" al ")
    : reservation.fecha;
}

function getReservationNights(reservation) {
  return Math.max(
    (reservation.dates || []).length - 1,
    1
  );
}

function formatReservationLine(reservation, index, total) {
  const extraAmount =
    Number(reservation.extraAmount || 0);

  const lines = [
    total > 1 ? `*${index + 1}.*` : "",
    reservation.folio ? `\uD83C\uDF9F\uFE0F #${reservation.folio}` : "",
    `\uD83D\uDCDD ${reservation.nombre}`,
    `\uD83D\uDCC5 ${getReservationDates(reservation)}`,
    `\uD83C\uDF19 Noches: ${getReservationNights(reservation)}`,
    `\uD83C\uDFE8 Habitaciones: ${reservation.habitaciones || 1}`,
    `\uD83D\uDC65 Huespedes: ${reservation.adultos || 0} adulto(s), ${reservation.ninos || 0} ni\u00f1o(s)`,
    reservation.tipo ? `\uD83D\uDECF\uFE0F ${reservation.tipo}` : "",
    reservation.roomNumber ? `\uD83D\uDD11 Habitacion asignada: ${reservation.roomNumber}` : "",
    reservation.telefono ? `\uD83D\uDCDE ${reservation.telefono}` : "",
    reservation.hora ? `\u23F0 ${reservation.hora}` : "",
    reservation.tarifa ? `\uD83D\uDCB0 ${reservation.tarifa}` : "",
    reservation.mananera ? "\uD83C\uDF05 Tarifa ma\u00f1anera" : "",
    extraAmount > 0
      ? `\u2795 Extra adulto(s): ${reservation.extraAdults || 0} / +$${extraAmount.toLocaleString("es-MX")}`
      : "",
    reservation.note ? `\uD83D\uDCDD Nota: ${reservation.note}` : ""
  ];

  return lines.filter(Boolean).join("\n");
}

function formatReservationGroupNotification(notification) {
  const reservations =
    notification.reservations || [];
  const sourceLabels =
    getUniqueSourceLabels(reservations);
  const heading =
    getNotificationHeading(reservations, sourceLabels);
  const details =
    reservations.map((reservation, index) =>
      formatReservationLine(reservation, index, reservations.length)
    );

  return [heading, ...details].join("\n\n");
}

function createGroupReservationNotificationWorker({
  botId,
  groupId,
  log,
  intervalMs = 5000,
  sendDelayMs = 1500
}) {
  let timer =
    null;
  let isFlushing =
    false;

  async function flush(sock) {
    if (botId !== "principal" || isFlushing) {
      return;
    }

    isFlushing = true;

    try {
      const pending =
        readPendingReservationGroupNotifications();

      for (const notification of pending) {
        await sock.sendMessage(groupId, {
          text: formatReservationGroupNotification(notification)
        });
        markReservationGroupNotificationSent(notification.id);
        await delay(sendDelayMs);
      }
    } catch (error) {
      log({
        usuario: "Sistema",
        modulo: "Reservas",
        accion: `No se pudo enviar reserva al grupo: ${getErrorMessage(error)}`
      });
    } finally {
      isFlushing = false;
    }
  }

  function stop() {
    if (!timer) {
      return;
    }

    clearInterval(timer);
    timer = null;
  }

  function start(sock) {
    if (botId !== "principal") {
      return;
    }

    stop();
    flush(sock);
    timer =
      setInterval(
        () => flush(sock),
        intervalMs
      );
  }

  return {
    flush,
    start,
    stop
  };
}

module.exports = {
  createGroupReservationNotificationWorker,
  formatReservationGroupNotification
};
