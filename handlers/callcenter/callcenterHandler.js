const {
  withMenuFooter
} = require(
  "../../utils/menuFooter"
);
const {
  CALL_CENTER
} = require(
  "../../constants/contact"
);

async function handleCallcenter({

  send

}) {

  return send(withMenuFooter(`📞 AGENTE / CALL CENTER

Si aplica tu solicitud, el bot dejara de contestarte y te atendera una persona.

Horario:
9 AM a 5 PM

Telefono / WhatsApp:
${CALL_CENTER}`));

}

module.exports = {

  handleCallcenter

};
