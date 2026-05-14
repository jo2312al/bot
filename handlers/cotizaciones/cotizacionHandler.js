const { withMenuFooter } = require("../../utils/menuFooter");
const flow = require("../../flows/cotizaciones/cotizacionFlow");
const validators = require("../../validators/cotizaciones/cotizacionValidator");
const { VENTAS_GROUP_ID } = require("../../config/config");
const { cotizacionConfirmada, cotizacionGrupo } = require("../../messages/cotizaciones/cotizacionMessages");

async function handleCotizacion({ input, text, state, send, sock, from }) {
  if (state.step === null) {
    state.step = 0;
    state.history = [];
    state.data = {};
    return send(withMenuFooter(flow[0].question));
  }

  const currentStep = flow[state.step];
  const validator = validators[currentStep.validator];

  if (!validator(input)) {
    return send(withMenuFooter(`⚠️ Dato inválido\n\n${currentStep.question}`));
  }

  state.data[currentStep.key] = currentStep.transform ? currentStep.transform(input) : text;

  if (state.history.length > 20) state.history.shift();
  state.history.push({
    step: state.step,
    data: { ...state.data }
  });

  state.step++;

  if (state.step >= flow.length) {
    await send(cotizacionConfirmada({ data: state.data }));
    await sock.sendMessage(VENTAS_GROUP_ID, {
      text: cotizacionGrupo({ data: state.data, from })
    });

    state.module = null;
    state.step = null;
    state.data = {};
    state.history = [];

    return send(withMenuFooter(`🤝 ¿Necesitas algo más?\n\n👉 escribe:\nmenu`));
  }

  return send(withMenuFooter(flow[state.step].question));
}

module.exports = { handleCotizacion };
