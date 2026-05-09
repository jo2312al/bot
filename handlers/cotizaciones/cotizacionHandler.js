const {
  withMenuFooter
} = require(
  "../../utils/menuFooter"
);

const {
  WHATSAPP_VENTAS
} = require(
  "../../constants/links"
);

async function handleCotizacion({

  send

}) {

  return send(withMenuFooter(`💼 COTIZACIONES

🏨 Habitaciones
🎉 Eventos
👥 Grupos
📅 Estadías largas

📞 Comunícate aquí:

${WHATSAPP_VENTAS}`));

}

module.exports = {

  handleCotizacion

};