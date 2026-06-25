const fs = require("fs");
const path = require("path");
const mysql =
  require("../services/mysqlCliService");
const {
  closeDateRange
} = require("../services/closedDatesService");
const {
  saveQuotation,
  saveQuotationMenu,
  saveReservationNote
} = require("../services/dashboardExtrasService");
const {
  saveLatestRackStatus
} = require("../services/rackAnalysisService");
const {
  saveCalendarReservation
} = require("../services/reservationDatabaseService");

const DATA_DIR =
  path.join(
    __dirname,
    "../data"
  );

const BACKUP_DIR =
  path.join(
    __dirname,
    "../backups"
  );

function safeTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
}

function backupDataDirectory(report) {
  if (!fs.existsSync(DATA_DIR)) {
    report.backupPath =
      "";
    return;
  }

  const target =
    path.join(
      BACKUP_DIR,
      `mysql-migration-${safeTimestamp()}`
    );

  fs.mkdirSync(
    target,
    {
      recursive: true
    }
  );

  for (const entry of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    const source =
      path.join(
        DATA_DIR,
        entry.name
      );
    const destination =
      path.join(
        target,
        entry.name
      );

    fs.copyFileSync(
      source,
      destination
    );
  }

  report.backupPath =
    target;
}

function readJson(fileName, fallback) {
  const file =
    path.join(
      DATA_DIR,
      fileName
    );

  if (!fs.existsSync(file)) {
    return fallback;
  }

  try {
    return JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );
  } catch (error) {
    console.warn(`[migrate] No pude leer ${fileName}: ${error.message}`);
    return fallback;
  }
}

function normalizeLegacyRoomReservation(row) {
  const dates =
    Array.isArray(row.dates)
      ? row.dates
      : [row.fecha].filter(Boolean);

  if (!dates.length || !row.nombre) {
    return null;
  }

  return {
    source:
      row.source || "bot",
    sourceKey:
      row.sourceKey
      ||
      (
        row.folio
          ? `folio:${row.folio}`
          : `legacy:${row.nombre}:${dates[0]}:${row.telefono || ""}`
      ),
    folio:
      row.folio || "",
    timestamp:
      row.createdAt || row.timestamp || "",
    nombre:
      row.nombre || "Sin nombre",
    fecha:
      dates[0],
    dates,
    habitaciones:
      row.habitaciones || 1,
    adultos:
      row.adultos || 0,
    ninos:
      row.ninos || 0,
    tipo:
      row.tipo || row.habitacion || "",
    tarifa:
      row.tarifa || "",
    telefono:
      row.telefono || "",
    hora:
      row.hora || "",
    arrivalAt:
      row.arrivalAt || "",
    roomNumber:
      row.roomNumber || "",
    raw:
      row.raw || `Folio #${row.folio || ""}`,
    status:
      row.status || "activa"
  };
}

function migrateReservations(report) {
  const calendar =
    readJson(
      "calendarReservations.json",
      []
    );

  for (const reservation of calendar) {
    saveCalendarReservation(reservation);
    report.calendarReservations++;
  }

  const legacy =
    readJson(
      "reservas.json",
      []
    );

  for (const row of legacy) {
    const reservation =
      normalizeLegacyRoomReservation(row);

    if (reservation) {
      saveCalendarReservation(reservation);
      report.legacyReservations++;
    }
  }
}

function migrateClosedDates(report) {
  for (const date of readJson("closedDates.json", [])) {
    closeDateRange({
      start:
        date,
      end:
        date
    });
    report.closedDates++;
  }
}

function migrateNotes(report) {
  const notes =
    readJson(
      "reservationNotes.json",
      {}
    );

  Object.entries(notes)
    .forEach(([reservationKey, payload]) => {
      saveReservationNote({
        reservationKey,
        note:
          payload?.note || payload || ""
      });
      report.notes++;
    });
}

function migrateNotifications(report) {
  const notifications =
    readJson(
      "groupReservationNotifications.json",
      []
    );

  for (const notification of notifications) {
    if (notification.sentAt) {
      mysql.runSql(`
        INSERT INTO reservation_group_notifications (
          id,
          origin,
          reservations_json,
          created_at,
          sent_at
        ) VALUES (
          ${mysql.quote(notification.id)},
          ${mysql.quote(notification.origin || "dashboard")},
          ${mysql.quote(JSON.stringify(notification.reservations || []))},
          ${mysql.quote(mysql.timestampToSql(notification.createdAt) || new Date().toISOString().slice(0, 19).replace("T", " "))},
          ${mysql.quote(mysql.timestampToSql(notification.sentAt))}
        )
        ON DUPLICATE KEY UPDATE
          sent_at = VALUES(sent_at);
      `);
    } else if (notification.reservations?.length) {
      mysql.runSql(`
        INSERT INTO reservation_group_notifications (
          id,
          origin,
          reservations_json,
          created_at,
          sent_at
        ) VALUES (
          ${mysql.quote(notification.id)},
          ${mysql.quote(notification.origin || "dashboard")},
          ${mysql.quote(JSON.stringify(notification.reservations || []))},
          ${mysql.quote(mysql.timestampToSql(notification.createdAt) || new Date().toISOString().slice(0, 19).replace("T", " "))},
          NULL
        )
        ON DUPLICATE KEY UPDATE
          reservations_json = VALUES(reservations_json),
          sent_at = NULL;
      `);
    }

    report.notifications++;
  }
}

function migrateGroupMessages(report) {
  const messages =
    readJson(
      "groupMessages.json",
      []
    );

  for (const message of messages) {
    mysql.runSql(`
      INSERT IGNORE INTO group_messages (
        message_key,
        group_id,
        message_timestamp,
        text
      ) VALUES (
        ${mysql.quote(message.messageKey || message.key || "")},
        ${mysql.quote(message.groupId || "")},
        ${mysql.quote(message.timestamp || "")},
        ${mysql.quote(message.text || "")}
      );
    `);
    report.groupMessages++;
  }
}

function migrateRack(report) {
  const rackStatus =
    readJson(
      "rackStatus.json",
      null
    );

  if (rackStatus) {
    saveLatestRackStatus(rackStatus);
    report.rackSnapshots++;
  }
}

function migrateQuotations(report) {
  const menu =
    readJson(
      "quotationMenu.json",
      null
    );

  if (Array.isArray(menu) && menu.length) {
    saveQuotationMenu(menu);
    report.quotationMenuItems =
      menu.length;
  }

  const quotations =
    readJson(
      "quotations.json",
      []
    );

  for (const quotation of quotations) {
    saveQuotation(quotation);
    report.quotations++;
  }
}

function main() {
  if (!mysql.ensureSchema()) {
    throw new Error("Activa USE_MYSQL=1 y configura MYSQL_HOST/MYSQL_DATABASE/MYSQL_USER/MYSQL_PASSWORD antes de migrar");
  }

  const report = {
    backupPath: "",
    calendarReservations: 0,
    legacyReservations: 0,
    closedDates: 0,
    notes: 0,
    notifications: 0,
    groupMessages: 0,
    rackSnapshots: 0,
    quotationMenuItems: 0,
    quotations: 0
  };

  backupDataDirectory(report);
  migrateReservations(report);
  migrateClosedDates(report);
  migrateNotes(report);
  migrateNotifications(report);
  migrateGroupMessages(report);
  migrateRack(report);
  migrateQuotations(report);

  console.log(
    JSON.stringify(
      report,
      null,
      2
    )
  );
}

main();
