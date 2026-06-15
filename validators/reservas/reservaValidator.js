// validators/reservaValidator.js

const {
  parseReservationDate
} = require("../../utils/dateUtils");

function firstNumber(value) {

  return parseInt(
    String(value).match(/\d+/)?.[0],
    10
  );

}

function normalize(value) {

  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

}

function numberBefore(text, pattern) {

  const match =
    text.match(pattern);

  return match
    ? parseInt(match[1], 10)
    : null;

}

const validators = {

  nombre(value) {

    const limpio =
      String(value || "")
        .trim();

    const palabras =
      limpio.split(/\s+/);

    if (
      palabras.length < 2
    ) {

      return false;

    }

    return /^[\p{L}\s.'-]+$/u
      .test(limpio);

  },

  personas(value) {

    const num =
      firstNumber(value);

    return (
      !isNaN(num)
      &&
      num >= 1
      &&
      num <= 4
    );

  },

  ninos(value) {

    const num =
      firstNumber(value);

    return (
      !isNaN(num)
      &&
      num >= 0
      &&
      num <= 4
    );

  },

  huespedes(value) {

    const limpio =
      normalize(value);

    const adultos =
      numberBefore(
        limpio,
        /(\d+)\s*(adulto|adultos|persona|personas|huesped|huespedes)/
      );

    const ninos =
      numberBefore(
        limpio,
        /(\d+)\s*(nino|ninos|menor|menores)/
      );

    const total =
      adultos !== null
      ||
      ninos !== null
        ? (adultos || 0) + (ninos || 0)
        : firstNumber(value);

    return (
      (
        adultos !== null
        ||
        ninos === null
      )
      &&
      !isNaN(total)
      &&
      total >= 1
      &&
      total <= 40
    );

  },

  habitacion(value) {

    const limpio =
      normalize(value);

    return (
      limpio === "1"
      ||
      limpio === "2"
      ||
      limpio.includes("king")
      ||
      limpio.includes("doble")
      ||
      limpio.includes("matrimonial")
      ||
      limpio.includes("suite")
    );

  },

  telefono(value) {

    return /^\d{10}$/
      .test(
        String(value)
          .replace(/\D/g, "")
      );

  },

  fecha(value) {

    return Boolean(
      parseReservationDate(value)
    );

  },

  noches(value) {

    const num =
      firstNumber(value);

    return (
      !isNaN(num)
      &&
      num >= 1
      &&
      num <= 30
    );

  },

  habitaciones(value) {

    const num =
      firstNumber(value);

    return (
      !isNaN(num)
      &&
      num >= 1
      &&
      num <= 10
    );

  },

  promocion(value) {

    const limpio =
      value
        .trim()
        .toLowerCase();

    return [
      "pemex",
      "inapam",
      "ado",
      "centenario",
      "no",
      "ninguna",
      "no tengo"
    ].includes(limpio);

  },

  hora(value) {

    return /^(0?[1-9]|1[0-2])\s?(am|pm)$/i
      .test(value.trim());

  }

};

module.exports =
  validators;
