const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  execFile
} = require("child_process");
const mysql =
  require("./mysqlCliService");

const RACK_STATUS_FILE =
  path.join(
    __dirname,
    "../data/rackStatus.json"
  );

const TESSERACT_COMMAND =
  process.env.TESSERACT_PATH || "tesseract";

const IMAGE_MAGICK_COMMAND =
  process.env.IMAGE_MAGICK_PATH
  ||
  (
    process.platform === "win32"
      ? "magick"
      : "convert"
  );

const RACK_STATUSES = {
  BLO: "Bloqueado",
  VL: "Vacio limpio",
  VS: "Vacio sucio",
  CH: "Cambio de habitacion",
  OS: "Ocupado sucio",
  ND: "No durmio",
  A: "Pre-asignado limpio",
  FS: "Fuera de servicio",
  OR: "Ocupado reciente",
  OC: "Ocupado",
  OSE: "Ocupado sin equipaje",
  AS: "Asignado sucio",
  OL: "Ocupado limpio"
};

function isSuite(room) {
  const roomText =
    String(room);

  if (!/^[123]\d{2}$/.test(roomText)) {
    return false;
  }

  return [
    "01",
    "02",
    "12",
    "14"
  ].includes(roomText.slice(-2));
}

function normalizeRoomType(room, type) {
  const cleanType =
    String(type || "")
      .toUpperCase();

  if (isSuite(room)) {
    if (cleanType.includes("KING")) return "Suite King";
    return "Doble Suite";
  }

  if (cleanType.includes("KING")) return "King";
  if (cleanType.includes("DOB")) return "Doble";

  return "Sin tipo";
}

function normalizeStatus(status) {
  return String(status || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

function ensureDataDir() {
  const dir =
    path.dirname(RACK_STATUS_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(
      dir,
      {
        recursive: true
      }
    );
  }
}

function parseCsvReportTimestamp(csvText) {
  const text =
    String(csvText || "");

  const dateMatch =
    text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);

  const timeMatch =
    text.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);

  if (!dateMatch) {
    return {
      reportDate:
        "",
      reportTime:
        "",
      reportDateTime:
        ""
    };
  }

  const day =
    String(dateMatch[1])
      .padStart(2, "0");
  const month =
    String(dateMatch[2])
      .padStart(2, "0");
  const year =
    dateMatch[3];
  const hour =
    timeMatch
      ? String(timeMatch[1]).padStart(2, "0")
      : "00";
  const minute =
    timeMatch
      ? timeMatch[2]
      : "00";
  const second =
    timeMatch
      ? String(timeMatch[3] || "00").padStart(2, "0")
      : "00";

  return {
    reportDate:
      `${day}/${month}/${year}`,
    reportTime:
      `${hour}:${minute}:${second}`,
    reportDateTime:
      `${year}-${month}-${day}T${hour}:${minute}:${second}`
  };
}

function getMexicoParts(date = new Date()) {
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
        hourCycle:
          "h23"
      }
    )
      .formatToParts(date)
      .reduce((values, part) => {
        values[part.type] =
          part.value;

        return values;
      }, {});

  return {
    isoDate:
      `${parts.year}-${parts.month}-${parts.day}`,
    hour:
      Number(parts.hour || 0)
  };
}

