const {
  withMenuFooter
} = require(
  "../../utils/menuFooter"
);

async function handlePelicula({

  send

}) {

  return send( withMenuFooter(`🎬 Próximamente podrás conocer
nuestro personaje animado`));

}

module.exports = {

  handlePelicula

};