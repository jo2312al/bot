const {
  withMenuFooter
} = require(
  "../../utils/menuFooter"
);

const {
  getYoutubeVideos
} = require(
  "../../services/youtubeService"
);

// ==========================================
// HANDLER
// ==========================================

async function handleTurismo({

  send

}) {

  try {

    const videos =
      await getYoutubeVideos();

    // ================================
    // SIN VIDEOS
    // ================================

    if (
      !videos.length
    ) {

      return send(

        withMenuFooter(`⚠️ No hay videos disponibles`)

      );

    }

    // ================================
    // TEXTO
    // ================================

    let message =
      `🌴 Qué hacer en Tabasco

🎥 Videos turísticos:

`;

    // ================================
    // AGREGAR VIDEOS
    // ================================

    videos
      .slice(0, 10)
      .forEach((video, index) => {

        message +=

`${index + 1}️⃣ ${video.title}

${video.link}

`;

      });

    // ================================
    // ENVIAR
    // ================================

    return send(

      withMenuFooter(message)

    );

  }

  // ==================================
  // ERROR
  // ==================================

  catch (error) {

    console.log(error);

    return send(

      withMenuFooter(`⚠️ Error obteniendo videos`)

    );

  }

}

module.exports = {

  handleTurismo

};