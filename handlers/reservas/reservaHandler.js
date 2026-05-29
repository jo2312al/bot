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

const fs =
  require("fs");

const path =
  require("path");

const {
  calcularPrecio,
  generarFolio
} = require(
  "../../services/reservationService"
);

const {
  registerPendingReservation
} = require(
  "../../services/paymentReservationService"
);

const {
  reservaConfirmada,
  reservaGrupo
} = require(
  "../../messages/reservas/reservaMessages"
);

function getTransferImagePath() {
  const mediaDir =
    path.join(
      __dirname,
      "../../media/imagenes/transferencia"
    );

  const extensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp"
  ];

  return extensions
    .map(extension =>
      path.join(
        mediaDir,
        `transferencia${extension}`
      )
    )
    .find(filePath =>
      fs.existsSync(filePath)
    );
}

async function handleReserva({

  input,
  text,
  state,
  send,
  sock,
  from

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

  const transformedValue =
    currentStep.transform
      ? currentStep
          .transform(input)
      : text;

  if (
    currentStep.key === "ninos"
    &&
    state.data.adultos + transformedValue > 4
  ) {

    return send(

      withMenuFooter(`⚠️ El maximo permitido es de 4 personas por habitacion, contando adultos y niños.

Adultos registrados: ${state.data.adultos}

Por favor ingresa una cantidad de niños que no exceda ese limite.`)

    );

  }

  state.data[
    currentStep.key
  ] =
    transformedValue;

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
        state.data.hora,

      noches:
        state.data.noches,

      servicioEspecial:
        state.data.servicioEspecial,

      promocion:
        state.data.promocion

    });

    const folio =
      generarFolio();

    const requiereAnticipo =
      state.data.servicioEspecial === "Habitacion decorada";

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

    if (
      requiereAnticipo
    ) {

      registerPendingReservation({

        from,

        sock,

        folio

      });

    }

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

    await send(

      withMenuFooter(mensajeCliente)

    );

    if (
      !requiereAnticipo
    ) {

      return;

    }

    const transferImage =
      getTransferImagePath();

    if (
      transferImage
    ) {

      return sock.sendMessage(
        from,
        {
          image: {
            url: transferImage
          },
          caption: "Datos de transferencia para tu anticipo"
        }
      );

    }

    return send(

      "Por el momento no encuentro la imagen de datos de transferencia. Favor de solicitarla al 9932054701."

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
