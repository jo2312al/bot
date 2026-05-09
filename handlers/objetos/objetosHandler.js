const {
  withMenuFooter
} = require(
  "../../utils/menuFooter"
);
async function handleObjetos({

  send

}) {

  return send( withMenuFooter(`🧳 OBJETOS EXTRAVIADOS

Favor de enviar:

👤 Nombre completo
🏨 Número habitación
📅 Fecha ingreso
📱 Teléfono
📝 Objeto perdido`));

}

module.exports = {

  handleObjetos

};