const fs = require("fs");
const path = require("path");

const {
  GROUP_ID
} = require("../config/config");

const LOG_FILE =
  process.env.GROUP_RESERVATION_LOG_FILE
  ||
  path.join(
    __dirname,
    "../logs/bot.log"
  );

const TOTAL_ROOMS =
  69;

const MONTHS = {
  enero: 1,
  ene: 1,
  febrero: 2,
  feb: 2,
  marzo: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  mayo: 5,
  may: 5,
  junio: 6,
  jun: 6,
  julio: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  septiembre: 9,
  setiembre: 9,
  sep: 9,
  octubre: 10,
  oct: 10,
  noviembre: 11,
  nov: 11,
  diciembre: 12,
  dic: 12
};

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pad(value) {
  return String(value)
    .padStart(2, "0");
}

function parseLogDate(value) {
  const match =
    String(value || "")
      .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);

  if (!match) {
    return null;
  }

  return {
    day:
      Number(match[2]),
    month:
      Number(match[1]),
    year:
      Number(match[3])
  };
}

function formatDisplayDate({
  day,
  month,
  year
}) {
  return `${pad(day)}/${pad(month)}/${year}`;
}

function parseReservationDateFromText(value, fallbackYear) {
  const text =
    normalize(value)
      .replace(/\bde\b/g, " ")
      .replace(/(\d)([a-z])/g, "$1 $2")
      .replace(/([a-z])(\d)/g, "$1 $2")
      .replace(/[.,-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  let match =
    text.match(
      /^(\d{1,2})[\/\s](\d{1,2})(?:[\/\s](\d{2}|\d{4}))?$/
    );

  let day;
  let month;
  let year;

  if (match) {
    day = Number(match[1]);
    month = Number(match[2]);
    year = match[3]
      ? Number(match[3])
      : fallbackYear;
  } else {
    match =
      text.match(
        /^(\d{1,2}) ([a-z]+)(?: (\d{2}|\d{4}))?$/
      );

    if (!match) {
      return null;
    }

    day = Number(match[1]);
    month = MONTHS[match[2]];
    year = match[3]
      ? Number(match[3])
      : fallbackYear;
  }

  if (!day || !month || !year) {
    return null;
  }

  if (year < 100) {
    year += 2000;
  }

  return {
    day,
    month,
    year,
    display:
      formatDisplayDate({
        day,
        month,
        year
      })
  };
}

function parseFirstNumber(value, fallback = 0) {
  const match =
    String(value || "")
      .match(/\d+/);

  return match
    ? Number(match[0])
    : fallback;
}

function parseNumberBeforeLabel(value, labels, fallback = 0) {
  const pattern =
    new RegExp(
      `(\\d+)\\s*(?:${labels.join("|")})`,
      "i"
    );

  const match =
    normalize(value)
      .match(pattern);

  return match
    ? Number(match[1])
    : fallback;
}

function getLineValue(block, label) {
  const pattern =
    new RegExp(
      `^\\s*${label}\\s*:\\s*(.+)$`,
      "im"
    );

  return block.match(pattern)?.[1]?.trim() || "";
}

function parseGroupLogEvents(logText) {
  const events = [];
  const lines =
    String(logText || "")
      .split(/\r?\n/);

  let current =
    null;

  for (const line of lines) {
    const match =
      line.match(
        /^\[(.*?)\] User: (.*?) \| Modulo: Chat Grupal \| Action: (.*)$/
      );

    if (match) {
      if (current) {
        events.push(current);
      }

      current = {
        timestamp:
          match[1],
        groupId:
          match[2],
        action:
          match[3] || ""
      };

      continue;
    }

    if (
      current
      &&
      !line.startsWith("[")
    ) {
      current.action += `\n${line}`;
    }
  }

  if (current) {
    events.push(current);
  }

  return events;
}

function parseReservationBlock(event) {
  if (event.groupId !== GROUP_ID) {
    return null;
  }

  const action =
    event.action || "";

  if (
    !/reservaci\S*n\s+para/i.test(action)
  ) {
    return null;
  }

  const logDate =
    parseLogDate(event.timestamp);

  if (!logDate) {
    return null;
  }

  const name =
    action
      .match(/reservaci\S*n\s+para\s*:?\s*(.*)/i)?.[1]
      ?.split("\n")[0]
      ?.trim()
    ||
    "Sin nombre";

  const rawDate =
    getLineValue(action, "Fecha");

  const parsedDate =
    parseReservationDateFromText(
      rawDate,
      logDate.year
    );

  if (!parsedDate) {
    return null;
  }

  const habitacionesLine =
    action.match(/^.*habitaci\S*n.*$/im)?.[0] || "";

  const adultosLine =
    action.match(/^.*adulto.*$/im)?.[0] || "";

  const menoresLine =
    action.match(/^.*(menor|ni\S*o).*$/im)?.[0] || adultosLine;

  const tarifa =
    getLineValue(action, "Tarifa");

  const telefono =
    action.match(/tel\s*:?\s*([+\d\s-]{7,})/i)?.[1]?.trim() || "";

  const hora =
    action.match(/hora.*?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i)?.[1]?.trim() || "";

  const habitaciones =
    Math.max(
      parseFirstNumber(
        habitacionesLine,
        1
      ),
      1
    );

  const adultos =
    parseNumberBeforeLabel(
      adultosLine,
      ["adulto", "adultos"],
      0
    );

  const menores =
    parseNumberBeforeLabel(
      menoresLine,
      ["menor", "menores", "nino", "ninos"],
      0
    );

  const tipo =
    normalize(habitacionesLine)
      .includes("king")
      ? "King"
      : normalize(habitacionesLine)
        .includes("suite")
        ? "Suite"
        : normalize(habitacionesLine)
          .includes("2 camas")
          ? "Doble"
          : "";

  return {
    source:
      "grupo",
    groupId:
      event.groupId,
    timestamp:
      event.timestamp,
    nombre:
      name,
    fecha:
      parsedDate.display,
    habitaciones,
    adultos,
    ninos:
      menores,
    tipo,
    tarifa,
    telefono,
    hora,
    raw:
      action
  };
}

function readGroupReservations() {
  if (!fs.existsSync(LOG_FILE)) {
    return [];
  }

  const logText =
    fs.readFileSync(
      LOG_FILE,
      "utf8"
    );

  return parseGroupLogEvents(logText)
    .map(parseReservationBlock)
    .filter(Boolean);
}

function buildGroupReservationCalendar(reservations) {
  const byDate =
    new Map();

  for (const reservation of reservations) {
    if (!byDate.has(reservation.fecha)) {
      byDate.set(
        reservation.fecha,
        {
          date:
            reservation.fecha,
          occupied:
            0,
          total:
            TOTAL_ROOMS,
          reservations:
            []
        }
      );
    }

    const day =
      byDate.get(reservation.fecha);

    day.occupied +=
      reservation.habitaciones || 1;

    day.reservations.push(reservation);
  }

  return [...byDate.values()]
    .sort((left, right) =>
      dateValue(left.date) - dateValue(right.date)
    );
}

function dateValue(value) {
  const [
    day,
    month,
    year
  ] =
    String(value || "")
      .split("/")
      .map(Number);

  return new Date(
    year,
    month - 1,
    day
  )
    .getTime();
}

module.exports = {
  TOTAL_ROOMS,
  readGroupReservations,
  buildGroupReservationCalendar
};
