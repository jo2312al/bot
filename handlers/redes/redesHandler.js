const {
  withMenuFooter
} = require(
  "../../utils/menuFooter"
);
const {

  FACEBOOK,
  INSTAGRAM,
  YOUTUBE,
  TIKTOK,
  GOOGLE_MAPS

} = require(
  "../../constants/links"
);

async function handleRedes({

  send

}) {

  return send( withMenuFooter(`📲 REDES SOCIALES

Facebook:
${FACEBOOK}

Instagram:
${INSTAGRAM}

YouTube:
${YOUTUBE}

TikTok:
${TIKTOK}

Ubicación:
${GOOGLE_MAPS}`));

}

module.exports = {

  handleRedes

};