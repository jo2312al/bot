const {
  withMenuFooter
} = require(
  "../../utils/menuFooter"
);
const {
  PROMOCIONES
} = require(
  "../../constants/promotions"
);

async function handlePromociones({

  send

}) {

  return send( withMenuFooter(PROMOCIONES));

}

module.exports = {

  handlePromociones

};