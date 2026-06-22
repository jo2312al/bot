const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  execFileSync,
  spawnSync
} = require("child_process");

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

  return {
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
    raw:
      reservation.raw || "",
    status:
      reservation.status || "activa"
  };
}

function saveCalendarReservation(reservation) {
  const row =
    normalizeReservation(reservation);

  if (!row.fecha) {
    return false;
  }

  if (initSqlite()) {
    runSql(`
      INSERT INTO calendar_reservations (
        source_key, source, folio, group_id, timestamp, nombre, fecha,
        dates_json, habitaciones, adultos, ninos, tipo, tarifa, telefono,
        hora, raw, status, updated_at
      ) VALUES (
        ${quote(row.sourceKey)}, ${quote(row.source)}, ${quote(row.folio)},
        ${quote(row.groupId)}, ${quote(row.timestamp)}, ${quote(row.nombre)},
        ${quote(row.fecha)}, ${quote(JSON.stringify(row.dates))},
        ${row.habitaciones}, ${row.adultos}, ${row.ninos},
        ${quote(row.tipo)}, ${quote(row.tarifa)}, ${quote(row.telefono)},
        ${quote(row.hora)}, ${quote(row.raw)}, ${quote(row.status)},
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
      }));
  }

  return readJsonFile(FALLBACK_RESERVATIONS_FILE)
    .filter(row =>
      row.status !== "cancelada"
    );
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

module.exports = {
  saveCalendarReservation,
  readCalendarReservations,
  updateCalendarReservation,
  readCanceledCalendarReservationKeys,
  cancelCalendarReservationByFolio,
  cancelCalendarReservationByKey,
  saveGroupMessage
};
