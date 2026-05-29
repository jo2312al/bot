// flows/reservaFlow.js

const {
  formatReservationDate
} = require("../../utils/dateUtils");

const {
  normalizarHoraLlegada
} = require("../../services/reservationService");

module.exports = [

  {

    key: "nombre",

    question: `✍️ Nombre completo

✅ Ejemplo:
Juan Perez`,

    validator: "nombre"

  },

  {

    key: "adultos",

    question: `🧑 Adultos

👉 Ingresa cantidad de adultos

Maximo 4 personas por habitacion`,

    validator: "personas",

    transform: value =>
      parseInt(value)

  },

  {

    key: "ninos",

    question: `🧒 Niños

👉 Ingresa cantidad de niños

Recuerda que el maximo es de 4 personas por habitacion, contando adultos y niños.

Si no hay escribe:
0`,

    validator: "ninos",

    transform: value =>
      parseInt(value)

  },

  {

    key: "habitacion",

    question: `🛏️ Tipo de habitacion

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

    question: `📞 Numero celular

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

Despues te preguntare cuantas noches deseas reservar.`,

    validator: "fecha",

    transform: value =>
      formatReservationDate(value)

  },

  {

    key: "noches",

    question: `🌙 ¿Cuantas noches deseas reservar?

✅ Ejemplo:
1`,

    validator: "noches",

    transform: value =>
      parseInt(value)

  },

  {

    key: "promocion",

    question: `🎟️ Tarifa promocional

Contamos con tarifa promocional de $650 por noche para:

• PEMEX
• INAPAM
• ADO
• Centenario

Esta tarifa solo sera valida presentando la credencial correspondiente de PEMEX o INAPAM, o bien el boleto de ADO o Centenario.

Aplica para 1 o 2 personas. A partir de la tercera persona se agregan $100 por persona adicional, con maximo 4 personas por habitacion.

Por favor indica cual opcion aplicaria para tu reservacion.

Si no cuentas con alguna de estas opciones, escribe:
no`,

    validator: "promocion",

    transform: value =>
      value
        .trim()
        .toLowerCase()

  },

  {

    key: "hora",

    question: `⏰ Hora llegada

✅ Ejemplo:

10 am
8 pm
9pm`,

    validator: "hora",

    transform: value =>
      normalizarHoraLlegada(value)

  }

];
