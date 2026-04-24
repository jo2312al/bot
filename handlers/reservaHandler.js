const {
  generarFolio,
  esNumeroValido
} = require("../utils/helpers");

const {
  GROUP_ID
} = require("../config/config");

// ==========================================
// VALIDAR FECHA
// ==========================================

function validarFecha(fecha) {

  const regex =
    /^\d{2}\/\d{2}\/\d{4}$/;

  return regex.test(fecha);

}

// ==========================================
// VALIDAR HORA
// ==========================================

function validarHora(hora) {

  const regex =
    /^(0?[1-9]|1[0-2])\s?(am|pm)$/i;

  return regex.test(hora);

}

async function handleReserva({

  input,
  text,
  state,
  send,
  sock,
  from

}) {

  // ==========================================
  // INICIO
  // ==========================================

  if (!state.step) {

    state.step =
      "nombre";

    return send(`🏨 RESERVAS

Aprovecha nuestra tarifa promocional:

💰 $700 pesos
✔️ 1 o 2 personas
✔️ Impuestos incluidos

👥 Para 3 o 4 personas:
💰 $800 total

🌞 Antes de la 1 PM
se agregan $200
por tarifa mañanera

🛏️ HABITACIONES

1️⃣ King
⚠️ Sujeto a disponibilidad

2️⃣ Doble

✍️ Escribe tu NOMBRE COMPLETO:`);

  }

  // ==========================================
  // NOMBRE
  // ==========================================

  if (
    state.step ===
    "nombre"
  ) {

    state.data.nombre =
      text;

    state.step =
      "personas";

    return send(`👥 Número de personas

👉 Ingresa un número del 1 al 4`);

  }

  // ==========================================
  // PERSONAS
  // ==========================================

  if (
    state.step ===
    "personas"
  ) {

    if (
      !esNumeroValido(
        input
      )
    ) {

      return send(`⚠️ Número inválido

👉 Solo se permite de 1 a 4 personas`);

    }

    state.data.personas =
      parseInt(input);

    state.step =
      "habitacion";

    return send(`🛏️ Tipo de habitación

1️⃣ King
⚠️ Sujeto a disponibilidad

2️⃣ Doble

👉 Responde solo con:
1 o 2`);

  }

  // ==========================================
  // HABITACIÓN
  // ==========================================

  if (
    state.step ===
    "habitacion"
  ) {

    if (
      input !== "1"
      &&
      input !== "2"
    ) {

      return send(`⚠️ Opción inválida

👉 Responde:

1️⃣ King
2️⃣ Doble`);

    }

    state.data.habitacion =

      input === "1"

        ? "King"

        : "Doble";

    state.step =
      "telefono";

    return send(`📞 Número celular

👉 Ejemplo:

9931234567`);

  }

  // ==========================================
  // TELÉFONO
  // ==========================================

  if (
    state.step ===
    "telefono"
  ) {

    state.data.telefono =
      text;

    state.step =
      "fecha";

    return send(`📅 Fecha de ingreso

👉 Formato obligatorio:

dd/mm/yyyy

✅ Ejemplo:
25/12/2026`);

  }

  // ==========================================
  // FECHA
  // ==========================================

  if (
    state.step ===
    "fecha"
  ) {

    if (
      !validarFecha(text)
    ) {

      return send(`⚠️ Fecha inválida

👉 Usa este formato:

dd/mm/yyyy

✅ Ejemplo:
25/12/2026`);

    }

    state.data.fecha =
      text;

    state.step =
      "hora";

    return send(`⏰ Hora de llegada

👉 Formato:

10 am
8 pm

✅ Incluye am o pm`);

  }

  // ==========================================
  // HORA
  // ==========================================

  if (
    state.step ===
    "hora"
  ) {

    if (
      !validarHora(input)
    ) {

      return send(`⚠️ Hora inválida

👉 Usa formato:

10 am
8 pm`);

    }

    state.data.hora =
      text;

    // ======================================
    // CONVERTIR HORA
    // ======================================

    const horaTexto =
      state.data.hora
        .toLowerCase()
        .trim();

    const partes =
      horaTexto.split(" ");

    let hora =
      parseInt(partes[0]);

    const periodo =
      partes[1];

    // convertir PM

    if (
      periodo === "pm"
      &&
      hora !== 12
    ) {

      hora += 12;

    }

    // convertir 12 AM

    if (
      periodo === "am"
      &&
      hora === 12
    ) {

      hora = 0;

    }

    // ======================================
    // PRECIO BASE
    // ======================================

    let precio =

      state.data
        .personas <= 2

        ? 700

        : 800;

    let mensajeTarifa =
      "";

    // ======================================
    // TARIFA MAÑANERA
    // ======================================

    if (hora < 13) {

      precio += 200;

      mensajeTarifa =
        "\n🌞 Incluye tarifa mañanera (+$200)";

    }

    // ======================================
    // FOLIO
    // ======================================

    const folio =
      generarFolio();

    // ======================================
    // CLIENTE
    // ======================================

    await send(`✅ RESERVA CONFIRMADA

👤 ${state.data.nombre}

👥 ${state.data.personas} personas

🛏️ ${state.data.habitacion}

📅 ${state.data.fecha}

⏰ ${state.data.hora}

📞 ${state.data.telefono}

💰 Total: $${precio}
${mensajeTarifa}

🔢 Folio: #${folio}`);

    // ======================================
    // GRUPO
    // ======================================

    await sock.sendMessage(
      GROUP_ID,
      {

        text: `🏨 NUEVA RESERVA

👤 ${state.data.nombre}

👥 ${state.data.personas}

🛏️ ${state.data.habitacion}

📅 ${state.data.fecha}

⏰ ${state.data.hora}

📞 ${state.data.telefono}

💰 $${precio}
${mensajeTarifa}

🔢 #${folio}`

      }
    );

    // ======================================
    // AYUDA
    // ======================================

    await send(`🤝 ¿Necesitas ayuda adicional?

Puedes escribir:

👉 menu

para volver al menú principal.

⏳ La conversación se cerrará automáticamente en 5 minutos.`);

    // ======================================
    // CERRAR
    // ======================================

    setTimeout(() => {

      state.step = null;
      state.data = {};

    }, 5 * 60 * 1000);

  }

}

module.exports = {

  handleReserva

};