function addDaysToIso(isoDate, days) {
  const [
    year,
    month,
    day
  ] =
    String(isoDate || "")
      .split("-")
      .map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  date.setUTCDate(
    date.getUTCDate() + days
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function validateRackReportDate(reportDateTime) {
  const reportIsoDate =
    String(reportDateTime || "")
      .slice(0, 10);

  const mexico =
    getMexicoParts();

  const yesterday =
    addDaysToIso(
      mexico.isoDate,
      -1
    );

  if (reportIsoDate === mexico.isoDate) {
    return {
      valid:
        true
    };
  }

  if (
    reportIsoDate === yesterday
    &&
    mexico.hour < 7
  ) {
    return {
      valid:
        true
    };
  }

  return {
    valid:
      false,
    error:
      "El rack CSV debe ser de hoy. Solo se acepta el de ayer antes de las 7:00 am."
  };
}

function readLatestRackStatus() {
  if (mysql.ensureSchema()) {
    const rows =
      mysql.queryJson(`
        SELECT JSON_OBJECT(
          'payload', payload_json
        )
        FROM rack_snapshots
        ORDER BY uploaded_at DESC, id DESC
        LIMIT 1;
      `);

    return rows[0]?.payload || null;
  }

  ensureDataDir();

  if (!fs.existsSync(RACK_STATUS_FILE)) {
    return null;
  }

  try {
    return JSON.parse(
      fs.readFileSync(
        RACK_STATUS_FILE,
        "utf8"
      )
    );
  } catch (error) {
    return null;
  }
}

function saveLatestRackStatus(nextStatus) {
  if (mysql.ensureSchema()) {
    const current =
      readLatestRackStatus();

    const currentTime =
      current?.reportDateTime
        ? new Date(current.reportDateTime).getTime()
        : 0;

    const nextTime =
      nextStatus?.reportDateTime
        ? new Date(nextStatus.reportDateTime).getTime()
        : Date.now();

    if (
      current
      &&
      currentTime > nextTime
    ) {
      return {
        saved:
          false,
        latest:
          current
      };
    }

    mysql.runSql(`
      INSERT INTO rack_snapshots (
        report_date,
        report_time,
        uploaded_at,
        uploaded_by,
        file_name,
        payload_json
      ) VALUES (
        ${nextStatus.reportDate ? mysql.quote(mysql.displayToSqlDate(nextStatus.reportDate)) : "NULL"},
        ${nextStatus.reportTime ? mysql.quote(String(nextStatus.reportTime).slice(0, 8)) : "NULL"},
        ${mysql.quote(mysql.timestampToSql(nextStatus.uploadedAt) || new Date().toISOString().slice(0, 19).replace("T", " "))},
        ${mysql.quote(nextStatus.uploadedBy || "")},
        ${mysql.quote(nextStatus.fileName || "")},
        ${mysql.quote(JSON.stringify(nextStatus))}
      );
    `);

    const snapshotRows =
      mysql.queryJson(`
        SELECT JSON_OBJECT(
          'id', id
        )
        FROM rack_snapshots
        ORDER BY id DESC
        LIMIT 1;
      `);
    const snapshotId =
      snapshotRows[0]?.id;

    if (
      snapshotId
      &&
      Array.isArray(nextStatus.rooms)
      &&
      nextStatus.rooms.length
    ) {
      mysql.runSql(`
        INSERT INTO rack_snapshot_rooms (
          rack_snapshot_id,
          room_id,
          room_status,
          status_label,
          room_type_snapshot
        ) VALUES
          ${nextStatus.rooms.map(room => `(
            ${Number(snapshotId)},
            (SELECT id FROM rooms WHERE room_number = ${mysql.quote(room.room)}),
            ${mysql.quote(room.status || "")},
            ${mysql.quote(room.statusLabel || "")},
            ${mysql.quote(room.type || "")}
          )`).join(",")}
        ON DUPLICATE KEY UPDATE
          room_status = VALUES(room_status),
          status_label = VALUES(status_label),
          room_type_snapshot = VALUES(room_type_snapshot);
      `);
    }

    return {
      saved:
        true,
      latest:
        nextStatus
    };
  }

  ensureDataDir();

  const current =
    readLatestRackStatus();

  const currentTime =
    current?.reportDateTime
      ? new Date(current.reportDateTime).getTime()
      : 0;

  const nextTime =
    nextStatus?.reportDateTime
      ? new Date(nextStatus.reportDateTime).getTime()
      : Date.now();

  if (
    current
    &&
    currentTime > nextTime
  ) {
    return {
      saved:
        false,
      latest:
        current
    };
  }

  fs.writeFileSync(
    RACK_STATUS_FILE,
    JSON.stringify(
      nextStatus,
      null,
      2
    ),
    "utf8"
  );

  return {
    saved:
      true,
    latest:
      nextStatus
  };
}

function rebuildRackStatusFromRooms(status) {
  const summary =
    summarizeRackFull(
      status.rooms || []
    );

  return {
    ...status,
    counts:
      summary.fullCounts,
    rooms:
      summary.rooms,
    occupied:
      summary.occupied,
    blocked:
      summary.blocked,
    availableClean:
      summary.availableClean,
    availableDirty:
      summary.availableDirty,
    updatedAt:
      new Date()
        .toISOString()
  };
}

function updateRackRoomStatus({
  room,
  status
}) {
  const current =
    readLatestRackStatus();

  const normalizedRoom =
    String(room || "")
      .replace(/\D/g, "");

  const normalizedStatus =
    normalizeStatus(status || "OC");

  if (!current || !Array.isArray(current.rooms)) {
    throw new Error("No hay rack guardado para actualizar");
  }

  if (!RACK_STATUSES[normalizedStatus]) {
    throw new Error("Estado de habitacion invalido");
  }

  let updated =
    false;

  const rooms =
    current.rooms.map(item => {
      if (item.room !== normalizedRoom) {
        return item;
      }

      updated =
        true;

      return {
        ...item,
        status:
          normalizedStatus,
        statusLabel:
          RACK_STATUSES[normalizedStatus]
      };
    });

  if (!updated) {
    throw new Error("Habitacion no encontrada en el rack");
  }

  const next =
    rebuildRackStatusFromRooms({
      ...current,
      rooms
    });

  if (mysql.ensureSchema()) {
    saveLatestRackStatus(next);
    return next;
  }

  fs.writeFileSync(
    RACK_STATUS_FILE,
    JSON.stringify(
      next,
      null,
      2
    ),
    "utf8"
  );

  return next;
}

function extensionFromMime(mimeType) {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".jpg";
}

function runTesseract(imagePath, options = []) {
  return new Promise((resolve, reject) => {
    execFile(
      TESSERACT_COMMAND,
      [
        imagePath,
        "stdout",
        "-l",
        "eng",
        ...options
      ],
      {
        windowsHide: true,
        timeout: 45000,
        maxBuffer: 1024 * 1024 * 8
      },
      (error, stdout, stderr) => {
        if (error) {
          const message =
            error.code === "ENOENT"
              ? "Tesseract no esta instalado o no esta en PATH. Instala Tesseract OCR y reinicia el bot/dashboard."
              : stderr || error.message;

          reject(new Error(message));
          return;
        }

        resolve(stdout);
      }
    );
  });
}

function runImageMagick(args) {
  return new Promise(resolve => {
    execFile(
      IMAGE_MAGICK_COMMAND,
      args,
      {
        windowsHide: true,
        timeout: 45000,
        maxBuffer: 1024 * 1024 * 8
      },
      error => {
        resolve(!error);
      }
    );
  });
}

async function createPreprocessedImages(imagePath, tmpDir) {
  const variants = [
    imagePath
  ];

  const basePath =
    path.join(
      tmpDir,
      `rack-clean-${Date.now()}.png`
    );

  const croppedPath =
    path.join(
      tmpDir,
      `rack-crop-${Date.now()}.png`
    );

  const thresholdPath =
    path.join(
      tmpDir,
      `rack-threshold-${Date.now()}.png`
    );

  const baseOk =
    await runImageMagick([
      imagePath,
      "-auto-orient",
      "-colorspace",
      "Gray",
      "-resize",
      "260%",
      "-contrast-stretch",
      "2%x2%",
      "-sharpen",
      "0x1",
      basePath
    ]);

  if (baseOk) {
    variants.push(basePath);
  }

  const croppedOk =
    await runImageMagick([
      imagePath,
      "-auto-orient",
      "-gravity",
      "North",
      "-crop",
      "100%x82%+0+0",
      "+repage",
      "-colorspace",
      "Gray",
      "-resize",
      "280%",
      "-contrast-stretch",
      "2%x2%",
      "-sharpen",
      "0x1",
      croppedPath
    ]);

  if (croppedOk) {
    variants.push(croppedPath);
  }

  const thresholdOk =
    await runImageMagick([
      croppedOk ? croppedPath : imagePath,
      "-colorspace",
      "Gray",
      "-resize",
      "120%",
      "-contrast-stretch",
      "1%x1%",
      "-threshold",
      "58%",
      thresholdPath
    ]);

  if (thresholdOk) {
    variants.push(thresholdPath);
  }

  return variants;
}

async function runTesseractPasses(imagePath) {
  const passes = [
    [
      "--psm",
      "6",
      "-c",
      "preserve_interword_spaces=1",
      "-c",
      "tessedit_char_whitelist=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz()#* "
    ],
    [
      "--psm",
      "11",
      "-c",
      "preserve_interword_spaces=1",
      "-c",
      "tessedit_char_whitelist=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz()#* "
    ],
    [
      "--psm",
      "12",
      "-c",
      "preserve_interword_spaces=1",
      "-c",
      "tessedit_char_whitelist=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz()#* "
    ]
  ];

  const outputs = [];
  let firstError = null;

  for (const pass of passes) {
    try {
      outputs.push(
        await runTesseract(
          imagePath,
          pass
        )
      );
    } catch (error) {
      firstError =
        firstError || error;
    }
  }

  if (!outputs.length && firstError) {
    throw firstError;
  }

  return outputs.join("\n");
}

function normalizeOcrToken(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[()[\]{}*#|:;,.]/g, "")
    .replace(/0S\b/g, "OS")
    .replace(/\bV1\b/g, "VL")
    .replace(/\bVI\b/g, "VL")
    .replace(/\bVLJ\b/g, "VL")
    .replace(/\bVLI\b/g, "VL")
    .replace(/\bBL0\b/g, "BLO")
    .replace(/\bD0BL\b/g, "DOBL")
    .replace(/\bD0BLE\b/g, "DOBLE")
    .trim();
}

function getRackTokens(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .split(/[\s]+/)
    .map(normalizeOcrToken)
    .filter(Boolean);
}

function normalizeRoomCandidate(token) {
  const cleaned =
    String(token || "")
      .replace(/[^\d]/g, "");

  if (/^[1-4]\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  return null;
}

function normalizeTypeToken(token) {
  const clean =
    normalizeOcrToken(token);

  if (clean.includes("KING") || clean === "KNG") return "KING";
  if (clean.includes("DOBL") || clean.includes("DOBLE") || clean === "DBL") return "DOBL";

  return "";
}

function parseRackTextBySequence(text) {
  const tokens =
    getRackTokens(text);

  const roomsByNumber =
    new Map();

  for (let index = 0; index < tokens.length; index++) {
    const room =
      normalizeRoomCandidate(tokens[index]);

    if (!room) {
      continue;
    }

    let status = "";
    let type = "";

    for (
      let offset = 1;
      offset <= 5 && index + offset < tokens.length;
      offset++
    ) {
      const candidate =
        normalizeOcrToken(tokens[index + offset]);

      if (!status && RACK_STATUSES[candidate]) {
        status = candidate;
        continue;
      }

      const typeCandidate =
        normalizeTypeToken(candidate);

      if (!type && typeCandidate) {
        type = typeCandidate;
      }

      if (status && type) {
        break;
      }
    }

    if (status) {
      roomsByNumber.set(room, {
        room,
        status,
        type
      });
    }
  }

  return Array.from(
    roomsByNumber.values()
  );
}

function parseRackTextByRegex(text) {
  const normalized =
    String(text || "")
      .replace(/\r/g, "\n")
      .replace(/[|]/g, " ")
      .replace(/\s+/g, " ");

  const pattern =
    /(?:^|[^0-9])([1-4]\d{2})\s+([A-Z]{1,3})\s*(?:\(?\s*([A-Z]{3,5})\s*\)?)?/gi;

  const roomsByNumber =
    new Map();

  let match;

  while (
    (match = pattern.exec(normalized))
  ) {
    const room =
      match[1];

    const status =
      normalizeOcrToken(match[2]);

    if (!RACK_STATUSES[status]) {
      continue;
    }

    const type =
      normalizeTypeToken(match[3] || "");

    roomsByNumber.set(room, {
      room,
      status,
      type
    });
  }

  return Array.from(
    roomsByNumber.values()
  );
}

function mergeRackEntries(...entryLists) {
  const roomsByNumber =
    new Map();

  entryLists
    .flat()
    .forEach(entry => {
      if (!entry || !entry.room || !entry.status) return;

      const previous =
        roomsByNumber.get(entry.room);

      if (
        !previous
        ||
        (
          previous.type === ""
          &&
          entry.type
        )
      ) {
        roomsByNumber.set(
          entry.room,
          entry
        );
      }
    });

  return Array.from(
    roomsByNumber.values()
  );
}

function parseRackText(text) {
  return mergeRackEntries(
    parseRackTextByRegex(text),
    parseRackTextBySequence(text)
  );
}

function summarizeRack(entries) {
  const rooms =
    entries
      .map(entry => ({
        room:
          String(entry.room || "")
            .replace(/\D/g, ""),
        status:
          normalizeStatus(entry.status),
        rawType:
          entry.type || ""
      }))
      .filter(entry =>
        /^\d{3}$/.test(entry.room)
        &&
        RACK_STATUSES[entry.status]
      )
      .map(entry => ({
        room:
          entry.room,
        status:
          entry.status,
        statusLabel:
          RACK_STATUSES[entry.status],
        type:
          normalizeRoomType(
            entry.room,
            entry.rawType
          )
      }))
      .sort((left, right) =>
        Number(left.room) - Number(right.room)
      );

  const availableClean =
    rooms.filter(room =>
      room.status === "VL"
    );

  const availableDirty =
    rooms.filter(room =>
      room.status === "VS"
    );

  const counts = {
    availableClean: {
      total:
        availableClean.length,
      King:
        availableClean.filter(room => room.type === "King").length,
      Doble:
        availableClean.filter(room => room.type === "Doble").length,
      Suite:
        availableClean.filter(room =>
          room.type === "Suite King"
          ||
          room.type === "Doble Suite"
        ).length
    },
    availableDirty: {
      total:
        availableDirty.length,
      King:
        availableDirty.filter(room => room.type === "King").length,
      Doble:
        availableDirty.filter(room => room.type === "Doble").length,
      Suite:
        availableDirty.filter(room =>
          room.type === "Suite King"
          ||
          room.type === "Doble Suite"
        ).length
    }
  };

  return {
    rooms,
    availableClean,
    availableDirty,
    counts
  };
}

function formatRackSummary(summary) {
  const availableClean =
    summary.availableClean
      .map(room => `${room.room} ${room.type}`)
      .join(", ") || "Ninguna";

  const availableDirty =
    summary.availableDirty
      .map(room => `${room.room} ${room.type}`)
      .join(", ") || "Ninguna";

  return `📋 LECTURA DE RACK

✅ Disponibles limpias (VL): ${summary.counts.availableClean.total}
• King: ${summary.counts.availableClean.King}
• Doble: ${summary.counts.availableClean.Doble}
• Suite: ${summary.counts.availableClean.Suite}

Habitaciones VL:
${availableClean}

🧹 Vacias sucias (VS): ${summary.counts.availableDirty.total}
• King: ${summary.counts.availableDirty.King}
• Doble: ${summary.counts.availableDirty.Doble}
• Suite: ${summary.counts.availableDirty.Suite}

Habitaciones VS:
${availableDirty}

ℹ️ Suites: pisos 1 al 3 que terminan en 01, 02, 12 y 14.`;
}

function countRackTypes(rooms) {
  return {
    total:
      rooms.length,
    King:
      rooms.filter(room => room.type === "King").length,
    "Suite King":
      rooms.filter(room => room.type === "Suite King").length,
    "Doble Suite":
      rooms.filter(room => room.type === "Doble Suite").length,
    Doble:
      rooms.filter(room => room.type === "Doble").length
  };
}

function formatRoomList(rooms) {
  return rooms
    .map(room =>
      `${room.room} ${room.type} ${room.status}`
    )
    .join(", ")
    ||
    "Ninguna";
}

function summarizeRackFull(entries) {
  const summary =
    summarizeRack(entries);

  const occupied =
    summary.rooms.filter(room =>
      [
        "OC",
        "OS",
        "OL",
        "OR",
        "OSE",
        "ND"
      ].includes(room.status)
    );

  const blocked =
    summary.rooms.filter(room =>
      [
        "BLO",
        "FS"
      ].includes(room.status)
    );

  return {
    ...summary,
    occupied,
    blocked,
    fullCounts: {
      total:
        summary.rooms.length,
      occupied:
        countRackTypes(occupied),
      blocked:
        countRackTypes(blocked),
      availableClean:
        countRackTypes(summary.availableClean),
      availableDirty:
        countRackTypes(summary.availableDirty)
    }
  };
}

function formatRackCsvSummary(summary) {
  return `LECTURA DE RACK CSV

Habitaciones leidas: ${summary.fullCounts.total}

Ocupadas: ${summary.fullCounts.occupied.total}
King: ${summary.fullCounts.occupied.King}
Suite King: ${summary.fullCounts.occupied["Suite King"]}
Doble Suite: ${summary.fullCounts.occupied["Doble Suite"]}
Doble: ${summary.fullCounts.occupied.Doble}

Habitaciones ocupadas:
${formatRoomList(summary.occupied)}

Bloqueadas / fuera de servicio: ${summary.fullCounts.blocked.total}
${formatRoomList(summary.blocked)}

Disponibles limpias (VL): ${summary.fullCounts.availableClean.total}
King: ${summary.fullCounts.availableClean.King}
Suite King: ${summary.fullCounts.availableClean["Suite King"]}
Doble Suite: ${summary.fullCounts.availableClean["Doble Suite"]}
Doble: ${summary.fullCounts.availableClean.Doble}

Habitaciones VL:
${formatRoomList(summary.availableClean)}

Vacias sucias (VS): ${summary.fullCounts.availableDirty.total}
King: ${summary.fullCounts.availableDirty.King}
Suite King: ${summary.fullCounts.availableDirty["Suite King"]}
Doble Suite: ${summary.fullCounts.availableDirty["Doble Suite"]}
Doble: ${summary.fullCounts.availableDirty.Doble}

Habitaciones VS:
${formatRoomList(summary.availableDirty)}`;
}

function analyzeRackCsv({
  csvText,
  fileName = "",
  uploadedBy = ""
}) {
  const entries =
    parseRackText(csvText);

  const summary =
    summarizeRackFull(entries);

  const reportInfo =
    parseCsvReportTimestamp(csvText);

  const dateValidation =
    validateRackReportDate(
      reportInfo.reportDateTime
    );

  if (!dateValidation.valid) {
    return {
      ok:
        false,
      error:
        dateValidation.error
    };
  }

  if (!summary.rooms.length) {
    return {
      ok:
        false,
      error:
        "No pude detectar habitaciones en el CSV exportado."
    };
  }

  const rackStatus = {
    ...reportInfo,
    uploadedAt:
      new Date()
        .toISOString(),
    uploadedBy,
    fileName,
    counts:
      summary.fullCounts,
    rooms:
      summary.rooms,
    occupied:
      summary.occupied,
    blocked:
      summary.blocked,
    availableClean:
      summary.availableClean,
    availableDirty:
      summary.availableDirty
  };

  const saveResult =
    saveLatestRackStatus(rackStatus);

  return {
    ok:
      true,
    message:
      formatRackCsvSummary(summary),
    summary,
    rackStatus,
    saved:
      saveResult.saved,
    latest:
      saveResult.latest
  };
}

async function analyzeRackImage({
  imageBase64,
  mimeType = "image/jpeg"
}) {
  const tmpDir =
    path.join(
      os.tmpdir(),
      "hotel-rack-ocr"
    );

  fs.mkdirSync(
    tmpDir,
    {
      recursive: true
    }
  );

  const imagePath =
    path.join(
      tmpDir,
      `rack-${Date.now()}${extensionFromMime(mimeType)}`
    );

  fs.writeFileSync(
    imagePath,
    Buffer.from(
      imageBase64,
      "base64"
    )
  );

  try {
    const imageVariants =
      await createPreprocessedImages(
        imagePath,
        tmpDir
      );

    const outputs = [];

    for (const variant of imageVariants) {
      outputs.push(
        await runTesseractPasses(variant)
      );
    }

    const text =
      outputs.join("\n");

    const rooms =
      parseRackText(text);

    const summary =
      summarizeRack(rooms);

    return {
      ok: true,
      ocrText:
        text,
      summary,
      message:
        formatRackSummary(summary),
      ocrPreview:
        text
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 1200)
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error.message
    };
  } finally {
    try {
      fs.unlinkSync(imagePath);
    } catch (error) {
      // Ignorar limpieza fallida de archivo temporal.
    }

    try {
      fs.readdirSync(tmpDir)
        .filter(file =>
          file.startsWith("rack-clean-")
          ||
          file.startsWith("rack-crop-")
          ||
          file.startsWith("rack-threshold-")
        )
        .forEach(file =>
          fs.unlinkSync(
            path.join(tmpDir, file)
          )
        );
    } catch (error) {
      // Ignorar limpieza fallida de variantes temporales.
    }
  }
}

module.exports = {
  analyzeRackCsv,
  analyzeRackImage,
  readLatestRackStatus,
  updateRackRoomStatus,
  summarizeRack,
  formatRackSummary,
  parseRackText,
  parseRackTextBySequence,
  isSuite
};
