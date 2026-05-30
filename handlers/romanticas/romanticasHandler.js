const fs = require("fs");
const path = require("path");

const { withMenuFooter } = require("../../utils/menuFooter");
const {
  formatReservationDate,
  getMexicoToday,
  parseReservationDate
} = require("../../utils/dateUtils");
const { GROUP_ID } = require("../../config/config");
const {
  calcularPrecio,
  generarFolio,
  normalizarHoraLlegada
} = require("../../services/reservationService");
const {
  registerPendingReservation
} = require("../../services/paymentReservationService");
const {
  checkRoomAvailability,
  saveRoomReservation
} = require("../../services/roomInventoryService");
const reservaValidators = require("../../validators/reservas/reservaValidator");
const {
  reservaConfirmada,
  reservaGrupo
} = require("../../messages/reservas/reservaMessages");
const {
  ROMANTIC_MENU,
  ROMANTIC_DINNER_INFO,
  DECORATED_ROOM_INFO,
  ROMANTIC_RESERVE_PROMPT
} = require("../../constants/romantic");

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

const DINNER_OPTIONS = {
  "1": {
    name: "Filete mignon",
    price: 1300
  },
  "2": {
    name: "Fettuccine con camarones al chipotle",
    price: 1200
  },
  "3": {
    name: "Rib eye premium",
    price: 1400
  }
};

function imageDir(folder) {
  return path.join(__dirname, "../../media/imagenes", folder);
}

function getImageFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory)
    .filter(file => IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase()))
    .map(file => path.join(directory, file));
}

function getTransferImagePath() {
  return getImageFiles(imageDir("transferencia"))[0];
}

async function sendImages({ sock, from, directory, caption }) {
  const files = getImageFiles(directory);

  for (const filePath of files) {
    await sock.sendMessage(from, {
      image: {
        url: filePath
      },
      caption
    });
  }

  return files.length;
}

function resetState(state) {
  state.module = null;
  state.step = null;
  state.data = {};
  state.history = [];
}

function isDecoratedRoomDate(value) {
  const parsed = parseReservationDate(value);

  if (!parsed) return false;

  const today = getMexicoToday();
  const todayDate = new Date(today.year, today.month - 1, today.day);
  const requestedDate = new Date(parsed.year, parsed.month - 1, parsed.day);
  const diffDays = Math.floor((requestedDate - todayDate) / (24 * 60 * 60 * 1000));

  return diffDays >= 2;
}

async function sendTransferImage({ sock, from }) {
  const transferImage = getTransferImagePath();

  if (!transferImage) {
    return sock.sendMessage(from, {
      text: "Por el momento no encuentro la imagen de datos de transferencia. Favor de solicitarla al 9932054701."
    });
  }

  return sock.sendMessage(from, {
    image: {
      url: transferImage
    },
    caption: "Datos de transferencia para tu anticipo"
  });
}

async function finishDinnerReservation({
  state,
  send,
  sock,
  from
}) {
  const option = DINNER_OPTIONS[state.data.platillo];
  const folio = generarFolio();

  await sock.sendMessage(GROUP_ID, {
    text: `🍽️ NUEVA RESERVA DE CENA ROMANTICA PENDIENTE DE ANTICIPO

👤 Nombre: ${state.data.nombre}
📞 Telefono: ${state.data.telefono}
📅 Fecha: ${state.data.fecha}
⏰ Hora: ${state.data.hora}
🍽️ Cena: ${option.name}
💰 Total: $${option.price}

🔢 Folio: #${folio}
WhatsApp: ${from}`
  });

  registerPendingReservation({
    from,
    sock,
    folio
  });

  await send(withMenuFooter(`✅ RESERVA DE CENA ROMANTICA RECIBIDA

👤 Nombre: ${state.data.nombre}
📞 Telefono: ${state.data.telefono}
📅 Fecha: ${state.data.fecha}
⏰ Hora: ${state.data.hora}
🍽️ Cena: ${option.name}
💰 Total: $${option.price}
🔢 Folio: #${folio}

Para garantizar tu reservacion se requiere 50% de anticipo por transferencia.
Te enviaremos los datos de transferencia en imagen.

⚠️ Importante: si no recibimos el anticipo o comprobante dentro de 24 horas, la reservacion se cancela automaticamente.`));

  resetState(state);

  return sendTransferImage({
    sock,
    from
  });
}

