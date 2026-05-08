// flows/reservaFlow.js

module.exports = [

  // ==========================================
  // NOMBRE
  // ==========================================

  {

    key: "nombre",

    question: `✍️ Nombre completo

✅ Ejemplo:
Juan Pérez`,

    validator: "nombre"

  },

  // ==========================================
  // ADULTOS
  // ==========================================

  {

    key: "adultos",

    question: `👨 Adultos

👉 Ingresa cantidad de adultos

Máximo 4`,

    validator: "personas",

    transform: value =>
      parseInt(value)

  },

  // ==========================================
  // NIÑOS
  // ==========================================

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

  // ==========================================
  // HABITACIÓN
  // ==========================================

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

  // ==========================================
  // TELÉFONO
  // ==========================================

  {

    key: "telefono",

    question: `📞 Número celular

✅ Ejemplo:
9931234567`,

    validator: "telefono"

  },

  // ==========================================
  // FECHA
  // ==========================================

  {

    key: "fecha",

    question: `📅 Fecha ingreso

Formato:
dd/mm

✅ Ejemplo:
25/12`,

    validator: "fecha"

  },

  // ==========================================
  // HORA
  // ==========================================

  {

    key: "hora",

    question: `⏰ Hora llegada

✅ Ejemplo:

10 am
8 pm`,

    validator: "hora"

  }

];