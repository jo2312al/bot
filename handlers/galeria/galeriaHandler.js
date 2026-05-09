const {
  withMenuFooter
} = require(
  "../../utils/menuFooter"
);
const {
  GALLERY_OPTIONS
} = require(
  "../../constants/gallery"
);

async function handleGaleria({

  send

}) {

  return send( withMenuFooter(GALLERY_OPTIONS));

}

module.exports = {

  handleGaleria

};