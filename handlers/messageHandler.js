// handlers/messageHandler.js

const {
  MAIN_MENU
} = require(
  "../constants/menus"
);

const {
  resolveMenuOption
} = require(
  "../constants/menuAliases"
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

  const menuInput =
    resolveMenuOption(input);

  // ==========================================
  // CREAR USUARIO
  // ==========================================

  if (!userState[from]) {

    userState[from] = {

      module: null,

      step: null,

      data: {},

      history: [],

      lastMenu: null,

      agentMode: false

    };

  }

  const state =
    userState[from];

  if (
    state.agentMode
  ) {

    return;

  }

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

    state.history = [];

  }

  // ==========================================
  // CANCELAR
  // ==========================================

  if (

    menuInput === "menu"

    ||

    menuInput === "inicio"

    ||

    menuInput === "cancelar"

  ) {

    state.module = null;

    state.step = null;

    state.data = {};

    state.history = [];

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
      "11",
      "12",
      "13"

    ];

    // ======================================
    // MOSTRAR MENÚ SI NO ES OPCIÓN
    // ======================================

    if (
      !validOptions.includes(menuInput)
    ) {

      return send(MAIN_MENU);

    }

    // ======================================
    // SI ES OPCIÓN
    // CONTINUAR AL ROUTER
    // ======================================

  }

  // ==========================================
  // VOLVER
  // ==========================================

  if (
    menuInput === "volver"
  ) {

    // ======================================
    // SIN HISTORIAL
    // ======================================

    if (
      !state.history.length
    ) {

      return send(`⚠️ No puedes volver más atrás`);

    }

    // ======================================
    // ÚLTIMO ESTADO
    // ======================================

    const previousState =
      state.history.pop();

    // ======================================
    // RESTAURAR
    // ======================================

    state.step =
      previousState.step;

    state.data =
      previousState.data;

    // ======================================
    // REEJECUTAR
    // ======================================

    return routerHandler({

      input: "",

      state,
      send,
      sock,
      from,
      text: ""

    });

  }

  // ==========================================
  // ROUTER
  // ==========================================

  return routerHandler({

    input:
      !state.module
        ? menuInput
        : input,
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
