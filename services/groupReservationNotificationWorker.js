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
  const paidReservation = reservations.length === 1
    && reservations[0].clientMessageType === "paid"
    ? reservations[0]
    : null;
  if (paidReservation) {
    const amount = Number(paidReservation.paymentAmount || 0);
    const currency = paidReservation.paymentCurrency || "MXN";
    return [
      "✅ *PAGO DE RESERVACIÓN CONFIRMADO*",
      formatReservationLine(paidReservation, 0, 1),
      amount > 0 ? `💳 Total pagado: *${amount.toLocaleString("es-MX", { style: "currency", currency })}*` : "",
      paidReservation.paidAt ? `🕐 Confirmado: ${paidReservation.paidAt}` : "",
      "La reservación quedó pagada y garantizada."
    ].filter(Boolean).join("\n\n");
  }
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

async function fetchConfirmationPdf(url) {
  const apiKey = String(process.env.RESERVATION_PORTAL_API_KEY || "").trim();
  if (!url || !apiKey) throw new Error("Falta configurar el acceso seguro al PDF de confirmacion");
  const endpoint = new URL(String(process.env.RESERVATION_PORTAL_API_URL || ""));
  const pdfUrl = new URL(url);
  if (pdfUrl.protocol !== "https:" || pdfUrl.origin !== endpoint.origin) {
    throw new Error("La ruta del PDF no pertenece al portal autorizado");
  }
  const expectedPrefix = `${endpoint.pathname.replace(/\/$/, "")}/`;
  if (!pdfUrl.pathname.startsWith(expectedPrefix) || !pdfUrl.pathname.endsWith("/pdf")) {
    throw new Error("La ruta del PDF no tiene el formato autorizado");
  }
  const response = await fetch(pdfUrl, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`No se pudo descargar el PDF (HTTP ${response.status})`);
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/pdf")) throw new Error("La pagina no devolvio un PDF valido");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error("El PDF esta vacio o excede 10 MB");
  return bytes;
}

async function resolveClientJid(sock, origin) {
  const raw = String(origin || "").replace(/^client:/, "").replace(/\D/g, "");
  const candidates = raw.length === 10
    ? [`52${raw}`, `521${raw}`]
    : [raw];
  for (const candidate of candidates) {
    const result = await sock.onWhatsApp(candidate);
    const match = Array.isArray(result) ? result.find(item => item?.exists && item?.jid) : null;
    if (match) return match.jid;
  }
  throw new Error("El numero del cliente no esta registrado en WhatsApp");
}

function formatClientNotification(reservation) {
  if (reservation.clientMessageType === "arrival-reminder") {
    return [
      `Hola ${reservation.nombre || ""} 👋 Esperamos que te encuentres muy bien.`,
      `Queremos confirmar si aun utilizaras tu reservacion *${reservation.folio || ""}*, ya que tu hora estimada de llegada era ${reservation.hora || "la indicada"}.`,
      `Por favor responde *CONFIRMAR ${reservation.folio || ""}* y con gusto registraremos tu nueva hora de llegada para avisar a recepcion.`,
      "Te recordamos amablemente que, si la llegada es despues de las 7:00 p. m., las reservaciones sin pago permanecen sujetas a disponibilidad.",
      reservation.paymentUrl ? `Si deseas garantizar tu habitacion, puedes realizar el pago de forma segura aqui:\n${reservation.paymentUrl}` : "",
      "Gracias por mantenernos informados. Estamos para ayudarte."
    ].filter(Boolean).join("\n\n");
  }
  return [
    "🏨 *HOTEL VILLA MARGARITAS*",
    `Hola ${reservation.nombre || ""} 👋`,
    "Gracias por elegirnos. Hemos registrado tu reservacion con los siguientes datos:",
    formatReservationLine(reservation, 0, 1),
    "ℹ️ Te recordamos amablemente que las llegadas despues de las *7:00 p. m.* estan sujetas a disponibilidad cuando la reservacion aun no ha sido pagada.",
    reservation.paymentUrl
      ? `Si deseas garantizar tu habitacion, puedes realizar el pago total de la estancia de forma segura en el siguiente enlace:\n${reservation.paymentUrl}`
      : "",
    "Si necesitas hacer algun cambio o tienes alguna duda, con gusto podemos ayudarte. Sera un placer recibirte!"
  ].filter(Boolean).join("\n\n");
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
        const clientReservation = (notification.reservations || [])[0] || {};
        if (String(notification.origin || "").startsWith("client:")) {
          if (clientReservation.reservationMessagesConsent !== true) {
            throw new Error("Notificacion al cliente sin consentimiento de WhatsApp");
          }
          if (clientReservation.clientMessageType === "paid" || clientReservation.clientMessageType === "paid-pdf") {
            throw new Error("El PDF de pago confirmado solo se envia al grupo de recepcion");
          }
          const destination = await resolveClientJid(sock, notification.origin);
          await sock.sendMessage(destination, {
            text: formatClientNotification(clientReservation)
          });
          markReservationGroupNotificationSent(notification.id);
          await delay(sendDelayMs);
          continue;
        }
        if (clientReservation.clientMessageType === "paid" && clientReservation.confirmationPdfUrl) {
          const document = await fetchConfirmationPdf(clientReservation.confirmationPdfUrl);
          const caption = formatReservationGroupNotification(notification);
          await sock.sendMessage(groupId, {
            document,
            mimetype: "application/pdf",
            fileName: `confirmacion-${clientReservation.folio || "reserva"}.pdf`,
            caption
          });
          markReservationGroupNotificationSent(notification.id);
          await delay(sendDelayMs);
          continue;
        }
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
