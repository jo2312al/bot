const fs = require("fs");
const path = require("path");

const DATA_DIR =
  path.join(
    __dirname,
    "../data"
  );

const NOTES_FILE =
  path.join(
    DATA_DIR,
    "reservationNotes.json"
  );

const QUOTES_FILE =
  path.join(
    DATA_DIR,
    "quotations.json"
  );

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

function readJson(file, fallback) {
  ensureDataDir();

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
    return fallback;
  }
}

function writeJson(file, payload) {
  ensureDataDir();

  fs.writeFileSync(
    file,
    JSON.stringify(
      payload,
      null,
      2
    ),
    "utf8"
  );
}

function getReservationNoteKey(reservation) {
  return String(
    reservation?.sourceKey
    ||
    (
      reservation?.folio
        ? `folio:${reservation.folio}`
        : ""
    )
  );
}

function readReservationNotes() {
  return readJson(
    NOTES_FILE,
    {}
  );
}

function saveReservationNote({
  reservationKey,
  note
}) {
  const key =
    String(reservationKey || "").trim();

  if (!key) {
    throw new Error("Reserva requerida");
  }

  const notes =
    readReservationNotes();

  notes[key] = {
    note:
      String(note || "").trim(),
    updatedAt:
      new Date().toISOString()
  };

  writeJson(
    NOTES_FILE,
    notes
  );

  return notes[key];
}

function readQuotations() {
  return readJson(
    QUOTES_FILE,
    []
  );
}

function money(value) {
  return Number(value || 0);
}

function normalizeQuotation(input) {
  const sections =
    Array.isArray(input.sections)
      ? input.sections
      : [];

  const normalizedSections =
    sections
      .map(section => {
        const quantity =
          Math.max(
            Number(section.quantity || 0),
            0
          );
        const unitPrice =
          Math.max(
            money(section.unitPrice),
            0
          );

        return {
          title:
            String(section.title || "Apartado").trim(),
          category:
            String(section.category || "otro").trim(),
          quantity,
          unitPrice,
          includes:
            String(section.includes || "").trim(),
          subtotal:
            quantity * unitPrice
        };
      })
      .filter(section =>
        section.title
        &&
        section.quantity > 0
      );

  if (!String(input.client || "").trim()) {
    throw new Error("Cliente requerido");
  }

  if (!normalizedSections.length) {
    throw new Error("Agrega al menos un apartado");
  }

  const id =
    input.id
    ||
    `COT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;

  return {
    id,
    client:
      String(input.client || "").trim(),
    contact:
      String(input.contact || "").trim(),
    eventName:
      String(input.eventName || "").trim(),
    validUntil:
      String(input.validUntil || "").trim(),
    notes:
      String(input.notes || "").trim(),
    sections:
      normalizedSections,
    total:
      normalizedSections.reduce(
        (total, section) => total + section.subtotal,
        0
      ),
    createdAt:
      input.createdAt || new Date().toISOString(),
    updatedAt:
      new Date().toISOString()
  };
}

function saveQuotation(input) {
  const quotation =
    normalizeQuotation(input);

  const quotations =
    readQuotations()
      .filter(item =>
        item.id !== quotation.id
      );

  quotations.push(quotation);
  quotations.sort((left, right) =>
    String(right.updatedAt).localeCompare(String(left.updatedAt))
  );

  writeJson(
    QUOTES_FILE,
    quotations
  );

  return quotation;
}

function getQuotation(id) {
  return readQuotations()
    .find(item =>
      item.id === id
    );
}

module.exports = {
  getQuotation,
  getReservationNoteKey,
  readQuotations,
  readReservationNotes,
  saveQuotation,
  saveReservationNote
};
