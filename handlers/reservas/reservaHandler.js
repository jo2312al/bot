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
  checkRoomAvailability,
  saveRoomReservation
} = require(
  "../../services/roomInventoryService"
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

function resetReservaState(state) {
  state.module = null;
  state.step = null;
  state.data = {};
  state.history = [];
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

      withMenuFooter(`🏨 Reservacion de habitacion

Te ayudare paso a paso. Solo responde lo que se pide en cada mensaje.

💰 Tarifas base por noche:
• 1 a 2 adultos: $700
• 3 a 4 adultos: $800

🎟️ Promocion: $650 por noche para PEMEX, INAPAM, ADO o Centenario.
Aplica para 1 o 2 personas. Persona adicional: +$100 por noche.

🧒 Niños incluidos dentro del maximo de 4 personas por habitacion.

🌞 Llegadas antes de la 1:00 PM:
+$200 tarifa mañanera

✅ Todos nuestros servicios son facturables.

Si deseas cancelar o volver al menu, escribe:
menu

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

      withMenuFooter(`⚠️ No pude validar ese dato.

Revisa el formato y responde nuevamente:

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

Por favor ingresa una cantidad de niños que no exceda ese limite.

Ejemplo: si registraste 3 adultos, puedes agregar maximo 1 niño.`)

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

    const availability =
      checkRoomAvailability({

        habitacion:
          state.data.habitacion,

        fecha:
          state.data.fecha,

        noches:
          state.data.noches

      });

    if (
      !availability.available
    ) {

      const habitacionSolicitada =
        state.data.habitacion;

      resetReservaState(state);

      return send(

        withMenuFooter(`⚠️ Por el momento no tenemos disponibilidad de habitacion ${availability.limit ? habitacionSolicitada : ""} para la fecha solicitada.

Fecha(s) sin disponibilidad:
${availability.fullDates.join("\n")}

Puedes intentar con otra fecha u otro tipo de habitacion.

👉 escribe:
menu`)

      );

    }

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

    saveRoomReservation({

      folio,

      data:
        state.data

    });

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

🤝 ¿Necesitas algo mas?

👉 escribe:
menu`;

    resetReservaState(state);

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
