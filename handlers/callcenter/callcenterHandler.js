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

  input,

  state,

  send

}) {

  if (
    state.module === "agente"
  ) {

    if (
      state.step === null
    ) {

      state.step = "confirmar";

      return send(withMenuFooter(`📞 AGENTE

Si aplica tu solicitud, el bot dejara de contestarte y te atendera una persona.

Horario:
9 AM a 5 PM

Telefono / WhatsApp:
${CALL_CENTER}

Para confirmar y desactivar el bot, escribe:
aceptar`));

    }

    if (
      input === "aceptar"
    ) {

      state.agentMode = true;
      state.module = null;
      state.step = null;
      state.data = {};
      state.history = [];

      return send(`Listo. El bot queda desactivado para esta conversacion.

Una persona te atendera en horario de 9 AM a 5 PM.`);

    }

    return send(withMenuFooter(`Para desactivar el bot y solicitar atencion de una persona, escribe:
aceptar`));

  }

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
