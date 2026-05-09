// ==========================================
// RESERVAS
// ==========================================

const {
  handleReserva
} = require(
  "./reservas/reservaHandler"
);

// ==========================================
// COTIZACIONES
// ==========================================

const {
  handleCotizacion
} = require(
  "./cotizaciones/cotizacionHandler"
);

// ==========================================
// QUEJAS
// ==========================================

const {
  handleQuejas
} = require(
  "./quejas/quejasHandler"
);

// ==========================================
// OBJETOS
// ==========================================

const {
  handleObjetos
} = require(
  "./objetos/objetosHandler"
);

// ==========================================
// GALERÍA
// ==========================================

const {
  handleGaleria
} = require(
  "./galeria/galeriaHandler"
);

// ==========================================
// TURISMO
// ==========================================

const {
  handleTurismo
} = require(
  "./turismo/turismoHandler"
);

// ==========================================
// SERVICIOS
// ==========================================

const {
  handleServicios
} = require(
  "./servicios/serviciosHandler"
);

// ==========================================
// PROMOCIONES
// ==========================================

const {
  handlePromociones
} = require(
  "./promociones/promocionesHandler"
);

// ==========================================
// REDES
// ==========================================

const {
  handleRedes
} = require(
  "./redes/redesHandler"
);

// ==========================================
// PELÍCULA
// ==========================================

const {
  handlePelicula
} = require(
  "./pelicula/peliculaHandler"
);

// ==========================================
// CALL CENTER
// ==========================================

const {
  handleCallcenter
} = require(
  "./callcenter/callcenterHandler"
);

// ==========================================
// ROUTER
// ==========================================

async function routerHandler({

  input,
  state,
  send,
  sock,
  from,
  text

}) {

  // ========================================
  // RUTAS
  // ========================================

const routes = {

  "1": {
    module: "reservas",
    handler: handleReserva
  },

  "2": {
    module: "cotizaciones",
    handler: handleCotizacion
  },

  "3": {
    module: "quejas",
    handler: handleQuejas
  },

  "4": {
    module: "objetos",
    handler: handleObjetos
  },

  "5": {
    module: "galeria",
    handler: handleGaleria
  },

  "6": {
    module: "turismo",
    handler: handleTurismo
  },

  "7": {
    module: "servicios",
    handler: handleServicios
  },

  "8": {
    module: "promociones",
    handler: handlePromociones
  },

  "9": {
    module: "redes",
    handler: handleRedes
  },

  "10": {
    module: "pelicula",
    handler: handlePelicula
  },

  "11": {
    module: "callcenter",
    handler: handleCallcenter
  }

};

  // ========================================
  // NUEVO MÓDULO
  // ========================================

  if (

    !state.module

    &&

    routes[input]

  ) {

    state.module =
      routes[input]
        .module;

  }

  // ========================================
  // HANDLER ACTUAL
  // ========================================

  const currentRoute =

    Object.values(routes)
      .find(

        route =>

          route.module ===
          state.module

      );

  // ========================================
  // NO EXISTE
  // ========================================

  if (!currentRoute) {

    return send(`⚠️ Opción inválida

👉 escribe:
menu`);

  }

  // ========================================
  // EJECUTAR HANDLER
  // ========================================

  return currentRoute
    .handler({

      input,
      state,
      send,
      sock,
      from,
      text

    });

}

module.exports = {

  routerHandler

};