// flows/reservaFlow.js

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

Formato:
dd/mm

✅ Ejemplo:
25/12`,

    validator: "fecha"

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
