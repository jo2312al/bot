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
  set: 9,
  octubre: 10,
  oct: 10,
  noviembre: 11,
  nov: 11,
  diciembre: 12,
  dic: 12
};

function getMexicoToday() {

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

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day)
  };

}

function normalizeText(value) {

  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bde\b/g, " ")
    .replace(/[.,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

}

function normalizeYear(year, fallbackYear) {

  if (!year) {

    return fallbackYear;

  }

  const parsed =
    Number(year);

  if (parsed < 100) {

    return 2000 + parsed;

  }

  return parsed;

}

function isRealDate({
  day,
  month,
  year
}) {

  const date =
    new Date(
      year,
      month - 1,
      day
    );

  return (
    date.getFullYear() === year
    &&
    date.getMonth() === month - 1
    &&
    date.getDate() === day
  );

}

function compareDateParts(left, right) {

  const leftValue =
    left.year * 10000
    + left.month * 100
    + left.day;

  const rightValue =
    right.year * 10000
    + right.month * 100
    + right.day;

  return leftValue - rightValue;

}

function pad(value) {

  return String(value)
    .padStart(2, "0");

}

function parseReservationDate(value) {

  const today =
    getMexicoToday();

  const raw =
    String(value || "")
      .trim();

  let match =
    raw.match(
      /^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2}|\d{4}))?$/
    );

  let day;
  let month;
  let year;

  if (match) {

    day = Number(match[1]);
    month = Number(match[2]);
    year = normalizeYear(
      match[3],
      today.year
    );

  } else {

    const text =
      normalizeText(raw);

    match =
      text.match(
        /^(\d{1,2}) ([a-z]+)(?: (\d{2}|\d{4}))?$/
      );

    if (!match) {

      match =
        text.match(
          /^([a-z]+) (\d{1,2})(?: (\d{2}|\d{4}))?$/
        );

      if (match) {

        day = Number(match[2]);
        month = MONTHS[match[1]];
        year = normalizeYear(
          match[3],
          today.year
        );

      }

    } else {

      day = Number(match[1]);
      month = MONTHS[match[2]];
      year = normalizeYear(
        match[3],
        today.year
      );

    }

  }

  if (
    !day
    ||
    !month
    ||
    !year
  ) {

    return null;

  }

  const parsed = {
    day,
    month,
    year
  };

  if (
    !isRealDate(parsed)
  ) {

    return null;

  }

  if (
    compareDateParts(parsed, today) < 0
  ) {

    return null;

  }

  return {
    ...parsed,
    display:
      `${pad(day)}/${pad(month)}/${year}`
  };

}

function formatReservationDate(value) {

  const parsed =
    parseReservationDate(value);

  return parsed
    ? parsed.display
    : value;

}

module.exports = {
  getMexicoToday,
  parseReservationDate,
  formatReservationDate
};
