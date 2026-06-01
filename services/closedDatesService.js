const fs = require("fs");
const path = require("path");

const DATA_FILE =
  path.join(
    __dirname,
    "../data/closedDates.json"
  );

const DEFAULT_CLOSED_DATES = [
  "01/07/2026",
  "02/07/2026",
  "03/07/2026",
  "04/07/2026"
];

function ensureDataFile() {
  const dataDir =
    path.dirname(DATA_FILE);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, {
      recursive: true
    });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        DEFAULT_CLOSED_DATES,
        null,
        2
      ),
      "utf8"
    );
  }
}

function parseDisplayDate(value) {
  const [
    day,
    month,
    year
  ] =
    String(value || "")
      .split("/")
      .map(Number);

  const date =
    new Date(
      year,
      month - 1,
      day
    );

  if (
    date.getFullYear() !== year
    ||
    date.getMonth() !== month - 1
    ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatDisplayDate(date) {
  const day =
    String(date.getDate())
      .padStart(2, "0");

  const month =
    String(date.getMonth() + 1)
      .padStart(2, "0");

  return `${day}/${month}/${date.getFullYear()}`;
}

function formatIsoDate(date) {
  const month =
    String(date.getMonth() + 1)
      .padStart(2, "0");

  const day =
    String(date.getDate())
      .padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

function parseIsoDate(value) {
  const match =
    String(value || "")
      .match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const date =
    new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );

  if (formatIsoDate(date) !== value) {
    return null;
  }

  return date;
}

function normalizeDate(value) {
  const text =
    String(value || "")
      .trim();

  const isoDate =
    parseIsoDate(text);

  if (isoDate) {
    return formatDisplayDate(isoDate);
  }

  const displayDate =
    parseDisplayDate(text);

  if (displayDate) {
    return formatDisplayDate(displayDate);
  }

  return null;
}

function readClosedDates() {
  ensureDataFile();

  try {
    const raw =
      fs.readFileSync(
        DATA_FILE,
        "utf8"
      );

    return Array.from(
      new Set([
        ...DEFAULT_CLOSED_DATES,
        ...JSON.parse(raw)
          .map(normalizeDate)
          .filter(Boolean)
      ])
    )
      .sort((left, right) =>
        parseDisplayDate(left) - parseDisplayDate(right)
      );
  } catch (error) {
    return DEFAULT_CLOSED_DATES;
  }
}

function writeClosedDates(dates) {
  ensureDataFile();

  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(
      dates,
      null,
      2
    ),
    "utf8"
  );
}

function getDateRange(startValue, endValue) {
  const startDisplay =
    normalizeDate(startValue);

  const endDisplay =
    normalizeDate(endValue || startValue);

  if (!startDisplay || !endDisplay) {
    throw new Error("Fechas invalidas");
  }

  const start =
    parseDisplayDate(startDisplay);

  const end =
    parseDisplayDate(endDisplay);

  if (start > end) {
    throw new Error("La fecha inicial no puede ser mayor a la final");
  }

  const dates = [];
  const cursor =
    new Date(start);

  while (cursor <= end) {
    dates.push(
      formatDisplayDate(cursor)
    );

    cursor.setDate(
      cursor.getDate() + 1
    );
  }

  return dates;
}

function closeDateRange({
  start,
  end
}) {
  const current =
    readClosedDates();

  const next =
    Array.from(
      new Set([
        ...current,
        ...getDateRange(start, end)
      ])
    )
      .sort((left, right) =>
        parseDisplayDate(left) - parseDisplayDate(right)
      );

  writeClosedDates(next);

  return next;
}

function openDate(value) {
  const date =
    normalizeDate(value);

  if (!date) {
    throw new Error("Fecha invalida");
  }

  const next =
    readClosedDates()
      .filter(closedDate =>
        closedDate !== date
      );

  writeClosedDates(next);

  return next;
}

function openDateRange({
  start,
  end
}) {
  const datesToOpen =
    new Set(
      getDateRange(start, end)
    );

  const next =
    readClosedDates()
      .filter(closedDate =>
        !datesToOpen.has(closedDate)
      );

  writeClosedDates(next);

  return next;
}

function isClosedDisplayDate(value) {
  const date =
    normalizeDate(value);

  if (!date) {
    return false;
  }

  return readClosedDates()
    .includes(date);
}

function getMexicoTodayIso() {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "America/Mexico_City",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    )
      .formatToParts(new Date());

  const values =
    Object.fromEntries(
      parts.map(part => [
        part.type,
        part.value
      ])
    );

  return `${values.year}-${values.month}-${values.day}`;
}

module.exports = {
  closeDateRange,
  formatDisplayDate,
  formatIsoDate,
  getMexicoTodayIso,
  getDateRange,
  isClosedDisplayDate,
  normalizeDate,
  openDate,
  openDateRange,
  parseDisplayDate,
  readClosedDates
};
