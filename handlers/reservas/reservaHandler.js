const {
  withMenuFooter
} = require(
  "../../utils/menuFooter"
);

const flow =
  require("../../flows/reservas/reservaFlow");

const validators =
  require("../../validators/reservas/reservaValidator");

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

  if (
    state.step === null
  ) {

    state.step = 0;

    state.history = [];

    return send(

      withMenuFooter(`🏨 TARIFAS PROMOCIONALES DE RESERVACIÓN

💰 1-2 adultos → $700

👥 3-4 adultos → $800

🧒 Niños GRATIS

🌞 Antes de 1 PM:
+$200 tarifa mañanera

Todos nuestros servicios son facturables

${flow[0].question}`)

    );

  }

  const currentStep =
    flow[state.step];

  const validator =
    validators[
      currentStep.validator
    ];

  if (
    !validator(input)
  ) {

    return send(

      withMenuFooter(`⚠️ Dato inválido

${currentStep.question}`)

    );

  }

  state.data[
    currentStep.key
  ] =
    currentStep.transform
      ? currentStep
          .transform(input)
      : text;

  if (
    state.history.length > 20
  ) {

    state.history.shift();

  }

  state.history.push({

    step: state.step,

    data: {
      ...state.data
    }

  });

  state.step++;

  if (
    state.step >= flow.length
  ) {

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

    const folio =
      generarFolio();

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

    const mensajeCliente =
      `${reservaConfirmada({

        data:
          state.data,

        precio,

        mensajeTarifa,

        folio

      })}

🤝 ¿Necesitas algo más?

👉 escribe:
menu`;

    state.module = null;
    state.step = null;
    state.data = {};
    state.history = [];

    return send(

      withMenuFooter(mensajeCliente)

    );

  }

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
