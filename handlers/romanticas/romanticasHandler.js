const fs = require("fs");
const path = require("path");

const { withMenuFooter } = require("../../utils/menuFooter");
const { formatReservationDate, parseReservationDate } = require("../../utils/dateUtils");
const { GROUP_ID } = require("../../config/config");
const { generarFolio } = require("../../services/reservationService");
const { registerPendingReservation } = require("../../services/paymentReservationService");
const { handleReserva } = require("../reservas/reservaHandler");
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

function isName(value) {
  return value.trim().split(/\s+/).length >= 2;
}

function isPhone(value) {
  return /^\d{10}$/.test(value.trim());
}

function isDate(value) {
  return Boolean(
    parseReservationDate(value)
  );
}

function isHour(value) {
  return /^(0?[1-9]|1[0-2])\s?(am|pm)$/i.test(value.trim());
}

function resetState(state) {
  state.module = null;
  state.step = null;
  state.data = {};
  state.history = [];
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
    text: `NUEVA RESERVA DE CENA ROMANTICA PENDIENTE DE ANTICIPO

Nombre: ${state.data.nombre}
Telefono: ${state.data.telefono}
Fecha: ${state.data.fecha}
Hora: ${state.data.hora}
Cena: ${option.name}
Total: $${option.price}

Folio: #${folio}
WhatsApp: ${from}`
  });

  registerPendingReservation({
    from,
    sock,
    folio
  });

  await send(withMenuFooter(`✅ RESERVA DE CENA ROMANTICA RECIBIDA

Nombre: ${state.data.nombre}
Telefono: ${state.data.telefono}
Fecha: ${state.data.fecha}
Hora: ${state.data.hora}
Cena: ${option.name}
Total: $${option.price}
Folio: #${folio}

Para garantizar tu reservacion se requiere 50% de anticipo por transferencia.
Te enviaremos los datos de transferencia en imagen.

Importante: si no recibimos el anticipo o comprobante dentro de 24 horas, la reservacion se cancela automaticamente.`));

  resetState(state);

  return sendTransferImage({
    sock,
    from
  });
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
      state.module = "reservas";
      state.step = null;
      state.history = [];
      state.data = {
        servicioEspecial: "Habitacion decorada"
      };

      return handleReserva({
        input: "",
        text: "",
        state,
        send,
        sock,
        from
      });
    }

    state.step = 2;

    return send(withMenuFooter(`✍️ Nombre completo

Ejemplo:
Juan Perez`));
  }

  if (state.step === 2) {
    if (!isName(input)) {
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
    if (!isPhone(input)) {
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
    if (!isDate(input)) {
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
    if (!isHour(input)) {
      return send(withMenuFooter(`⚠️ Dato invalido

⏰ Hora de la cena

Ejemplo:
7 pm
7pm`));
    }

    state.data.hora = input.replace(/^(\d{1,2})\s*(am|pm)$/i, "$1 $2").toLowerCase();
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
