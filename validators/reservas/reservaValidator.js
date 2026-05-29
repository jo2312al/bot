// validators/reservaValidator.js

const {
  parseReservationDate
} = require("../../utils/dateUtils");

const validators = {

  nombre(value) {

    const limpio =
      value.trim();

    const palabras =
      limpio.split(/\s+/);

    if (
      palabras.length < 2
    ) {

      return false;

    }

    return /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/
      .test(limpio);

  },

  personas(value) {

    const num =
      parseInt(value);

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
      parseInt(value);

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
      .test(value.trim());

  },

  fecha(value) {

    return Boolean(
      parseReservationDate(value)
    );

  },

  noches(value) {

    const num =
      parseInt(value);

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
      "no"
    ].includes(limpio);

  },

  hora(value) {

    return /^(0?[1-9]|1[0-2])\s?(am|pm)$/i
      .test(value.trim());

  }

};

module.exports =
  validators;
