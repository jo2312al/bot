const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  execFile
} = require("child_process");

const TESSERACT_COMMAND =
  process.env.TESSERACT_PATH || "tesseract";

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
  if (isSuite(room)) {
    return "Suite";
  }

  const cleanType =
    String(type || "")
      .toUpperCase();

  if (cleanType.includes("KING")) return "King";
  if (cleanType.includes("DOB")) return "Doble";

  return "Sin tipo";
}

function normalizeStatus(status) {
  return String(status || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

function extensionFromMime(mimeType) {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".jpg";
}

function runTesseract(imagePath) {
  return new Promise((resolve, reject) => {
    execFile(
      TESSERACT_COMMAND,
      [
        imagePath,
        "stdout",
        "-l",
        "eng",
        "--psm",
        "6"
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

function parseRackText(text) {
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
      normalizeStatus(match[2]);

    if (!RACK_STATUSES[status]) {
      continue;
    }

    const type =
      match[3] || "";

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
        availableClean.filter(room => room.type === "Suite").length
    },
    availableDirty: {
      total:
        availableDirty.length,
      King:
        availableDirty.filter(room => room.type === "King").length,
      Doble:
        availableDirty.filter(room => room.type === "Doble").length,
      Suite:
        availableDirty.filter(room => room.type === "Suite").length
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
    const text =
      await runTesseract(imagePath);

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
        formatRackSummary(summary)
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
  }
}

module.exports = {
  analyzeRackImage,
  summarizeRack,
  formatRackSummary,
  parseRackText,
  isSuite
};
