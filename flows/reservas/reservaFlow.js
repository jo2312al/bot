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

function parseRoomType(value) {

  const limpio =
    normalize(value);

  if (
    limpio === "1"
    ||
    limpio.includes("king")
  ) {

    return "King";

  }

  if (
    limpio.includes("suite")
  ) {

    return "Suite";

  }

  return "Doble";

}

module.exports = [

  {

    key: "nombre",

    question: `Paso 1 de 9: Nombre completo

Escribe nombre y apellido de quien quedara registrado.

Ejemplo:
Juan Perez`,

    validator: "nombre"

  },

  {

    key: "adultos",

    question: `Paso 2 de 9: Adultos

Cuantos adultos se hospedaran?

Puedes responder con numero o frase.
Ejemplos:
2
somos 2 adultos

Maximo 4 personas por habitacion, contando ninos.`,

    validator: "personas",

    transform: value =>
      firstNumber(value)

  },

  {

    key: "ninos",

    question: `🧒 Paso 3 de 9: Niños

¿Cuantos niños se hospedaran?

✅ Responde solo con numero.
Ejemplo:
0

ℹ️ Si no hay niños, escribe 0.
El maximo es de 4 personas por habitacion, contando adultos y niños.`,

    validator: "ninos",

    transform: value =>
      firstNumber(value)

  },

  {

    key: "habitacion",

    question: `Paso 4 de 9: Tipo de habitacion

Elige una opcion o escribe el tipo:

1. King
Una cama king.

2. Doble
Dos camas matrimoniales.

3. Suite
Sujeta a disponibilidad.

Ejemplos:
king
doble
mini suite`,

    validator: "habitacion",

    transform: value =>
      parseRoomType(value)

  },

  {

    key: "telefono",

    question: `📞 Paso 5 de 9: Numero celular

Escribe un numero de contacto a 10 digitos.

✅ Ejemplo:
9931234567`,

    validator: "telefono",

    transform: value =>
      String(value)
        .replace(/\D/g, "")

  },

  {

    key: "fecha",

    question: `📅 Paso 6 de 9: Fecha de ingreso

Indica la fecha en la que deseas llegar al hotel.

Puedes escribirla de cualquiera de estas formas:
25/12
25/12/26
25 de diciembre
25 diciembre 2026

ℹ️ Despues te preguntare cuantas noches deseas reservar.`,

    validator: "fecha",

    transform: value =>
      formatReservationDate(value)

  },

  {

    key: "noches",

    question: `🌙 Paso 7 de 9: Noches de hospedaje

¿Cuantas noches deseas reservar?

✅ Responde solo con numero.
Ejemplo:
1`,

    validator: "noches",

    transform: value =>
      firstNumber(value)

  },

  {

    key: "promocion",

    question: `🎟️ Paso 8 de 9: Tarifa promocional

Contamos con tarifa promocional de $650 por noche para:

• PEMEX
• INAPAM
• ADO
• Centenario

La promocion solo sera valida presentando:
• Credencial de PEMEX o INAPAM
• Boleto de ADO o Centenario

ℹ️ Aplica para 1 o 2 personas. A partir de la tercera persona se agregan $100 por persona adicional, con maximo 4 personas por habitacion.

Por favor escribe cual opcion aplica:
pemex
inapam
ado
centenario

Si no cuentas con promocion, escribe:
no`,

    validator: "promocion",

    transform: value =>
      value
        .trim()
        .toLowerCase()
        .replace(/^(ninguna|no tengo)$/, "no")

  },

  {

    key: "hora",

    question: `⏰ Paso 9 de 9: Hora estimada de llegada

Indica aproximadamente a que hora llegaras.

✅ Ejemplos:
10 am
8 pm
9pm

ℹ️ Llegadas antes de la 1:00 PM tienen tarifa mañanera de +$200.`,

    validator: "hora",

    transform: value =>
      normalizarHoraLlegada(value)

  }

];
