const {
  readPendingReservationGroupNotifications
} = require("../services/groupReservationNotificationService");
const mysql = require("../services/mysqlCliService");
const fs = require("fs");
const path = require("path");

const rows = readPendingReservationGroupNotifications().slice(-20).map(row => ({
  id: row.id,
  destination: String(row.origin || "").replace(/^client:\d*(\d{4})$/, "client:***$1"),
  folios: (row.reservations || []).map(reservation => reservation.folio),
  types: (row.reservations || []).map(reservation => reservation.clientMessageType),
  createdAt: row.createdAt
}));

process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);

if (mysql.ensureSchema()) {
  const recent = mysql.queryJson(`
    SELECT JSON_OBJECT(
      'id', id,
      'destination', CONCAT('client:***', RIGHT(origin, 4)),
      'phoneLength', LENGTH(REPLACE(origin, 'client:', '')),
      'phonePrefix', LEFT(REPLACE(origin, 'client:', ''), 3),
      'createdAt', DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s'),
      'sentAt', IFNULL(DATE_FORMAT(sent_at, '%Y-%m-%dT%H:%i:%s'), ''),
      'payload', reservations_json
    )
    FROM reservation_group_notifications
    WHERE origin LIKE 'client:%'
    ORDER BY created_at DESC
    LIMIT 10;
  `).map(row => ({
    id: row.id,
    destination: row.destination,
    phoneLength: row.phoneLength,
    phonePrefix: row.phonePrefix,
    createdAt: row.createdAt,
    sentAt: row.sentAt || null,
    folios: (row.payload || []).map(reservation => reservation.folio),
    types: (row.payload || []).map(reservation => reservation.clientMessageType)
  }));
  process.stdout.write(`${JSON.stringify({ recentClientNotifications: recent }, null, 2)}\n`);
} else {
  let fallback = [];
  try {
    fallback = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/groupReservationNotifications.json"), "utf8"));
  } catch {}
  const recent = fallback.filter(row => String(row.origin || "").startsWith("client:"))
    .slice(-10).reverse().map(row => ({
      id: row.id,
      destination: String(row.origin).replace(/^client:\d*(\d{4})$/, "client:***$1"),
      createdAt: row.createdAt,
      sentAt: row.sentAt,
      folios: (row.reservations || []).map(reservation => reservation.folio),
      types: (row.reservations || []).map(reservation => reservation.clientMessageType)
    }));
  process.stdout.write(`${JSON.stringify({ storage: "fallback", recentClientNotifications: recent }, null, 2)}\n`);
}
