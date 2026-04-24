const {
  generarFolio,
  esNumeroValido
} = require("../utils/helpers");

const {
  GROUP_ID
} = require("../config/config");

async function handleReserva({

  input,
  text,
  state,
  send,
  sock,
  from

}) {

  // ==========================
  // INICIAR
  // ==========================

  if (!state.step) {

    state.step =
      "nombre";

    return send(`Aprovecha nuestra tarifa promocional de $700 pesos

✔️ 1 o 2 personas
✔️ Impuestos incluidos
✔️ Habitación doble

*Cama king sujeto a disponibilidad

Para 3 o 4 personas:
💲 $800 total

✍️ Ingresa tu NOMBRE COMPLETO:`);

  }

  // ==========================
  // NOMBRE
  // ==========================

  if (
    state.step ===
    "nombre"
  ) {

    state.data.nombre =
      text;

    state.step =
      "personas";

    return send(
      "Número de personas (1-4):"
    );

  }

  // ==========================
  // PERSONAS
  // ==========================

  if (
    state.step ===
    "personas"
  ) {

    if (
      !esNumeroValido(
        input
      )
    ) {

      return send(
        "⚠️ Número inválido"
      );

    }

    state.data.personas =
      parseInt(input);

    state.step =
      "habitacion";

    return send(
      "Tipo de habitación (Doble o King):"
    );

  }

  // ==========================
  // HABITACIÓN
  // ==========================

  if (
    state.step ===
    "habitacion"
  ) {

    state.data.habitacion =
      text;

    state.step =
      "telefono";

    return send(
      "Número celular:"
    );

  }

  // ==========================
  // TELÉFONO
  // ==========================

  if (
    state.step ===
    "telefono"
  ) {

    state.data.telefono =
      text;

    state.step =
      "fecha";

    return send(
      "Fecha de ingreso:"
    );

  }

  // ==========================
  // FECHA
  // ==========================

  if (
    state.step ===
    "fecha"
  ) {

    state.data.fecha =
      text;

    state.step =
      "hora";

    return send(
      "Hora de llegada:"
    );

  }

  // ==========================
  // HORA
  // ==========================

  if (
    state.step ===
    "hora"
  ) {

    state.data.hora =
      text;

    const precio =

      state.data
        .personas <= 2

        ? 700

        : 800;

    const folio =
      generarFolio();

    // ======================
    // CLIENTE
    // ======================

    await send(`✅ RESERVA CONFIRMADA

👤 ${state.data.nombre}

👥 ${state.data.personas}

🛏️ ${state.data.habitacion}

📅 ${state.data.fecha}

⏰ ${state.data.hora}

📞 ${state.data.telefono}

💰 $${precio}

🔢 #${folio}`);

    // ======================
    // GRUPO
    // ======================

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

🔢 #${folio}`

      }
    );

    // RESET

    state.step = null;
    state.data = {};

  }

}

module.exports = {

  handleReserva

};