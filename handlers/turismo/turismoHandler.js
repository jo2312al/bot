const {
  withMenuFooter
} = require(
  "../../utils/menuFooter"
);
const {
  TURISMO
} = require(
  "../../constants/tourism"
);

async function handleTurismo({

  send

}) {

  return send(
  withMenuFooter(
    TURISMO
  )
);

}

module.exports = {

  handleTurismo

};