const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  execFileSync,
  spawnSync
} = require("child_process");
const mysql =
  require("./mysqlCliService");
const {
  calculateExtraAdults,
  isMananeraRate
} = require("./reservationPricingService");

const DATA_DIR =
  path.join(
    __dirname,
    "../data"
  );

const DB_FILE =
  process.env.RESERVATION_DB_FILE
  ||
  path.join(
    DATA_DIR,
    "reservations.db"
  );

const FALLBACK_RESERVATIONS_FILE =
  path.join(
    DATA_DIR,
    "calendarReservations.json"
  );

const FALLBACK_MESSAGES_FILE =
  path.join(
    DATA_DIR,
    "groupMessages.json"
  );

let initialized =
  false;

let sqliteAvailable =
  null;

function enrichReservationPricing(reservation) {
  const extra =
    calculateExtraAdults(reservation);
  const dates =
    Array.isArray(reservation.dates)
      ? reservation.dates
      : [reservation.fecha].filter(Boolean);

  return {
    ...reservation,
    noches:
      Math.max(Number(reservation.noches || dates.length || 1), 1),
    extraAdults:
      Number(reservation.extraAdults || extra.extraAdults || 0),
    extraAmount:
      Number(reservation.extraAmount || extra.extraAmount || 0),
    mananera:
      Boolean(reservation.mananera || isMananeraRate(reservation.tarifa))
  };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(
      DATA_DIR,
      {
        recursive: true
      }
    );
  }
}

function hasSqlite() {
  if (sqliteAvailable !== null) {
    return sqliteAvailable;
  }

  const result =
    spawnSync(
      "sqlite3",
      [
        "--version"
      ],
      {
        stdio:
          "ignore"
      }
    );

  sqliteAvailable =
    result.status === 0;

  return sqliteAvailable;
}

