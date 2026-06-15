// flows/reservaFlow.js

const {
  formatReservationDate
} = require("../../utils/dateUtils");

const {
  normalizarHoraLlegada
} = require("../../services/reservationService");

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

function parseGuests(value) {

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

  if (
    adultos !== null
    ||
    ninos !== null
  ) {

    return {
      adultos:
        adultos !== null
          ? adultos
          : 0,
      ninos:
        ninos !== null
          ? ninos
          : 0
    };

  }

  return {
    adultos:
      firstNumber(value),
    ninos: 0
  };

}

function parseRoomType(value) {

  const limpio =
    normalize(value);

  if (
    limpio === "1"
  ) {

    return "King";

  }

  if (
    limpio === "2"
    ||
    (
      limpio.includes("suite")
      &&
      limpio.includes("king")
    )
  ) {

    return "Suite King";

  }

  if (
    limpio === "3"
    ||
    limpio.includes("doble suite")
    ||
    limpio.includes("suite doble")
    ||
    limpio.includes("suite")
  ) {

    return "Doble Suite";

  }

  if (
    limpio === "4"
    ||
    limpio.includes("doble")
    ||
    limpio.includes("matrimonial")
  ) {

    return "Doble";

  }

  if (
    limpio.includes("king")
  ) {

    return "King";

  }

  return "Doble";

}

module.exports = [

  {

    key: "fecha",

    question: `📅 Paso 1 de 7: Fecha de ingreso

Ejemplos:
25/12
25 de diciembre`,

    validator: "fecha",

    transform: value =>
      formatReservationDate(value)

  },

  {

    key: "noches",

    question: `🌙 Paso 2 de 7: Numero de noches

Ejemplos:
1
2 noches`,

    validator: "noches",

    transform: value =>
      firstNumber(value)

  },

  {

    key: "habitaciones",

    question: `🏨 Paso 3 de 7: Numero de habitaciones

Ejemplos:
1
2 habitaciones`,

    validator: "habitaciones",

    transform: value =>
      firstNumber(value)

  },

  {

    key: "huespedes",

    question: `👥 Paso 4 de 7: Numero de huespedes

Ejemplos:
2 adultos
2 adultos y 1 nino

ℹ️ Maximo 4 personas por habitacion.`,

    validator: "huespedes",

    transform: value =>
      parseGuests(value)

  },

  {

    key: "habitacion",

    question: `🛏️ Paso 5 de 7: Tipo de habitacion

1️⃣ King
2️⃣ Doble

Escriba 1, 2, king o doble.`,

    question: `Paso 5 de 7: Tipo de habitacion

1 King
2 Suite King
3 Doble Suite
4 Doble

Escriba el numero o tipo de habitacion.`,

    validator: "habitacion",

    transform: value =>
      parseRoomType(value)

  },

  {

    key: "telefono",

    question: `📞 Paso 6 de 7: Numero de contacto

Ingrese un telefono a 10 digitos.

Ejemplo:
9931234567`,

    validator: "telefono",

    transform: value =>
      String(value)
        .replace(/\D/g, "")

  },

  {

    key: "hora",

    question: `⏰ Paso 7 de 7: Hora estimada de llegada

Ejemplos:
4 pm
10 am

ℹ️ Llegadas antes de la 1:00 PM generan tarifa mañanera.`,

    validator: "hora",

    transform: value =>
      normalizarHoraLlegada(value)

  }

];
