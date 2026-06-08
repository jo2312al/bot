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

function saveHistory(state) {
  if (
    state.history.length > 20
  ) {

    state.history.shift();

  }

  state.history.push({

    step:
      state.step,

    data: {
      ...state.data
    }

  });
}

function getPriceDetails(data) {
  return calcularPrecio({

    adultos:
      data.adultos,

    ninos:
      data.ninos,

    horaTexto:
      data.hora,

    noches:
      data.noches,

    habitaciones:
      data.habitaciones,

    servicioEspecial:
      data.servicioEspecial,

    promocion:
      data.promocion || "no"

  });
}

function buildSummary({
  data,
  precio,
  mensajeTarifa
}) {
  const tarifaDetalle =
    mensajeTarifa
      ? `\n${mensajeTarifa}`
      : "";

  return `📋 Resumen de solicitud

📅 Fecha: ${data.fecha}
🌙 Noches: ${data.noches}
🏨 Habitaciones: ${data.habitaciones}
👥 Huespedes: ${data.adultos} adulto(s), ${data.ninos} niño(s)
🛏️ Habitacion: ${data.habitacion}
📞 Telefono: ${data.telefono}
⏰ Llegada: ${data.hora}
💰 Tarifa estimada: $${Number(precio || 0).toLocaleString("es-MX")}
${tarifaDetalle}

Para registrar la solicitud, responda:
1️⃣ Confirmar
2️⃣ Modificar
3️⃣ Cancelar`;
}

function isConfirm(input) {
  return [
    "1",
    "si",
    "sí",
    "confirmar",
    "confirmo",
    "reservar"
  ].includes(input);
}

function isModify(input) {
  return [
    "2",
    "modificar",
    "cambiar"
  ].includes(input);
}

function isCancel(input) {
  return [
    "3",
    "cancelar",
    "no"
  ].includes(input);
}

async function sendSummary({
  state,
  send
}) {
  const availability =
    checkRoomAvailability({

      habitacion:
        state.data.habitacion,

      fecha:
        state.data.fecha,

      noches:
        state.data.noches,

      habitaciones:
        state.data.habitaciones

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

Puede intentar con otra fecha u otro tipo de habitacion.

👉 Escriba:
menu`)

    );

  }

  const {
    precio,
    mensajeTarifa
  } =
    getPriceDetails(
      state.data
    );

  state.data.precio =
    precio;

  state.data.mensajeTarifa =
    mensajeTarifa;

  state.step =
    "confirmar";

  return send(

    withMenuFooter(
      buildSummary({
        data:
          state.data,
        precio,
        mensajeTarifa
      })
    )

  );
}

async function finalizeReservation({
  state,
  send,
  sock,
  from
}) {
  const folio =
    generarFolio();

  const {
    precio,
    mensajeTarifa
  } =
    getPriceDetails(
      state.data
    );

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
    reservaConfirmada({

      data:
        state.data,

      precio,

      mensajeTarifa,

      folio

    });

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
          url:
            transferImage
        },
        caption:
          "Datos de transferencia para su anticipo"
      }
    );

  }

  return send(

    "Por el momento no encuentro la imagen de datos de transferencia. Favor de solicitarla al 9934684830."

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

    state.step =
      0;

    state.history =
      [];

    state.data =
      {};

    return send(

      withMenuFooter(`🏨 Reservacion de habitacion

Para revisar tarifa y registrar la solicitud, favor de responder los siguientes datos.

${flow[0].question}`)

    );

  }

  if (
    state.step === "confirmar"
  ) {

    if (
      input === ""
    ) {

      return sendSummary({
        state,
        send
      });

    }

    if (
      isConfirm(input)
    ) {

      saveHistory(state);

      state.step =
        "nombre";

      return send(

        withMenuFooter(`📝 Nombre completo de la persona que quedara registrada

Ejemplo:
Juan Perez`)

      );

    }

    if (
      isModify(input)
    ) {

      state.step =
        0;

      state.data =
        {};

      state.history =
        [];

      return send(

        withMenuFooter(flow[0].question)

      );

    }

    if (
      isCancel(input)
    ) {

      resetReservaState(state);

      return send(

        "Solicitud cancelada.\n\nPara ver opciones, escriba:\nmenu"

      );

    }

    return send(

      withMenuFooter(`Seleccione una opcion:

1️⃣ Confirmar
2️⃣ Modificar
3️⃣ Cancelar`)

    );

  }

  if (
    state.step === "nombre"
  ) {

    if (
      input === ""
    ) {

      return send(

        withMenuFooter(`📝 Nombre completo de la persona que quedara registrada

Ejemplo:
Juan Perez`)

      );

    }

    if (
      !validators.nombre(input)
    ) {

      return send(

        withMenuFooter(`⚠️ No pude validar el nombre.

Escriba nombre y apellido.

Ejemplo:
Juan Perez`)

      );

    }

    state.data.nombre =
      text;

    return finalizeReservation({
      state,
      send,
      sock,
      from
    });

  }

  const currentStep =
    flow[state.step];

  if (
    input === ""
  ) {

    return send(

      withMenuFooter(
        currentStep.question
      )

    );

  }

  const validator =
    validators[
      currentStep.validator
    ];

  if (
    !validator(input)
  ) {

    return send(

      withMenuFooter(`⚠️ No pude validar ese dato.

Revise el formato y responda nuevamente:

${currentStep.question}`)

    );

  }

  const transformedValue =
    currentStep.transform
      ? currentStep
          .transform(input)
      : text;

  if (
    currentStep.key === "habitacion"
    &&
    transformedValue === "Suite"
  ) {

    return send(

      withMenuFooter(`⚠️ No hay inventario de suites disponible para reservar por este bot.

Opciones disponibles:
1️⃣ King
2️⃣ Doble`)

    );

  }

  saveHistory(state);

  if (
    currentStep.key === "huespedes"
  ) {

    const totalHuespedes =
      transformedValue.adultos
      +
      transformedValue.ninos;

    const capacidad =
      (state.data.habitaciones || 1) * 4;

    if (
      totalHuespedes > capacidad
    ) {

      return send(

        withMenuFooter(`⚠️ La capacidad maxima es de 4 personas por habitacion.

Habitaciones solicitadas: ${state.data.habitaciones || 1}
Capacidad maxima: ${capacidad} persona(s)

Revise el numero de huespedes o escriba volver para cambiar la cantidad de habitaciones.`)

      );

    }

    state.data.adultos =
      transformedValue.adultos;

    state.data.ninos =
      transformedValue.ninos;

  } else {

    state.data[
      currentStep.key
    ] =
      transformedValue;

  }

  state.step++;

  if (
    state.step >= flow.length
  ) {

    return sendSummary({
      state,
      send
    });

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
