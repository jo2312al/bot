const {
  withMenuFooter
} = require(
  "../../utils/menuFooter"
);

const {
  TIKTOK
} = require(
  "../../constants/links"
);

// ==========================================
// HANDLER
// ==========================================

async function handlePelicula({

  send

}) {

  return send(

    withMenuFooter(`🎬 Descubre las historias de Margarita

✨ Aventuras, historias y contenido especial
te esperan en nuestro TikTok oficial:

${TIKTOK}`)

  );

}

module.exports = {

  handlePelicula

};