async function finishDecoratedReservation({
  state,
  send,
  sock,
  from
}) {
  const availability = checkRoomAvailability({
    habitacion: state.data.habitacion,
    fecha: state.data.fecha,
    noches: state.data.noches
  });

  if (!availability.available) {
    resetState(state);

    return send(withMenuFooter(`⚠️ Por el momento no tenemos disponibilidad de habitacion King decorada para la fecha solicitada.

Fecha(s) sin disponibilidad:
${availability.fullDates.join("\n")}

Puedes intentar con otra fecha.

👉 escribe:
menu`));
  }

  const {
    precio,
    mensajeTarifa
  } = calcularPrecio({
    adultos: state.data.adultos,
    ninos: state.data.ninos,
    horaTexto: state.data.hora,
    noches: state.data.noches,
    servicioEspecial: state.data.servicioEspecial,
    promocion: state.data.promocion
  });

  const folio = generarFolio();

  saveRoomReservation({
    folio,
    data: state.data
  });

  await sock.sendMessage(GROUP_ID, {
    text: reservaGrupo({
      data: state.data,
      precio,
      mensajeTarifa,
      folio
    })
  });

  registerPendingReservation({
    from,
    sock,
    folio
  });

  await send(withMenuFooter(`${reservaConfirmada({
    data: state.data,
    precio,
    mensajeTarifa,
    folio
  })}

🤝 ¿Necesitas algo mas?

👉 escribe:
menu`));

  resetState(state);

  return sendTransferImage({
    sock,
    from
  });
}

function startDecoratedReservation(state) {
  state.step = 20;
  state.data = {
    tipo: "decorada",
    servicioEspecial: "Habitacion decorada",
    adultos: 2,
    ninos: 0,
    habitacion: "King",
    noches: 1,
    promocion: "no"
  };
}

function handleDecoratedStep({
  input,
  text,
  state,
  send,
  sock,
  from
}) {
  if (state.step === 20) {
    if (!reservaValidators.nombre(input)) {
      return send(withMenuFooter(`⚠️ No pude validar el nombre.

📝 Paso 1 de 4: Nombre completo

Ejemplo:
Juan Perez`));
    }

    state.data.nombre = text;
    state.step = 21;

    return send(withMenuFooter(`📞 Paso 2 de 4: Numero celular

Escribe un numero de contacto a 10 digitos.

Ejemplo:
9931234567`));
  }

  if (state.step === 21) {
    if (!reservaValidators.telefono(input)) {
      return send(withMenuFooter(`⚠️ Numero invalido.

Escribe un numero a 10 digitos.

Ejemplo:
9931234567`));
    }

    state.data.telefono = input;
    state.step = 22;

    return send(withMenuFooter(`📅 Paso 3 de 4: Fecha de ingreso

La habitacion decorada siempre es:
• King
• Para 2 personas
• Solo 1 noche

Debe reservarse con minimo 2 dias de anticipacion.

Puedes escribir:
25/12
25/12/26
25 de diciembre`));
  }

  if (state.step === 22) {
    if (!reservaValidators.fecha(input)) {
      return send(withMenuFooter(`⚠️ Fecha invalida o sin disponibilidad.

Puedes escribir:
25/12
25/12/26
25 de diciembre`));
    }

    if (!isDecoratedRoomDate(input)) {
      return send(withMenuFooter(`⚠️ Para habitacion decorada necesitamos minimo 2 dias de anticipacion.

Por favor indica una fecha posterior.`));
    }

    state.data.fecha = formatReservationDate(input);
    state.step = 23;

    return send(withMenuFooter(`⏰ Paso 4 de 4: Hora estimada de llegada

Ejemplos:
10 am
8 pm
9pm`));
  }

  if (state.step === 23) {
    if (!reservaValidators.hora(input)) {
      return send(withMenuFooter(`⚠️ Hora invalida.

Ejemplos:
10 am
8 pm
9pm`));
    }

    state.data.hora = normalizarHoraLlegada(input);

    return finishDecoratedReservation({
      state,
      send,
      sock,
      from
    });
  }
}

