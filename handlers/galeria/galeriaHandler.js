const {
  withMenuFooter
} = require(
  "../../utils/menuFooter"
);

const fs =
  require("fs");

const path =
  require("path");

// ==========================================
// HANDLER
// ==========================================

async function handleGaleria({

  input,
  state,
  send,
  sock,
  from

}) {

  // ======================================
  // MENÚ GALERÍA
  // ======================================

  if (
    state.step === null
  ) {

    state.step = 0;

    state.history = [];

    state.data = {};

    return send(

      withMenuFooter(`🖼️ GALERÍA MULTIMEDIA

Selecciona un área para ver imágenes:

1️⃣ Habitaciones

2️⃣ Lobby

3️⃣ Restaurant

4️⃣ Salones

5️⃣ Estacionamiento`)

    );

  }

  // ======================================
  // STEP 0
  // SELECCIONAR ÁREA
  // ======================================

  if (
    state.step === 0
  ) {

    const areas = {

      "1": "habitaciones",

      "2": "lobby",

      "3": "restaurant",

      "4": "salones",

      "5": "estacionamiento"

    };

    // ==================================
    // OPCIÓN INVÁLIDA
    // ==================================

    if (
      !areas[input]
    ) {

      return send(

        withMenuFooter(`⚠️ Opción inválida

Selecciona un área:

1️⃣ Habitaciones

2️⃣ Lobby

3️⃣ Restaurant

4️⃣ Salones

5️⃣ Estacionamiento`)

      );

    }

    // ==================================
    // HISTORIAL
    // ==================================

    if (
      state.history.length > 20
    ) {

      state.history.shift();

    }

    state.history.push({

      step: state.step,

      data: {
        ...state.data
      }

    });

    // ==================================
    // ÁREA
    // ==================================

    const area =
      areas[input];

    // ==================================
    // RUTA MEDIA
    // ==================================

    const mediaDir =

      path.join(

        __dirname,

        "../../media",

        area

      );

    // ==================================
    // VERIFICAR CARPETA
    // ==================================

    if (
      !fs.existsSync(mediaDir)
    ) {

      return send(

        withMenuFooter(`⚠️ No existe la carpeta:

${area}`)

      );

    }

    // ==================================
    // LEER ARCHIVOS
    // ==================================

    const files =

      fs.readdirSync(mediaDir)

      .filter(file => {

        return (

          file.endsWith(".jpg")

          ||

          file.endsWith(".jpeg")

          ||

          file.endsWith(".png")

          ||

          file.endsWith(".webp")

        );

      });

    // ==================================
    // SIN IMÁGENES
    // ==================================

    if (
      files.length === 0
    ) {

      return send(

        withMenuFooter(`⚠️ No hay imágenes disponibles para ${area}`)

      );

    }

    // ==================================
    // ENVIAR TODAS LAS IMÁGENES
    // ==================================

    for (
      const file of files
    ) {

      const filePath =

        path.join(
          mediaDir,
          file
        );

      await sock.sendMessage(
        from,
        {

          image: {
            url: filePath
          },

          caption:
            `🖼️ ${area.toUpperCase()}`

        }
      );

    }

    // ==================================
    // VOLVER A MENÚ GALERÍA
    // ==================================

    state.step = 0;

    return send(

      withMenuFooter(`🖼️ GALERÍA MULTIMEDIA

Selecciona otra área:

1️⃣ Habitaciones

2️⃣ Lobby

3️⃣ Restaurant

4️⃣ Salones

5️⃣ Estacionamiento`)

    );

  }

}

module.exports = {

  handleGaleria

};