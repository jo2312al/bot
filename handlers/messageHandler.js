// handlers/messageHandler.js

const {
  MAIN_MENU
} = require(
  "../constants/menus"
);

const {
  HOTEL_SERVICES
} = require(
  "../constants/services"
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

function getQuickReply(input) {

  if (
    /\b(menu|men[uú]|opciones|cual menu|cu[aá]l menu|0)\b/.test(input)
  ) {

    return MAIN_MENU;

  }

  if (
    /\b(alberca|piscina)\b/.test(input)
  ) {

    return `Por el momento no contamos con alberca.

Estos son nuestros servicios disponibles:

${HOTEL_SERVICES}`;

  }

  if (
    /\b(servicio|servicios|amenidad|amenidades|wifi|internet|estacionamiento|restaurante)\b/.test(input)
  ) {

    return HOTEL_SERVICES;

  }

  if (
    /\b(ubicacion|ubicaci[oó]n|direccion|direcci[oó]n|donde estan|d[oó]nde est[aá]n)\b/.test(input)
  ) {

    return `Direccion:
Andres Sanchez Magallanes 910 Col Centro, Villahermosa, Tabasco.

Para ver mas opciones escribe:
menu`;

  }

  if (
    /\b(telefono|tel[eé]fono|llamar|contacto|whatsapp)\b/.test(input)
  ) {

    return `Puedes comunicarte con un asesor al 9934684830.

Para ver mas opciones escribe:
menu`;

  }

  if (
    /^(hola|buenos dias|buenos d[ií]as|buenas tardes|buenas noches|hi|hello)$/.test(input)
  ) {

    return MAIN_MENU;

  }

  return null;

}

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

  if (!state.module) {

    const quickReply =
      getQuickReply(input);

    if (quickReply) {

      state.lastMenu =
        Date.now();

      return send(quickReply);

    }

  }

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
