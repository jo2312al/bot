const fs = require("fs");
const path = require("path");

const {
  GROUP_ID
} = require("../config/config");
const {
  readReservations,
  normalizeRoomType
} = require("./roomInventoryService");
const {
  readCalendarReservations,
  saveCalendarReservation
} = require("./reservationDatabaseService");

const DEFAULT_LOG_FILE =
  path.join(
    __dirname,
    "../logs/bot.log"
  );

const FALLBACK_LOG_FILE =
  path.join(
    __dirname,
    "../logs/remote-bot.log"
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

function formatDisplayDate({
  day,
  month,
  year
}) {
  return `${pad(day)}/${pad(month)}/${year}`;
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

function addDays(dateParts, days) {
  const date =
    new Date(
      dateParts.year,
      dateParts.month - 1,
      dateParts.day
    );

  date.setDate(
    date.getDate() + days
  );

  return {
    day:
      date.getDate(),
    month:
      date.getMonth() + 1,
    year:
      date.getFullYear()
  };
}

function normalizeDateText(value) {
  return normalize(value)
    .replace(/\bde\b/g, " ")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/[.,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validDateParts({
  day,
  month,
  year
}) {
  if (
    !day
    ||
    !month
    ||
    !year
  ) {
    return null;
  }

  const fullYear =
    year < 100
      ? year + 2000
      : year;

  const date =
    new Date(
      fullYear,
      month - 1,
      day
    );

  if (
    date.getFullYear() !== fullYear
    ||
    date.getMonth() !== month - 1
    ||
    date.getDate() !== day
  ) {
    return null;
  }

  return {
    day,
    month,
    year:
      fullYear
  };
}

function parseDateToken(value, fallbackYear) {
  const text =
    normalizeDateText(value);

  let match =
    text.match(
      /^(\d{1,2})[\/\s](\d{1,2})(?:[\/\s](\d{2}|\d{4}))?$/
    );

  if (match) {
    return validDateParts({
      day:
        Number(match[1]),
      month:
        Number(match[2]),
      year:
        match[3]
          ? Number(match[3])
          : fallbackYear
    });
  }

  match =
    text.match(
      /^(\d{1,2}) ([a-z]+)(?: (\d{2}|\d{4}))?$/
    );

  if (!match) {
    return null;
  }

  return validDateParts({
    day:
      Number(match[1]),
    month:
      MONTHS[match[2]],
    year:
      match[3]
        ? Number(match[3])
        : fallbackYear
  });
}

function parseReservationDatesFromText(value, fallbackDate) {
  const text =
    normalizeDateText(value);

  if (!text) {
    return [];
  }

  if (/\bhoy\b/.test(text)) {
    return [fallbackDate];
  }

  if (/\bmanana\b/.test(text)) {
    return [
      addDays(
        fallbackDate,
        1
      )
    ];
  }

  let match =
    text.match(
      /(\d{1,2})\s*(?:al|-|a)\s*(\d{1,2})\s*([a-z]+)(?:\s*(\d{2}|\d{4}))?/
    );

  if (match) {
    const month =
      MONTHS[match[3]];
    const year =
      match[4]
        ? Number(match[4])
        : fallbackDate.year;
    const start =
      Number(match[1]);
    const end =
      Number(match[2]);

    if (
      month
      &&
      end >= start
      &&
      end - start <= 31
    ) {
      return Array.from(
        {
          length:
            end - start + 1
        },
        (_, index) =>
          validDateParts({
            day:
              start + index,
            month,
            year
          })
      )
        .filter(Boolean);
    }
  }

  match =
    text.match(
      /(\d{1,2})\s*y\s*(\d{1,2})\s*([a-z]+)(?:\s*(\d{2}|\d{4}))?/
    );

  if (match) {
    const month =
      MONTHS[match[3]];
    const year =
      match[4]
        ? Number(match[4])
        : fallbackDate.year;

    return [
      validDateParts({
        day:
          Number(match[1]),
        month,
        year
      }),
      validDateParts({
        day:
          Number(match[2]),
        month,
        year
      })
    ]
      .filter(Boolean);
  }

  const numericMatches =
    [...text.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/g)]
      .map(item =>
        validDateParts({
          day:
            Number(item[1]),
          month:
            Number(item[2]),
          year:
            item[3]
              ? Number(item[3])
              : fallbackDate.year
        })
      )
      .filter(Boolean);

  if (numericMatches.length) {
    return numericMatches;
  }

  const monthMatches =
    [...text.matchAll(/\b(\d{1,2})\s+([a-z]+)(?:\s+(\d{2}|\d{4}))?\b/g)]
      .map(item =>
        validDateParts({
          day:
            Number(item[1]),
          month:
            MONTHS[item[2]],
          year:
            item[3]
              ? Number(item[3])
              : fallbackDate.year
        })
      )
      .filter(Boolean);

  if (monthMatches.length) {
    return monthMatches;
  }

  const direct =
    parseDateToken(
      text,
      fallbackDate.year
    );

  return direct
    ? [direct]
    : [];
}

function displayDates(dates) {
  return dates
    .map(formatDisplayDate);
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

function getLineValue(block, labels) {
  const labelList =
    Array.isArray(labels)
      ? labels
      : [labels];

  for (const label of labelList) {
    const pattern =
      new RegExp(
        `^\\s*(?:[^\\w\\n]{0,4}\\s*)?${label}\\s*:?\\s*(.+)$`,
        "im"
      );

    const value =
      block.match(pattern)?.[1]?.trim();

    if (value) {
      return value;
    }
  }

  return "";
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
        /^\[(.*?)\] User: (.*?) \| Modulo: (.*?) \| Action: (.*)$/
      );

    if (match) {
      if (current) {
        events.push(current);
      }

      current = {
        timestamp:
          match[1],
        user:
          match[2],
        module:
          match[3],
        action:
          match[4] || ""
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

function getCandidateDateText(action) {
  return getLineValue(
    action,
    [
      "fecha",
      "dia",
      "entrada",
      "ingreso",
      "check\\s*in"
    ]
  )
  ||
  action;
}

function looksLikeReservation(action) {
  const text =
    normalize(action);

  if (
    /cancelad|cancelar|se cancela|vendida|vendido|ocupad|caja chica|turno|pago de evento|renta y habitacion|salida manana|checkout|check out/.test(text)
  ) {
    return false;
  }

  if (
    /reservaci\S*n|reserva|nueva reserva/.test(text)
  ) {
    return true;
  }

  const hasStaySignal =
    /habitacion|habitaciones|hab\b|habs\b|cuarto|cama|king|doble|suite/.test(text);
  const hasPriceSignal =
    /tarifa|\$\s*\d|\b[6789]00\b/.test(text);
  const hasGuestSignal =
    /adulto|menor|nino|persona|personas|px\b|pax|huesped/.test(text);

  const hasDateSignal =
    /\bhoy\b|\bmanana\b|\bfecha\b|\bentrada\b|\bingreso\b|\b\d{1,2}\/\d{1,2}\b|\b\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/.test(text);

  return hasDateSignal
    &&
    hasStaySignal
    &&
    (hasPriceSignal || hasGuestSignal);
}

function getName(action) {
  const labeled =
    getLineValue(
      action,
      [
        "nombre",
        "cliente",
        "huesped",
        "a nombre de"
      ]
    );

  if (labeled) {
    return labeled;
  }

  const reservationLine =
    action.match(/reservaci\S*n\s+para\s*:?\s*(.*)/i)?.[1]
    ||
    action.match(/reserva\s+(?:a\s+)?nombre\s+de\s*:?\s*(.*)/i)?.[1];

  if (reservationLine) {
    return reservationLine
      .split("\n")[0]
      .trim();
  }

  const ignored =
    /^(fecha|dia|entrada|ingreso|check|tel|telefono|cel|hora|llegada|tarifa|paga|pago|habitacion|habitaciones|hab\b|habs\b|cama|adulto|menor|persona|px\b|pax|noche|noches)/i;

  return action
    .split(/\r?\n/)
    .map(line =>
      line.trim()
    )
    .find(line =>
      line
      &&
      !ignored.test(normalize(line))
      &&
      !/^\d+$/.test(line)
    )
    ||
    "Sin nombre";
}

function getTipo(action) {
  const text =
    normalize(action);

  return normalizeRoomType(text);
}

function getTarifa(action) {
  return getLineValue(
    action,
    [
      "tarifa",
      "precio",
      "total"
    ]
  )
  ||
  action.match(/\$\s*[\d,]+(?:\s*por habitaci\S*n)?/i)?.[0]
  ||
  action.match(/\b(?:tarifa|precio)\s*[:\-]?\s*([\d,]+)/i)?.[1]
  ||
  "";
}

function getTelefono(action) {
  return getLineValue(
    action,
    [
      "tel",
      "telefono",
      "cel",
      "celular",
      "whatsapp"
    ]
  )
  ||
  action.match(/(?:\+?52\s*)?(?:\d[\s-]*){10,}/)?.[0]?.trim()
  ||
  "";
}

function getHora(action) {
  const labeled =
    getLineValue(
      action,
      [
        "hora(?:\\s+de\\s+llegada)?",
        "llegada",
        "entrada"
      ]
    );

  const value =
    labeled || action;

  return value.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)\b/i)?.[0]?.trim()
  ||
  value.match(/\b\d{1,2}:\d{2}\b/)?.[0]?.trim()
  ||
  "";
}

function parseReservationEvent(event) {
  if (event.user !== GROUP_ID) {
    return null;
  }

  const action =
    event.action || "";

  if (!looksLikeReservation(action)) {
    return null;
  }

  const logDate =
    parseLogDate(event.timestamp);

  if (!logDate) {
    return null;
  }

  const dates =
    parseReservationDatesFromText(
      getCandidateDateText(action),
      logDate
    );

  if (!dates.length) {
    return null;
  }

  const text =
    normalize(action);

  const parsedHabitaciones =
    parseNumberBeforeLabel(
      text,
      [
        "habitacion",
        "habitaciones",
        "hab",
        "habs",
        "cuarto",
        "cuartos",
        "room",
        "rooms"
      ],
      1
    );

  const habitaciones =
    Math.max(
      parsedHabitaciones > TOTAL_ROOMS
        ? 1
        : parsedHabitaciones,
      1
    );

  const adultos =
    parseNumberBeforeLabel(
      text,
      [
        "adulto",
        "adultos"
      ],
      0
    );

  const personas =
    parseNumberBeforeLabel(
      text,
      [
        "persona",
        "personas",
        "px",
        "pax",
        "huesped",
        "huespedes"
      ],
      0
    );

  const menores =
    parseNumberBeforeLabel(
      text,
      [
        "menor",
        "menores",
        "nino",
        "ninos"
      ],
      0
    );

  const display =
    displayDates(dates);

  return {
    sourceKey:
      `group:${event.user}:${event.timestamp}:${getName(action)}:${display[0]}`,
    source:
      "grupo",
    groupId:
      event.user,
    timestamp:
      event.timestamp,
    nombre:
      getName(action),
    fecha:
      display[0],
    dates:
      display,
    habitaciones,
    adultos:
      adultos || Math.max(personas - menores, 0) || personas,
    ninos:
      menores,
    tipo:
      getTipo(action),
    tarifa:
      getTarifa(action),
    telefono:
      getTelefono(action),
    hora:
      getHora(action),
    raw:
      action
  };
}

function getLogFiles() {
  const configured =
    process.env.GROUP_RESERVATION_LOG_FILE
      ? process.env.GROUP_RESERVATION_LOG_FILE
        .split(path.delimiter)
      : [];

  return [
    ...configured,
    DEFAULT_LOG_FILE,
    FALLBACK_LOG_FILE
  ]
    .map(file =>
      path.resolve(file)
    )
    .filter((file, index, files) =>
      files.indexOf(file) === index
      &&
      fs.existsSync(file)
    );
}

function readLogReservations() {
  return getLogFiles()
    .flatMap(file => {
      const logText =
        fs.readFileSync(
          file,
          "utf8"
        );

      return parseGroupLogEvents(logText)
        .map(parseReservationEvent)
        .filter(Boolean)
        .map(reservation => {
          saveCalendarReservation(reservation);
          return reservation;
        });
    });
}

function normalizeStoredReservation(reservation) {
  if (
    !reservation
    ||
    reservation.status === "cancelada"
  ) {
    return null;
  }

  const dates =
    Array.isArray(reservation.dates)
      ? reservation.dates
      : [reservation.fecha].filter(Boolean);

  if (!dates.length) {
    return null;
  }

  return {
    source:
      "bot",
    folio:
      reservation.folio,
    timestamp:
      reservation.createdAt || "",
    nombre:
      reservation.nombre || "Sin nombre",
    fecha:
      dates[0],
    dates,
    habitaciones:
      reservation.habitaciones || 1,
    adultos:
      reservation.adultos || 0,
    ninos:
      reservation.ninos || 0,
    tipo:
      normalizeRoomType(
        reservation.habitacion || reservation.tipo || ""
      ),
    tarifa:
      "",
    telefono:
      reservation.telefono || "",
    hora:
      reservation.hora || "",
    raw:
      `Folio #${reservation.folio || ""}`
  };
}

function dedupeReservations(reservations) {
  const seen =
    new Set();

  return reservations
    .filter(reservation => {
      const folioKey =
        reservation.folio
          ? `folio:${reservation.folio}`
          : "";

      const basicKey =
        [
          normalize(reservation.nombre),
          reservation.fecha,
          reservation.telefono,
          reservation.habitaciones
        ]
          .join("|");

      const key =
        folioKey || basicKey;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function readGroupReservations() {
  const stored =
    readReservations()
      .map(normalizeStoredReservation)
      .filter(Boolean);

  return dedupeReservations([
    ...readCalendarReservations(),
    ...stored,
    ...readLogReservations()
  ]);
}

function buildGroupReservationCalendar(reservations) {
  const byDate =
    new Map();

  for (const reservation of reservations) {
    const dates =
      Array.isArray(reservation.dates)
        ? reservation.dates
        : [reservation.fecha];

    for (const date of dates) {
      if (!byDate.has(date)) {
        byDate.set(
          date,
          {
            date,
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
        byDate.get(date);

      day.occupied +=
        reservation.habitaciones || 1;

      day.reservations.push(reservation);
    }
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
  parseReservationEvent,
  readGroupReservations,
  buildGroupReservationCalendar
};
