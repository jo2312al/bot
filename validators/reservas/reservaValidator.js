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

  habitacion(value) {

    return (
      value === "1"
      ||
      value === "2"
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
