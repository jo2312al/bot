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
  texto(value) {
    return value.trim().length >= 3;
  },
  fecha(value) {
    return Boolean(
      parseReservationDate(value)
    );
  },
  numero(value) {
    const num = firstNumber(value);
    return !isNaN(num) && num > 0 && num <= 50;
  },
  telefono(value) {
    return /^\d{10}$/.test(
      String(value)
        .replace(/\D/g, "")
    );
  }
};

module.exports = validators;