async function handleRomanticas({
  input,
  text,
  state,
  send,
  sock,
  from
}) {
  if (state.step === null) {
    state.step = 0;
    state.history = [];
    state.data = {};

    return send(withMenuFooter(ROMANTIC_MENU));
  }

  if (state.step >= 20) {
    return handleDecoratedStep({
      input,
      text,
      state,
      send,
      sock,
      from
    });
  }

  if (state.step === 0) {
    if (!["1", "2"].includes(input)) {
      return send(withMenuFooter(`⚠️ Opcion invalida

${ROMANTIC_MENU}`));
    }

    state.data.tipo = input === "1"
      ? "cena"
      : "decorada";

    if (state.data.tipo === "cena") {
      await sendImages({
        sock,
        from,
        directory: imageDir("romantica"),
        caption: "🍽️ Cena romantica"
      });

      state.step = 1;

      return send(withMenuFooter(`${ROMANTIC_DINNER_INFO}

${ROMANTIC_RESERVE_PROMPT}`));
    }

    await sendImages({
      sock,
      from,
      directory: imageDir("decorada"),
      caption: "🛏️ Habitacion decorada"
    });

    state.step = 1;

    return send(withMenuFooter(`${DECORATED_ROOM_INFO}

⚠️ La habitacion decorada debe reservarse con minimo 2 dias de anticipacion.

${ROMANTIC_RESERVE_PROMPT}`));
  }

  if (state.step === 1) {
    if (!["1", "2"].includes(input)) {
      return send(withMenuFooter(`⚠️ Opcion invalida

${ROMANTIC_RESERVE_PROMPT}`));
    }

    if (input === "2") {
      resetState(state);
      return send(withMenuFooter(ROMANTIC_MENU));
    }

    if (state.data.tipo === "decorada") {
      startDecoratedReservation(state);

      return send(withMenuFooter(`📝 Paso 1 de 4: Nombre completo

Por favor escribe el nombre y apellido de la persona que quedara registrada.

Ejemplo:
Juan Perez`));
    }

    state.step = 2;

    return send(withMenuFooter(`✍️ Nombre completo

Ejemplo:
Juan Perez`));
  }

  if (state.step === 2) {
    if (!reservaValidators.nombre(input)) {
      return send(withMenuFooter(`⚠️ Dato invalido

✍️ Nombre completo

Ejemplo:
Juan Perez`));
    }

    state.data.nombre = text;
    state.step = 3;

    return send(withMenuFooter(`📞 Numero celular

Ejemplo:
9931234567`));
  }

  if (state.step === 3) {
    if (!reservaValidators.telefono(input)) {
      return send(withMenuFooter(`⚠️ Dato invalido

📞 Numero celular

Ejemplo:
9931234567`));
    }

    state.data.telefono = input;
    state.step = 4;

    return send(withMenuFooter(`📅 Fecha de la cena

Formato:
dd/mm

Ejemplo:
14/02`));
  }

  if (state.step === 4) {
    if (!reservaValidators.fecha(input)) {
      return send(withMenuFooter(`⚠️ Dato invalido

📅 Fecha de la cena

Formato:
dd/mm

Ejemplo:
14/02`));
    }

    state.data.fecha = formatReservationDate(input);
    state.step = 5;

    return send(withMenuFooter(`⏰ Hora de la cena

Ejemplo:
7 pm
7pm`));
  }

  if (state.step === 5) {
    if (!reservaValidators.hora(input)) {
      return send(withMenuFooter(`⚠️ Dato invalido

⏰ Hora de la cena

Ejemplo:
7 pm
7pm`));
    }

    state.data.hora = normalizarHoraLlegada(input);
    state.step = 6;

    return send(withMenuFooter(`🍽️ Elige tu cena

1️⃣ Filete mignon - $1,300
2️⃣ Fettuccine con camarones al chipotle - $1,200
3️⃣ Rib eye premium - $1,400`));
  }

  if (state.step === 6) {
    if (!DINNER_OPTIONS[input]) {
      return send(withMenuFooter(`⚠️ Opcion invalida

🍽️ Elige tu cena

1️⃣ Filete mignon - $1,300
2️⃣ Fettuccine con camarones al chipotle - $1,200
3️⃣ Rib eye premium - $1,400`));
    }

    state.data.platillo = input;

    return finishDinnerReservation({
      state,
      send,
      sock,
      from
    });
  }
}

module.exports = {
  handleRomanticas
};
