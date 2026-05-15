const {
  withMenuFooter
} = require(
  "../../utils/menuFooter"
);

// ==========================================
// FLOW
// ==========================================

const flow =
  require("../../flows/reservas/reservaFlow");

// ==========================================
// VALIDATORS
// ==========================================

const validators =
  require("../../validators/reservas/reservaValidator");

// ==========================================
// CONFIG
// ==========================================

const {
  GROUP_ID
} = require("../../config/config");

// ==========================================
// SERVICES
// ==========================================

const {

  calcularPrecio,
  generarFolio

} = require(
  "../../services/reservationService"
);

// ==========================================
// MESSAGES
// ==========================================

const {

  reservaConfirmada,
  reservaGrupo

} = require(
  "../../messages/reservas/reservaMessages"
);

// ==========================================
// HANDLER
// ==========================================

async function handleReserva({

  input,
  text,
  state,
  send,
  sock

}) {

  // ======================================
  // INICIO
  // ======================================

  if (
    state.step === null
  ) {

    state.step = 0;

    state.history = [];

    return send(

      withMenuFooter(`🏨 TARIFAS PROMOCIONALES DE RESERVACION

💰 1-2 adultos → $700

👥 3-4 adultos → $800

🧒 Niños GRATIS

🌞 Antes de 1 PM:
+$200 tarifa mañanera

Todos nuestros servicios son facturables

${flow[0].question}`)

    );

  }

  // ======================================
  // STEP ACTUAL
  // ======================================

  const currentStep =
    flow[state.step];

  // ======================================
  // VALIDATOR
  // ======================================

  const validator =
    validators[
      currentStep.validator
    ];

  // ======================================
  // VALIDAR
  // ======================================

  if (
    !validator(input)
  ) {

    return send(

      withMenuFooter(`⚠️ Dato inválido

${currentStep.question}`)

    );

  }

  // ======================================
  // GUARDAR
  // ======================================

  state.data[
    currentStep.key
  ] =

    currentStep.transform

      ? currentStep
          .transform(input)

      : text;

  // ======================================
  // LIMITAR HISTORIAL
  // ======================================

  if (
    state.history.length > 20
  ) {

    state.history.shift();

  }

  // ======================================
  // GUARDAR HISTORIAL
  // ======================================

  state.history.push({

    step: state.step,

    data: {
      ...state.data
    }

  });

  // ======================================
  // SIGUIENTE STEP
  // ======================================

  state.step++;

  // ======================================
  // TERMINÓ
  // ======================================

  if (
    state.step >=
    flow.length
  ) {

    // ==================================
    // PRECIO
    // ==================================

    const {

      precio,
      mensajeTarifa

    } = calcularPrecio({

      adultos:
        state.data.adultos,

      ninos:
        state.data.ninos,

      horaTexto:
        state.data.hora

    });

    // ==================================
    // FOLIO
    // ==================================

    const folio =
      generarFolio();

    // ==================================
    // CLIENTE
    // ==================================

    await send(

      reservaConfirmada({

        data:
          state.data,

        precio,

        mensajeTarifa,

        folio

      })

    );

    // ==================================
    // GRUPO
    // ==================================

    await sock.sendMessage(
      GROUP_ID,
      {

        text:

          reservaGrupo({

            data:
              state.data,

            precio,

            mensajeTarifa,

            folio

          })

      }
    );

    // ==================================
    // RESET
    // ==================================

    state.module = null;

    state.step = null;

    state.data = {};

    state.history = [];

    // ==================================
    // FINAL
    // ==================================

    return send(

      withMenuFooter(`🤝 ¿Necesitas algo más?

👉 escribe:
menu`)

    );

  }

  // ======================================
  // SIGUIENTE PREGUNTA
  // ======================================

  return send(

    withMenuFooter(

      flow[
        state.step
      ].question

    )

  );

}

module.exports = {

  handleReserva

};