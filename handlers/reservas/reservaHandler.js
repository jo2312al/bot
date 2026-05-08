const flow =
  require("../../flows/reservas/reservaFlow");

const validators =
  require("../../validators/reservaValidator");

const {
  GROUP_ID
} = require("../../config/config");

const {

  calcularPrecio,
  generarFolio

} = require(
  "../../services/reservationService"
);

const {

  reservaConfirmada,
  reservaGrupo

} = require(
  "../../messages/reservas/reservaMessages"
);

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

    return send(`🏨 RESERVAS
      precios promocionales

💰 1-2 personas → $700

👥 3-4 personas → $800 

🌞 Antes de 1 PM:
+$200 tarifa mañanera

Todos nuestros servicios son facturables

${flow[0].question}`);

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

    return send(`⚠️ Dato inválido

${currentStep.question}`);

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

    state.step = null;

    state.data = {};

    // ==================================
    // FINAL
    // ==================================

    return send(`🤝 ¿Necesitas algo más?

👉 escribe menu`);

  }

  // ======================================
  // SIGUIENTE PREGUNTA
  // ======================================

  return send(

    flow[
      state.step
    ].question

  );

}

module.exports = {

  handleReserva

};