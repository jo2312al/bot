const userState =
  require("../state/userState");

const {
  sendMenu
} = require("./menuHandler");

const {
  handleReserva
} = require("./reservaHandler");

const {
  CALL_CENTER,
  COTIZACIONES_WHATSAPP
} = require("../config/config");

async function handleMessage({

  sock,
  from,
  text

}) {

  const input =
    text.toLowerCase().trim();

  // ==========================================
  // CREAR USUARIO
  // ==========================================

  if (!userState[from]) {

    userState[from] = {

      step: null,

      data: {}

    };

  }

  const state =
    userState[from];

  // ==========================================
  // ENVIAR MENSAJE
  // ==========================================

  const send =
    async (message) => {

      await sock.sendMessage(
        from,
        {
          text: message
        }
      );

    };

  // ==========================================
  // VOLVER AL MENÚ
  // ==========================================

  if (

    [
      "menu",
      "inicio",
      "0",
      "cancelar"
    ].includes(input)

  ) {

    // reset

    state.step = null;
    state.data = {};

    await send(`❌ Operación cancelada

🔄 Volviendo al menú...`);

    return sendMenu(send);

  }

  // ==========================================
  // OPCIÓN 1
  // ==========================================

  if (
    input === "1"
    &&
    !state.step
  ) {

    return handleReserva({

      input,
      text,
      state,
      send,
      sock,
      from

    });

  }

  // ==========================================
  // FLUJO ACTIVO
  // ==========================================

  if (state.step) {

    return handleReserva({

      input,
      text,
      state,
      send,
      sock,
      from

    });

  }

  // ==========================================
  // OPCIÓN 2
  // ==========================================

  if (
    input === "2"
  ) {

    return send(`💼 COTIZACIONES

Para cotizaciones comunícate aquí:

https://wa.me/${COTIZACIONES_WHATSAPP}

📞 ${CALL_CENTER}`);

  }

  // ==========================================
  // OPCIÓN 3
  // ==========================================

  if (
    input === "3"
  ) {

    return send(`📞 CALL CENTER

Teléfono:

${CALL_CENTER}

WhatsApp:

https://wa.me/${COTIZACIONES_WHATSAPP}`);

  }

  // ==========================================
  // MENÚ AUTOMÁTICO
  // ==========================================

  return sendMenu(send);

}

module.exports = {

  handleMessage

};