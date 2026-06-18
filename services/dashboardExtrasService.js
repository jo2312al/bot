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

function roundMoney(value) {
  return Math.round(
    Number(value || 0) * 100
  )
  /
  100;
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

  const subtotal =
    roundMoney(
      normalizedSections.reduce(
        (total, section) => total + section.subtotal,
        0
      )
    );

  const serviceChargePercent =
    Math.max(
      Number(input.serviceChargePercent || 0),
      0
    );

  const serviceCharge =
    roundMoney(
      subtotal * serviceChargePercent / 100
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
    headline:
      String(input.headline || "").trim(),
    stayDates:
      String(input.stayDates || "").trim(),
    people:
      Math.max(
        Number(input.people || 0),
        0
      ),
    checkIn:
      String(input.checkIn || "3:00 PM").trim(),
    checkOut:
      String(input.checkOut || "12:00 PM").trim(),
    validUntil:
      String(input.validUntil || "").trim(),
    notes:
      String(input.notes || "").trim(),
    serviceChargePercent:
      serviceChargePercent,
    sections:
      normalizedSections,
    subtotal:
      subtotal,
    serviceCharge:
      serviceCharge,
    total:
      roundMoney(
        subtotal + serviceCharge
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
