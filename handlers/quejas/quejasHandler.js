const {
  withMenuFooter
} = require(
  "../../utils/menuFooter"
);

async function handleQuejas({

  send

}) {

  return send( withMenuFooter(`📝 QUEJAS

Selecciona una opción:

1️⃣ Facturación

2️⃣ Servicio`));

}

module.exports = {

  handleQuejas

};