function quote(value) {
  if (
    value === null
    ||
    value === undefined
  ) {
    return "NULL";
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

function runSql(sql) {
  ensureDataDir();

  execFileSync(
    "sqlite3",
    [
      DB_FILE,
      sql
    ],
    {
      encoding:
        "utf8"
    }
  );
}

function querySql(sql) {
  ensureDataDir();

  const output =
    execFileSync(
      "sqlite3",
      [
        "-json",
        DB_FILE,
        sql
      ],
      {
        encoding:
          "utf8"
      }
    )
      .trim();

  return output
    ? JSON.parse(output)
    : [];
}

function initSqlite() {
  if (
    initialized
    ||
    !hasSqlite()
  ) {
    return hasSqlite();
  }

  runSql(`
    CREATE TABLE IF NOT EXISTS calendar_reservations (
      source_key TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      folio TEXT,
      group_id TEXT,
      timestamp TEXT,
      nombre TEXT,
      fecha TEXT NOT NULL,
      dates_json TEXT NOT NULL,
      habitaciones INTEGER NOT NULL DEFAULT 1,
      adultos INTEGER NOT NULL DEFAULT 0,
      ninos INTEGER NOT NULL DEFAULT 0,
      tipo TEXT,
      tarifa TEXT,
      telefono TEXT,
      hora TEXT,
      raw TEXT,
      status TEXT NOT NULL DEFAULT 'activa',
      arrival_at TEXT,
      room_number TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS group_messages (
      message_key TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      timestamp TEXT,
      text TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const reservationColumns =
    querySql("PRAGMA table_info(calendar_reservations);")
      .map(column => column.name);

  if (!reservationColumns.includes("arrival_at")) {
    runSql(
      "ALTER TABLE calendar_reservations ADD COLUMN arrival_at TEXT;"
    );
  }

  if (!reservationColumns.includes("room_number")) {
    runSql(
      "ALTER TABLE calendar_reservations ADD COLUMN room_number TEXT;"
    );
  }

  initialized =
    true;

  return true;
}

function readJsonFile(file) {
  ensureDataDir();

  if (!fs.existsSync(file)) {
    return [];
  }

  try {
    return JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );
  } catch (error) {
    return [];
  }
}

function writeJsonFile(file, rows) {
  ensureDataDir();

  fs.writeFileSync(
    file,
    JSON.stringify(
      rows,
      null,
      2
    ),
    "utf8"
  );
}

function stableKey(parts) {
  return crypto
    .createHash("sha1")
    .update(
      parts
        .filter(Boolean)
        .join("|")
    )
    .digest("hex");
}

function getReservationKey(reservation) {
  if (reservation.sourceKey) {
    return reservation.sourceKey;
  }

  if (reservation.folio) {
    return `folio:${reservation.folio}`;
  }

  return `group:${stableKey([
    reservation.groupId,
    reservation.timestamp,
    reservation.nombre,
    reservation.fecha,
    reservation.telefono,
    reservation.raw
  ])}`;
}

function normalizeReservation(reservation) {
  const dates =
    Array.isArray(reservation.dates)
      ? reservation.dates
      : [reservation.fecha].filter(Boolean);

  return enrichReservationPricing({
    sourceKey:
      getReservationKey(reservation),
    source:
      reservation.source || "grupo",
    folio:
      reservation.folio || "",
    groupId:
      reservation.groupId || "",
    timestamp:
      reservation.timestamp || "",
    nombre:
      reservation.nombre || "Sin nombre",
    fecha:
      reservation.fecha || dates[0] || "",
    dates,
    habitaciones:
      Number(reservation.habitaciones || 1),
    adultos:
      Number(reservation.adultos || 0),
    ninos:
      Number(reservation.ninos || 0),
    tipo:
      reservation.tipo || reservation.habitacion || "",
    tarifa:
      reservation.tarifa || "",
    telefono:
      reservation.telefono || "",
    hora:
      reservation.hora || "",
    arrivalAt:
      reservation.arrivalAt || "",
    roomNumber:
      reservation.roomNumber || "",
    raw:
      reservation.raw || "",
    status:
      reservation.status || "activa"
  });
}

function saveCalendarReservation(reservation) {
  const row =
    normalizeReservation(reservation);

  if (!row.fecha) {
    return false;
  }

  if (mysql.ensureSchema()) {
    saveCalendarReservationMysql(row);
    return true;
  }

  if (initSqlite()) {
    runSql(`
      INSERT INTO calendar_reservations (
        source_key, source, folio, group_id, timestamp, nombre, fecha,
        dates_json, habitaciones, adultos, ninos, tipo, tarifa, telefono,
        hora, raw, status, arrival_at, room_number, updated_at
      ) VALUES (
        ${quote(row.sourceKey)}, ${quote(row.source)}, ${quote(row.folio)},
        ${quote(row.groupId)}, ${quote(row.timestamp)}, ${quote(row.nombre)},
        ${quote(row.fecha)}, ${quote(JSON.stringify(row.dates))},
        ${row.habitaciones}, ${row.adultos}, ${row.ninos},
        ${quote(row.tipo)}, ${quote(row.tarifa)}, ${quote(row.telefono)},
        ${quote(row.hora)}, ${quote(row.raw)}, ${quote(row.status)},
        ${quote(row.arrivalAt)}, ${quote(row.roomNumber)},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(source_key) DO UPDATE SET
        source = excluded.source,
        folio = excluded.folio,
        group_id = excluded.group_id,
        timestamp = excluded.timestamp,
        nombre = excluded.nombre,
        fecha = excluded.fecha,
        dates_json = excluded.dates_json,
        habitaciones = excluded.habitaciones,
        adultos = excluded.adultos,
        ninos = excluded.ninos,
        tipo = excluded.tipo,
        tarifa = excluded.tarifa,
        telefono = excluded.telefono,
        hora = excluded.hora,
        raw = excluded.raw,
        status = excluded.status,
        arrival_at = excluded.arrival_at,
        room_number = excluded.room_number,
        updated_at = CURRENT_TIMESTAMP;
    `);

    return true;
  }

  const rows =
    readJsonFile(FALLBACK_RESERVATIONS_FILE);

  const next =
    rows.filter(item =>
      item.sourceKey !== row.sourceKey
    );

  next.push(row);
  writeJsonFile(
    FALLBACK_RESERVATIONS_FILE,
    next
  );

  return true;
}

function readCalendarReservations() {
  if (mysql.ensureSchema()) {
    return readCalendarReservationsMysql(false);
  }

  if (initSqlite()) {
    return querySql(`
      SELECT
        source_key AS sourceKey,
        source,
        folio,
        group_id AS groupId,
        timestamp,
        nombre,
        fecha,
        dates_json AS datesJson,
        habitaciones,
        adultos,
        ninos,
        tipo,
        tarifa,
        telefono,
        hora,
        arrival_at AS arrivalAt,
        room_number AS roomNumber,
        raw,
        status
      FROM calendar_reservations
      WHERE status != 'cancelada'
      ORDER BY fecha, created_at;
    `)
      .map(row => ({
        ...row,
        dates:
          JSON.parse(row.datesJson || "[]")
      }))
      .map(enrichReservationPricing);
  }

  return readJsonFile(FALLBACK_RESERVATIONS_FILE)
    .filter(row =>
      row.status !== "cancelada"
    )
    .map(enrichReservationPricing);
}

function updateCalendarReservation(sourceKey, updates = {}) {
  const current =
    readCalendarReservations()
      .find(row =>
        row.sourceKey === sourceKey
      );

  if (!current) {
    throw new Error("Reserva no encontrada");
  }

  const dates =
    Array.isArray(updates.dates)
    &&
    updates.dates.length
      ? updates.dates
      : current.dates;
  const updated =
    normalizeReservation({
      ...current,
      ...updates,
      sourceKey,
      dates,
      fecha:
        dates[0] || current.fecha,
      source:
        current.source,
      groupId:
        current.groupId,
      raw:
        current.raw,
      status:
        current.status
    });

  if (!updated.nombre || !updated.fecha || !updated.dates.length) {
    throw new Error("Nombre y fechas validas son requeridos");
  }

  saveCalendarReservation(updated);
  return updated;
}

function readCanceledCalendarReservationKeys() {
  if (mysql.ensureSchema()) {
    return new Set(
      mysql.queryJson(`
        SELECT JSON_OBJECT(
          'sourceKey', source_key
        )
        FROM reservations
        WHERE status = 'cancelada';
      `)
        .map(row =>
          row.sourceKey
        )
        .filter(Boolean)
    );
  }

  if (initSqlite()) {
    return new Set(
      querySql(`
        SELECT source_key AS sourceKey
        FROM calendar_reservations
        WHERE status = 'cancelada';
      `)
        .map(row =>
          row.sourceKey
        )
        .filter(Boolean)
    );
  }

  return new Set(
    readJsonFile(FALLBACK_RESERVATIONS_FILE)
      .filter(row =>
        row.status === "cancelada"
      )
      .map(row =>
        row.sourceKey
      )
      .filter(Boolean)
  );
}

function cancelCalendarReservationByFolio(folio) {
  if (!folio) {
    return;
  }

  if (mysql.ensureSchema()) {
    mysql.runSql(`
      UPDATE reservations
      SET status = 'cancelada'
      WHERE folio = ${mysql.quote(folio)};
    `);
    return;
  }

  if (initSqlite()) {
    runSql(`
      UPDATE calendar_reservations
      SET status = 'cancelada',
          updated_at = CURRENT_TIMESTAMP
      WHERE folio = ${quote(folio)};
    `);

    return;
  }

  const rows =
    readJsonFile(FALLBACK_RESERVATIONS_FILE)
      .map(row =>
        String(row.folio) === String(folio)
          ? {
            ...row,
            status:
              "cancelada"
          }
          : row
      );

  writeJsonFile(
    FALLBACK_RESERVATIONS_FILE,
    rows
  );
}

function cancelCalendarReservationByKey(sourceKey) {
  if (!sourceKey) {
    return;
  }

  if (mysql.ensureSchema()) {
    mysql.runSql(`
      UPDATE reservations
      SET status = 'cancelada'
      WHERE source_key = ${mysql.quote(sourceKey)};
    `);
    return;
  }

  if (initSqlite()) {
    runSql(`
      UPDATE calendar_reservations
      SET status = 'cancelada',
          updated_at = CURRENT_TIMESTAMP
      WHERE source_key = ${quote(sourceKey)};
    `);

    return;
  }

  const rows =
    readJsonFile(FALLBACK_RESERVATIONS_FILE)
      .map(row =>
        row.sourceKey === sourceKey
          ? {
            ...row,
            status:
              "cancelada"
          }
          : row
      );

  writeJsonFile(
    FALLBACK_RESERVATIONS_FILE,
    rows
  );
}

function saveGroupMessage({
  messageKey,
  groupId,
  timestamp,
  text
}) {
  const key =
    messageKey
    ||
    stableKey([
      groupId,
      timestamp,
      text
    ]);

  if (mysql.ensureSchema()) {
    mysql.runSql(`
      INSERT IGNORE INTO group_messages (
        message_key,
        group_id,
        message_timestamp,
        text
      ) VALUES (
        ${mysql.quote(key)},
        ${mysql.quote(groupId)},
        ${mysql.quote(timestamp)},
        ${mysql.quote(text)}
      );
    `);
    return key;
  }

  if (initSqlite()) {
    runSql(`
      INSERT OR IGNORE INTO group_messages (
        message_key, group_id, timestamp, text
      ) VALUES (
        ${quote(key)}, ${quote(groupId)}, ${quote(timestamp)}, ${quote(text)}
      );
    `);

    return key;
  }

  const rows =
    readJsonFile(FALLBACK_MESSAGES_FILE);

  if (
    !rows.some(row =>
      row.messageKey === key
    )
  ) {
    rows.push({
      messageKey:
        key,
      groupId,
      timestamp,
      text
    });

    writeJsonFile(
      FALLBACK_MESSAGES_FILE,
      rows
    );
  }

  return key;
}

function getGuestKey(row) {
  return mysql.stableKey([
    String(row.nombre || "").trim().toLowerCase(),
    String(row.telefono || "").replace(/\D/g, "")
  ]);
}

function getRoomTypeCode(type) {
  const clean =
    String(type || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  if (
    clean.includes("suite")
    &&
    clean.includes("king")
  ) {
    return "SUITE_KING";
  }

  if (clean.includes("suite")) {
    return "DOBLE_SUITE";
  }

  if (clean.includes("king")) {
    return "KING";
  }

  if (clean.includes("doble")) {
    return "DOBLE";
  }

  return "";
}

function saveCalendarReservationMysql(row) {
  const guestKey =
    getGuestKey(row);
  const roomTypeCode =
    getRoomTypeCode(row.tipo);
  const startDate =
    mysql.displayToSqlDate(row.fecha);
  const dates =
    (Array.isArray(row.dates) && row.dates.length
      ? row.dates
      : [row.fecha]
    )
      .map(mysql.displayToSqlDate)
      .filter(Boolean);
  const arrivalAt =
    mysql.timestampToSql(row.arrivalAt);

  if (!startDate || !dates.length) {
    throw new Error("Fechas invalidas para MySQL");
  }

  mysql.runSql(`
    INSERT INTO guests (
      guest_key,
      name,
      phone
    ) VALUES (
      ${mysql.quote(guestKey)},
      ${mysql.quote(row.nombre)},
      ${mysql.quote(row.telefono)}
    )
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      phone = VALUES(phone);

    INSERT INTO reservations (
      source_key,
      source,
      folio,
      guest_id,
      group_id,
      message_timestamp,
      start_date,
      rooms_count,
      adults_count,
      children_count,
      room_type_id,
      rate_text,
      phone_snapshot,
      arrival_time_text,
      raw_text,
      status,
      arrival_at,
      assigned_room_id
    ) VALUES (
      ${mysql.quote(row.sourceKey)},
      ${mysql.quote(row.source)},
      ${mysql.quote(row.folio)},
      (SELECT id FROM guests WHERE guest_key = ${mysql.quote(guestKey)}),
      ${mysql.quote(row.groupId)},
      ${mysql.quote(row.timestamp)},
      ${mysql.quote(startDate)},
      ${Number(row.habitaciones)},
      ${Number(row.adultos)},
      ${Number(row.ninos)},
      ${roomTypeCode ? `(SELECT id FROM room_types WHERE code = ${mysql.quote(roomTypeCode)})` : "NULL"},
      ${mysql.quote(row.tarifa)},
      ${mysql.quote(row.telefono)},
      ${mysql.quote(row.hora)},
      ${mysql.quote(row.raw)},
      ${mysql.quote(row.status)},
      ${arrivalAt ? mysql.quote(arrivalAt) : "NULL"},
      ${row.roomNumber ? `(SELECT id FROM rooms WHERE room_number = ${mysql.quote(row.roomNumber)})` : "NULL"}
    )
    ON DUPLICATE KEY UPDATE
      source = VALUES(source),
      folio = VALUES(folio),
      guest_id = VALUES(guest_id),
      group_id = VALUES(group_id),
      message_timestamp = VALUES(message_timestamp),
      start_date = VALUES(start_date),
      rooms_count = VALUES(rooms_count),
      adults_count = VALUES(adults_count),
      children_count = VALUES(children_count),
      room_type_id = VALUES(room_type_id),
      rate_text = VALUES(rate_text),
      phone_snapshot = VALUES(phone_snapshot),
      arrival_time_text = VALUES(arrival_time_text),
      raw_text = VALUES(raw_text),
      status = VALUES(status),
      arrival_at = VALUES(arrival_at),
      assigned_room_id = VALUES(assigned_room_id);

    DELETE FROM reservation_dates
    WHERE reservation_id = (
      SELECT id FROM reservations WHERE source_key = ${mysql.quote(row.sourceKey)}
    );

    INSERT INTO reservation_dates (
      reservation_id,
      stay_date
    ) VALUES
      ${dates.map(date => `((SELECT id FROM reservations WHERE source_key = ${mysql.quote(row.sourceKey)}), ${mysql.quote(date)})`).join(",")};
  `);

  if (row.roomNumber) {
    mysql.runSql(`
      DELETE FROM reservation_room_nights
      WHERE reservation_id = (
        SELECT id FROM reservations WHERE source_key = ${mysql.quote(row.sourceKey)}
      );

      INSERT INTO reservation_room_nights (
        reservation_id,
        room_id,
        stay_date,
        occupancy_status,
        source
      ) VALUES
        ${dates.map(date => `(
          (SELECT id FROM reservations WHERE source_key = ${mysql.quote(row.sourceKey)}),
          (SELECT id FROM rooms WHERE room_number = ${mysql.quote(row.roomNumber)}),
          ${mysql.quote(date)},
          'ocupada',
          'arrival'
        )`).join(",")}
      ON DUPLICATE KEY UPDATE
        reservation_id = VALUES(reservation_id),
        occupancy_status = VALUES(occupancy_status),
        source = VALUES(source);
    `);
  }
}

function readCalendarReservationsMysql(includeCanceled) {
  return mysql.queryJson(`
    SELECT JSON_OBJECT(
      'sourceKey', r.source_key,
      'source', r.source,
      'folio', r.folio,
      'groupId', r.group_id,
      'timestamp', r.message_timestamp,
      'nombre', g.name,
      'fecha', DATE_FORMAT(r.start_date, '%d/%m/%Y'),
      'dates', COALESCE(
        (
          SELECT JSON_ARRAYAGG(ordered_dates.display_date)
          FROM (
            SELECT DATE_FORMAT(d.stay_date, '%d/%m/%Y') AS display_date
            FROM reservation_dates d
            WHERE d.reservation_id = r.id
            ORDER BY d.stay_date
          ) ordered_dates
        ),
        JSON_ARRAY()
      ),
      'habitaciones', r.rooms_count,
      'adultos', r.adults_count,
      'ninos', r.children_count,
      'tipo', COALESCE(rt.name, ''),
      'tarifa', r.rate_text,
      'telefono', COALESCE(NULLIF(r.phone_snapshot, ''), g.phone),
      'hora', r.arrival_time_text,
      'arrivalAt', IFNULL(DATE_FORMAT(r.arrival_at, '%Y-%m-%dT%H:%i:%s.000Z'), ''),
      'roomNumber', COALESCE(room.room_number, ''),
      'raw', COALESCE(r.raw_text, ''),
      'status', r.status
    )
    FROM reservations r
    JOIN guests g ON g.id = r.guest_id
    LEFT JOIN room_types rt ON rt.id = r.room_type_id
    LEFT JOIN rooms room ON room.id = r.assigned_room_id
    ${includeCanceled ? "" : "WHERE r.status != 'cancelada'"}
    ORDER BY r.start_date, r.created_at;
  `)
    .map(enrichReservationPricing);
}

module.exports = {
  saveCalendarReservation,
  readCalendarReservations,
  updateCalendarReservation,
  readCanceledCalendarReservationKeys,
  cancelCalendarReservationByFolio,
  cancelCalendarReservationByKey,
  saveGroupMessage
};
