// handlers/messageHandler.js

const userState =
  require("../state/userState");

const {
  routerHandler
} = require("./routerHandler");

// ==========================================
// CONFIG
// ==========================================

const ONE_HOUR =
  60 * 60 * 1000;

// ==========================================
// MESSAGE HANDLER
// ==========================================

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

      module: null,

      step: null,

      data: {},

      lastMenu: null

    };

  }

  const state =
    userState[from];

  // ==========================================
  // SEND
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
  // CONTROL MENÚ
  // ==========================================

  const now =
    Date.now();

  const shouldShowMenu =

    !state.lastMenu

    ||

    (

      now - state.lastMenu

      >

      ONE_HOUR

    );

  // ==========================================
  // RESET AUTOMÁTICO
  // ==========================================

  if (
    shouldShowMenu
  ) {

    state.module = null;

    state.step = null;

    state.data = {};

  }

  // ==========================================
  // CANCELAR
  // ==========================================

  if (

    input === "menu"

    ||

    input === "inicio"

    ||

    input === "cancelar"

  ) {

    state.module = null;

    state.step = null;

    state.data = {};

    state.lastMenu =
      Date.now();

    return send(`🏨 Hotel Villa Margaritas

¿En qué podemos ayudarte?

1️⃣ Reservas

2️⃣ Cotizaciones

3️⃣ Quejas

4️⃣ Objetos extraviados

5️⃣ Galería

6️⃣ Qué hacer en Tabasco

7️⃣ Servicios

8️⃣ Foto gratis del mes

9️⃣ Redes sociales

🔟 Película personaje

1️⃣1️⃣ Call center

📍 Dirección:
Andrés Sánchez Magallanes 910 Col Centro`);

  }

  // ==========================================
  // MOSTRAR MENÚ AUTOMÁTICO
  // ==========================================

  if (

    shouldShowMenu

    &&

    !state.module

  ) {

    state.lastMenu =
      now;

    // si ya eligió opción
    // dejar continuar

    const validOptions = [

      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11"

    ];

    if (
      !validOptions.includes(input)
    ) {

      return send(`🏨 Hotel Villa Margaritas

¿En qué podemos ayudarte?

1️⃣ Reservas

2️⃣ Cotizaciones

3️⃣ Quejas

4️⃣ Objetos extraviados

5️⃣ Galería

6️⃣ Qué hacer en Tabasco

7️⃣ Servicios

8️⃣ Foto gratis del mes

9️⃣ Redes sociales

🔟 Película personaje

1️⃣1️⃣ Call center

📍 Dirección:
Andrés Sánchez Magallanes 910 Col Centro`);

    }

  }

  // ==========================================
  // ROUTER
  // ==========================================

  return routerHandler({

    input,
    state,
    send,
    sock,
    from,
    text

  });

}

module.exports = {

  handleMessage

};