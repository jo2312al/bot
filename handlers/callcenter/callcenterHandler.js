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

  return send(withMenuFooter(`📞 CALL CENTER

Horario:
9 AM a 5 PM

Teléfono:
${CALL_CENTER}`));

}

module.exports = {

  handleCallcenter

};