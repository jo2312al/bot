// flows/reservaFlow.js

const {
  formatReservationDate
} = require("../../utils/dateUtils");

module.exports = [

  {

    key: "nombre",

    question: `✍️ Nombre completo

✅ Ejemplo:
Juan Pérez`,

    validator: "nombre"

  },

  {

    key: "adultos",

    question: `👨 Adultos

👉 Ingresa cantidad de adultos

Máximo 4`,

    validator: "personas",

    transform: value =>
      parseInt(value)

  },

  {

    key: "ninos",

    question: `🧒 Niños

👉 Ingresa cantidad de niños

Si no hay escribe:
0`,

    validator: "ninos",

    transform: value =>
      parseInt(value)

  },

  {

    key: "habitacion",

    question: `🛏️ Tipo de habitación

1️⃣ King
⚠️ sujeto a disponibilidad

2️⃣ Doble
(dos camas matrimoniales)

👉 responde:
1 o 2`,

    validator: "habitacion",

    transform: value =>
      value === "1"
        ? "King"
        : "Doble"

  },

  {

    key: "telefono",

    question: `📞 Número celular

✅ Ejemplo:
9931234567`,

    validator: "telefono"

  },

  {

    key: "fecha",

    question: `📅 Fecha ingreso

Puedes escribirla como:
25/12
25/12/26
25 de diciembre
25 diciembre 2026

Después te preguntaré cuántas noches deseas reservar.`,

    validator: "fecha",

    transform: value =>
      formatReservationDate(value)

  },

  {

    key: "noches",

    question: `🌙 ¿Cuántas noches deseas reservar?

✅ Ejemplo:
1`,

    validator: "noches",

    transform: value =>
      parseInt(value)

  },

  {

    key: "hora",

    question: `⏰ Hora llegada

✅ Ejemplo:

10 am
8 pm`,

    validator: "hora"

  }

];
