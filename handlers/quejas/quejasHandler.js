// handlers/quejas/quejasHandler.js

const {
  withMenuFooter
} = require(
  "../../utils/menuFooter"
);

// ==========================================
// HANDLER
// ==========================================

async function handleQuejas({

  input,
  text,
  state,
  send

}) {

  // ======================================
  // INICIO
  // ======================================

  if (
    state.step === null
  ) {

    state.step = 0;

    state.data = {};

    return send(

      withMenuFooter(`📝 QUEJAS

Selecciona tipo de reporte:

1️⃣ Facturación

2️⃣ Servicio`)

    );

  }

  // ======================================
  // STEP 0
  // TIPO QUEJA
  // ======================================

  if (
    state.step === 0
  ) {

    // ================================
    // FACTURACIÓN
    // ================================

    if (
      input === "1"
    ) {

      state.data.tipo =
        "facturacion";

      state.step = 1;

      return send(

        withMenuFooter(`🧾 FACTURACIÓN

Selecciona área:

1️⃣ Recepción

2️⃣ Restaurant`)

      );

    }

    // ================================
    // SERVICIO
    // ================================

    if (
      input === "2"
    ) {

      state.data.tipo =
        "servicio";

      state.step = 1;

      return send(

        withMenuFooter(`🛎️ SERVICIO

Selecciona área:

1️⃣ Recepción

2️⃣ Restaurant`)

      );

    }

    return send(

      withMenuFooter(`⚠️ Opción inválida

Selecciona:

1️⃣ Facturación

2️⃣ Servicio`)

    );

  }

  // ======================================
  // STEP 1
  // ÁREA
  // ======================================

  if (
    state.step === 1
  ) {

    // ================================
    // RECEPCIÓN
    // ================================

    if (
      input === "1"
    ) {

      state.data.area =
        "recepcion";

    }

    // ================================
    // RESTAURANT
    // ================================

    else if (
      input === "2"
    ) {

      state.data.area =
        "restaurant";

    }

    // ================================
    // INVÁLIDO
    // ================================

    else {

      return send(

        withMenuFooter(`⚠️ Opción inválida

Selecciona:

1️⃣ Recepción

2️⃣ Restaurant`)

      );

    }

    // ================================
    // CONTINUAR
    // ================================

    state.step = 2;

    return send(

      withMenuFooter(`👤 Escribe nombre completo`)

    );

  }

  // ======================================
  // STEP 2
  // NOMBRE
  // ======================================

  if (
    state.step === 2
  ) {

    state.data.nombre =
      text;

    state.step = 3;

    // ================================
    // FACTURACIÓN
    // ================================

    if (
      state.data.tipo ===
      "facturacion"
    ) {

      // RECEPCIÓN

      if (
        state.data.area ===
        "recepcion"
      ) {

        return send(

          withMenuFooter(`🏨 Número habitación`)

        );

      }

      // RESTAURANT

      return send(

        withMenuFooter(`📅 Fecha de consumo`)

      );

    }

    // ================================
    // SERVICIO
    // ================================

    // RECEPCIÓN

    if (
      state.data.area ===
      "recepcion"
    ) {

      return send(

        withMenuFooter(`🏨 Número habitación`)

      );

    }

    // RESTAURANT

    return send(

      withMenuFooter(`🌙 Turno de llegada`)

    );

  }

  // ======================================
  // STEP 3
  // DATOS VARIABLES
  // ======================================

  if (
    state.step === 3
  ) {

    // ==================================
    // FACTURACIÓN
    // ==================================

    if (
      state.data.tipo ===
      "facturacion"
    ) {

      // ==============================
      // RECEPCIÓN
      // ==============================

      if (
        state.data.area ===
        "recepcion"
      ) {

        state.data.habitacion =
          text;

        state.step = 4;

        return send(

          withMenuFooter(`📅 Fecha check in`)

        );

      }

      // ==============================
      // RESTAURANT
      // ==============================

      state.data.fechaConsumo =
        text;

      state.step = 4;

      return send(

        withMenuFooter(`📱 Número teléfono`)

      );

    }

    // ==================================
    // SERVICIO
    // ==================================

    // RECEPCIÓN

    if (
      state.data.area ===
      "recepcion"
    ) {

      state.data.habitacion =
        text;

      state.step = 4;

      return send(

        withMenuFooter(`📅 Fecha ingreso`)

      );

    }

    // RESTAURANT

    state.data.turno =
      text;

    state.step = 4;

    return send(

      withMenuFooter(`📅 Fecha consumo`)

    );

  }

  // ======================================
  // STEP 4
  // MÁS DATOS
  // ======================================

  if (
    state.step === 4
  ) {

    // ==================================
    // FACTURACIÓN
    // ==================================

    if (
      state.data.tipo ===
      "facturacion"
    ) {

      // RECEPCIÓN

      if (
        state.data.area ===
        "recepcion"
      ) {

        state.data.fechaCheckin =
          text;

      }

      // RESTAURANT

      else {

        state.data.telefono =
          text;

      }

    }

    // ==================================
    // SERVICIO
    // ==================================

    else {

      // RECEPCIÓN

      if (
        state.data.area ===
        "recepcion"
      ) {

        state.data.fechaIngreso =
          text;

      }

      // RESTAURANT

      else {

        state.data.fechaConsumo =
          text;

      }

    }

    state.step = 5;

    return send(

      withMenuFooter(`📝 Observaciones`)

    );

  }

  // ======================================
  // STEP 5
  // FINAL
  // ======================================

  if (
    state.step === 5
  ) {

    state.data.observaciones =
      text;

    // ==================================
    // RESET
    // ==================================

    state.module = null;

    state.step = null;

    state.data = {};

    state.history = [];

    // ==================================
    // FINAL
    // ==================================

    return send(

      withMenuFooter(`✅ Tu reporte fue enviado

Gracias por ayudarnos a mejorar`)

    );

  }

}

module.exports = {

  handleQuejas

};