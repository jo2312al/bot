const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS
} = require("./accessControlCatalog");
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

function mexicoNowSql() {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "America/Mexico_City",
        year:
          "numeric",
        month:
          "2-digit",
        day:
          "2-digit",
        hour:
          "2-digit",
        minute:
          "2-digit",
        second:
          "2-digit",
        hour12:
          false
      }
    )
      .formatToParts(new Date())
      .reduce((acc, part) => {
        acc[part.type] =
          part.value;
        return acc;
      }, {});

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
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

  ensureSchemaEvolution();
  seedReferenceData();
  schemaReady =
    true;

  return true;
}

function schemaColumnExists(tableName, columnName) {
  const rows = queryJson(`
    SELECT JSON_OBJECT('exists', COUNT(*) > 0)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = ${quote(tableName)}
      AND column_name = ${quote(columnName)};
  `);
  return Boolean(rows[0]?.exists);
}

function schemaIndexExists(tableName, indexName) {
  const rows = queryJson(`
    SELECT JSON_OBJECT('exists', COUNT(*) > 0)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = ${quote(tableName)}
      AND index_name = ${quote(indexName)};
  `);
  return Boolean(rows[0]?.exists);
}

function ensureSchemaEvolution() {
  const additions = {
    checkins: [
      ["checkin_business_date", "DATE NULL AFTER checked_in_at"],
      ["checkout_business_date", "DATE NULL AFTER checked_out_at"],
      ["created_by_user_id", "BIGINT UNSIGNED NULL AFTER checkout_business_date"],
      ["checked_out_by_user_id", "BIGINT UNSIGNED NULL AFTER created_by_user_id"]
    ],
    account_movements: [
      ["business_date", "DATE NULL AFTER occurred_at"],
      ["operational_day_id", "BIGINT UNSIGNED NULL AFTER business_date"],
      ["created_by_user_id", "BIGINT UNSIGNED NULL AFTER operational_day_id"],
      ["idempotency_key", "VARCHAR(160) NOT NULL DEFAULT '' AFTER created_by_user_id"]
    ],
    app_users: [
      ["must_change_password", "TINYINT(1) NOT NULL DEFAULT 1 AFTER password_changed_at"]
    ]
  };

  Object.entries(additions).forEach(([tableName, columns]) => {
    const missing = columns.filter(([columnName]) => !schemaColumnExists(tableName, columnName));
    if (!missing.length) return;
    runSql(`ALTER TABLE ${tableName} ${missing.map(([columnName, definition]) =>
      `ADD COLUMN ${columnName} ${definition}`
    ).join(", ")};`);
  });

  const indexes = [
    ["checkins", "ix_checkins_business_date", "checkin_business_date, status"],
    ["account_movements", "ix_account_movements_business_date", "business_date, occurred_at"],
    ["account_movements", "ix_account_movements_operational_day", "operational_day_id"]
  ];
  indexes.forEach(([tableName, indexName, columns]) => {
    if (!schemaIndexExists(tableName, indexName)) {
      runSql(`ALTER TABLE ${tableName} ADD INDEX ${indexName} (${columns});`);
    }
  });
}

function seedReferenceData() {
  seedAccessControl();
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

function seedAccessControl() {
  runSql(`
    INSERT INTO app_roles (code, name, description, is_system, active)
    VALUES ${ROLES.map(([code, name, description]) =>
      `(${quote(code)}, ${quote(name)}, ${quote(description)}, 1, 1)`
    ).join(",")}
    ON DUPLICATE KEY UPDATE
      name = VALUES(name), description = VALUES(description), active = 1;

    INSERT INTO app_permissions (code, module_code, name)
    VALUES ${PERMISSIONS.map(([code, moduleCode, name]) =>
      `(${quote(code)}, ${quote(moduleCode)}, ${quote(name)})`
    ).join(",")}
    ON DUPLICATE KEY UPDATE
      module_code = VALUES(module_code), name = VALUES(name);
  `);

  Object.entries(ROLE_PERMISSIONS).forEach(([roleCode, permissions]) => {
    if (!permissions.length) return;
    runSql(`
      INSERT IGNORE INTO app_role_permissions (role_id, permission_id)
      SELECT role.id, permission.id
      FROM app_roles role
      JOIN app_permissions permission ON permission.code IN (${permissions.map(quote).join(",")})
      WHERE role.code = ${quote(roleCode)};
    `);
  });
}

module.exports = {
  displayToSqlDate,
  ensureSchema,
  isAvailable,
  queryJson,
  quote,
  runSql,
  mexicoNowSql,
  sqlToDisplayDate,
  sqlToIso,
  stableKey,
  timestampToSql
};
