// handlers/messageHandler.js

const {
  MAIN_MENU
} = require(
  "../constants/menus"
);

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

    return send(MAIN_MENU);

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

    // ======================================
    // OPCIONES VÁLIDAS
    // ======================================

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

    // ======================================
    // SI NO ELIGIÓ OPCIÓN
    // ======================================

    if (
      !validOptions.includes(input)
    ) {

      return send(MAIN_MENU);

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