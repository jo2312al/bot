const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const mysql =
  require("./mysqlCliService");

const QUEUE_FILE =
  path.join(
    __dirname,
    "../data/groupReservationNotifications.json"
  );

function ensureQueueFile() {
  const dir =
    path.dirname(QUEUE_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {
      recursive: true
    });
  }

  if (!fs.existsSync(QUEUE_FILE)) {
    fs.writeFileSync(QUEUE_FILE, "[]", "utf8");
  }
}

function readQueue() {
  ensureQueueFile();

  try {
    return JSON.parse(
      fs.readFileSync(QUEUE_FILE, "utf8")
    );
  } catch {
    return [];
  }
}

function writeQueue(rows) {
  ensureQueueFile();
  fs.writeFileSync(
    QUEUE_FILE,
    JSON.stringify(rows, null, 2),
    "utf8"
  );
}

function getReservationSourceLabel(source) {
  const normalized =
    String(source || "")
      .trim()
      .toLowerCase();

  if (normalized === "manual") {
    return "Reserva call center";
  }

  if (normalized === "bot") {
    return "Reserva bot";
  }

  return "";
}

function cleanReservation(reservation = {}) {
  const source =
    String(reservation.source || "").trim();

  return {
    source,
    sourceLabel:
      String(reservation.sourceLabel || getReservationSourceLabel(source)).trim(),
    nombre:
      String(reservation.nombre || "Sin nombre").trim(),
    telefono:
      String(reservation.telefono || "").trim(),
    email:
      String(reservation.email || "").trim().toLowerCase(),
    fecha:
      String(reservation.fecha || "").trim(),
    dates:
      Array.isArray(reservation.dates)
        ? reservation.dates
        : [],
    habitaciones:
      Math.max(Number(reservation.habitaciones || 1), 1),
    adultos:
      Math.max(Number(reservation.adultos || 0), 0),
    ninos:
      Math.max(Number(reservation.ninos || 0), 0),
    tipo:
      String(reservation.tipo || "").trim(),
    hora:
      String(reservation.hora || "").trim(),
    tarifa:
      String(reservation.tarifa || "").trim(),
    extraAdults:
      Math.max(Number(reservation.extraAdults || 0), 0),
    extraAmount:
      Math.max(Number(reservation.extraAmount || 0), 0),
    mananera:
      Boolean(reservation.mananera),
    folio:
      String(reservation.folio || "").trim(),
    note:
      String(reservation.note || "").trim(),
    roomNumber:
      String(reservation.roomNumber || "").trim(),
    arrivalAt:
      String(reservation.arrivalAt || "").trim(),
    paymentUrl:
      String(reservation.paymentUrl || "").trim(),
    clientMessageType:
      String(reservation.clientMessageType || "confirmation").trim(),
    paymentAmount:
      Number(reservation.paymentAmount || 0),
    paymentCurrency:
      String(reservation.paymentCurrency || "MXN").trim().toUpperCase(),
    paidAt:
      String(reservation.paidAt || "").trim(),
    gatewayId:
      String(reservation.gatewayId || "").trim(),
    confirmationPdfUrl:
      String(reservation.confirmationPdfUrl || "").trim()
  };
}

function enqueueReservationGroupNotification(reservations, origin = "dashboard") {
  const rows =
    (Array.isArray(reservations) ? reservations : [])
      .map(cleanReservation)
      .filter(reservation =>
        reservation.nombre && reservation.fecha
      );

  if (!rows.length) {
    throw new Error("No hay reservas validas para enviar");
  }

  const notification = {
    id:
      crypto.randomUUID(),
    origin,
    reservations: rows,
    createdAt:
      new Date().toISOString(),
    sentAt: null
  };

  if (mysql.ensureSchema()) {
    mysql.runSql(`
      INSERT INTO reservation_group_notifications (
        id,
        origin,
        reservations_json,
        created_at,
        sent_at
      ) VALUES (
        ${mysql.quote(notification.id)},
        ${mysql.quote(notification.origin)},
        ${mysql.quote(JSON.stringify(notification.reservations))},
        ${mysql.quote(notification.createdAt.slice(0, 19).replace("T", " "))},
        NULL
      );
    `);

    return notification;
  }

  const queue =
    readQueue();

  queue.push(notification);
  writeQueue(queue);
  return notification;
}

function enqueueReservationClientNotification(reservation, paymentUrl, messageType = "confirmation") {
  const phone = String(reservation?.telefono || "").replace(/\D/g, "");
  if (phone.length < 10) throw new Error("La reserva no tiene un telefono valido");
  if (reservation?.reservationMessagesConsent !== true) {
    throw new Error("Falta confirmar el consentimiento de WhatsApp de la reserva");
  }
  return enqueueReservationGroupNotification([{
    ...reservation,
    paymentUrl,
    clientMessageType: messageType,
    reservationMessagesConsent: true
  }], `client:${phone}`);
}

function readPendingReservationGroupNotifications() {
  if (mysql.ensureSchema()) {
    return mysql.queryJson(`
      SELECT JSON_OBJECT(
        'id', id,
        'origin', origin,
        'reservations', reservations_json,
        'createdAt', DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z'),
        'sentAt', IFNULL(DATE_FORMAT(sent_at, '%Y-%m-%dT%H:%i:%s.000Z'), '')
      )
      FROM reservation_group_notifications
      WHERE sent_at IS NULL
      ORDER BY created_at;
    `)
      .map(row => ({
        ...row,
        sentAt:
          row.sentAt || null
      }));
  }

  return readQueue()
    .filter(notification =>
      !notification.sentAt
    );
}

function markReservationGroupNotificationSent(id) {
  if (mysql.ensureSchema()) {
    mysql.runSql(`
      UPDATE reservation_group_notifications
      SET sent_at = CURRENT_TIMESTAMP
      WHERE id = ${mysql.quote(id)};
    `);
    return;
  }

  const rows =
    readQueue()
      .map(notification =>
        notification.id === id
          ? {
            ...notification,
            sentAt:
              new Date().toISOString()
          }
          : notification
      );

  writeQueue(rows);
}

module.exports = {
  enqueueReservationGroupNotification,
  enqueueReservationClientNotification,
  readPendingReservationGroupNotifications,
  markReservationGroupNotificationSent
};
