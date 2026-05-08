// ==========================================
// RESERVAS
// ==========================================

const {
  handleReserva
} = require(
  "./reservas/reservaHandler"
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