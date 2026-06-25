const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  execFileSync,
  spawnSync
} = require("child_process");

const SCHEMA_FILE =
  path.join(
    __dirname,
    "../database/schema.mysql.sql"
  );

let availabilityCache =
  null;

let schemaReady =
  false;

function isConfigured() {
  return String(process.env.USE_MYSQL || "").trim() === "1";
}

function hasMysqlClient() {
  if (availabilityCache !== null) {
    return availabilityCache;
  }

  const result =
    spawnSync(
      process.env.MYSQL_CLI || "mysql",
      [
        "--version"
      ],
      {
        stdio:
          "ignore"
      }
    );

  availabilityCache =
    result.status === 0;

  return availabilityCache;
}

function isAvailable() {
  return isConfigured() && hasMysqlClient() && getDatabaseName();
}

function getDatabaseName() {
  return String(process.env.MYSQL_DATABASE || process.env.DB_NAME || "").trim();
}

function getArgs(extra = []) {
  const args = [
    "--default-character-set=utf8mb4"
  ];

  if (process.env.MYSQL_SOCKET) {
    args.push(
      "--socket",
      process.env.MYSQL_SOCKET
    );
  } else {
    args.push(
      "--host",
      process.env.MYSQL_HOST || process.env.DB_HOST || "127.0.0.1",
      "--port",
      String(process.env.MYSQL_PORT || process.env.DB_PORT || "3306")
    );
  }

  args.push(
    "--user",
    process.env.MYSQL_USER || process.env.DB_USER || "root"
  );

  const database =
    getDatabaseName();

  if (database) {
    args.push(database);
  }

  return [
    ...args,
    ...extra
  ];
}

function getEnv() {
  return {
    ...process.env,
    MYSQL_PWD:
      process.env.MYSQL_PASSWORD
      ||
      process.env.DB_PASSWORD
      ||
      ""
  };
}

function runSql(sql) {
  if (!isAvailable()) {
    throw new Error("MySQL no esta configurado o no hay cliente mysql");
  }

  execFileSync(
    process.env.MYSQL_CLI || "mysql",
    getArgs([
      "--execute",
      sql
    ]),
    {
      encoding:
        "utf8",
      env:
        getEnv(),
      maxBuffer:
        20 * 1024 * 1024
    }
  );
}

function queryJson(sql) {
  if (!isAvailable()) {
    throw new Error("MySQL no esta configurado o no hay cliente mysql");
  }

  const output =
    execFileSync(
      process.env.MYSQL_CLI || "mysql",
      getArgs([
        "--batch",
        "--raw",
        "--skip-column-names",
        "--execute",
        sql
      ]),
      {
        encoding:
          "utf8",
        env:
          getEnv(),
        maxBuffer:
          20 * 1024 * 1024
      }
    )
      .trim();

  if (!output) {
    return [];
  }

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line =>
      JSON.parse(line)
    );
}

function quote(value) {
  if (
    value === null
    ||
    value === undefined
  ) {
    return "NULL";
  }

  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function displayToSqlDate(value) {
  const match =
    String(value || "")
      .trim()
      .match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) {
    return "";
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
}

function sqlToDisplayDate(value) {
  const match =
    String(value || "")
      .slice(0, 10)
      .match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return "";
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function timestampToSql(value) {
  const text =
    String(value || "").trim();

  if (!text) {
    return null;
  }

  const date =
    new Date(text);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
}

function sqlToIso(value) {
  const text =
    String(value || "").trim();

  if (!text) {
    return "";
  }

  return text.includes("T")
    ? text
    : `${text.replace(" ", "T")}.000Z`;
}

function stableKey(parts) {
  return crypto
    .createHash("sha1")
    .update(
      parts
        .filter(value => value !== null && value !== undefined)
        .map(value => String(value))
        .join("|")
    )
    .digest("hex");
}

function ensureSchema() {
  if (!isAvailable()) {
    return false;
  }

  if (schemaReady) {
    return true;
  }

  runSql(
    fs.readFileSync(
      SCHEMA_FILE,
      "utf8"
    )
  );

  seedReferenceData();
  schemaReady =
    true;

  return true;
}

function seedReferenceData() {
  const roomTypes = [
    [
      "KING",
      "King",
      9
    ],
    [
      "SUITE_KING",
      "Suite King",
      1
    ],
    [
      "DOBLE_SUITE",
      "Doble Suite",
      11
    ],
    [
      "DOBLE",
      "Doble",
      48
    ]
  ];

  const values =
    roomTypes
      .map(([code, name, limit]) =>
        `(${quote(code)}, ${quote(name)}, ${Number(limit)})`
      )
      .join(",");

  runSql(`
    INSERT INTO room_types (code, name, room_limit)
    VALUES ${values}
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      room_limit = VALUES(room_limit);
  `);

  const rooms = [];

  [
    1,
    2,
    3
  ].forEach(floor => {
    for (let number = 1; number <= 22; number++) {
      if (number === 13) {
        continue;
      }

      rooms.push(
        `${floor}${String(number).padStart(2, "0")}`
      );
    }
  });

  for (let number = 1; number <= 6; number++) {
    rooms.push(
      `4${String(number).padStart(2, "0")}`
    );
  }

  if (!rooms.length) {
    return;
  }

  runSql(`
    INSERT INTO rooms (room_number, floor_number)
    VALUES ${rooms.map(room => `(${quote(room)}, ${Number(room[0])})`).join(",")}
    ON DUPLICATE KEY UPDATE
      floor_number = VALUES(floor_number);
  `);

  const eventTypes = [
    [
      "DEEP_CLEAN",
      "Limpieza profunda",
      1,
      30
    ],
    [
      "MAINTENANCE",
      "Mantenimiento general",
      1,
      90
    ],
    [
      "AC_MAINTENANCE",
      "Mantenimiento de clima",
      1,
      90
    ],
    [
      "PAINT",
      "Pintura / retoque",
      1,
      180
    ],
    [
      "OBSERVATION",
      "Nota de habitacion",
      0,
      null
    ]
  ];

  runSql(`
    INSERT INTO room_event_types (
      code,
      name,
      affects_rotation,
      default_interval_days
    ) VALUES ${eventTypes.map(([code, name, affectsRotation, intervalDays]) =>
      `(${quote(code)}, ${quote(name)}, ${Number(affectsRotation)}, ${intervalDays === null ? "NULL" : Number(intervalDays)})`
    ).join(",")}
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      affects_rotation = VALUES(affects_rotation),
      default_interval_days = VALUES(default_interval_days);
  `);

  const halls = [
    [
      "MARGARITAS",
      "Margaritas",
      1
    ],
    [
      "TULIPANES",
      "Tulipanes",
      2
    ],
    [
      "GIRASOLES",
      "Girasoles",
      3
    ]
  ];

  runSql(`
    INSERT INTO event_halls (
      code,
      name,
      sort_order
    ) VALUES ${halls.map(([code, name, order]) =>
      `(${quote(code)}, ${quote(name)}, ${Number(order)})`
    ).join(",")}
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      sort_order = VALUES(sort_order),
      active = 1;
  `);
}

module.exports = {
  displayToSqlDate,
  ensureSchema,
  isAvailable,
  queryJson,
  quote,
  runSql,
  sqlToDisplayDate,
  sqlToIso,
  stableKey,
  timestampToSql
};
