const { withMenuFooter } = require("../../utils/menuFooter");
const fs = require("fs");
const path = require("path");

async function handleGaleria({ input, text, state, send, sock, from }) {
  if (state.step === null) {
    state.step = 0;
    state.history = [];
    state.data = {};
    return send(withMenuFooter(`🖼️ GALERÍA MULTIMEDIA

Selecciona un área para ver imágenes:

1️⃣ Habitaciones
2️⃣ Lobby
3️⃣ Restaurant
4️⃣ Salones
5️⃣ Estacionamiento`));
  }

  if (state.step === 0) {
    const areas = {
      "1": "habitaciones",
      "2": "lobby",
      "3": "restaurant",
      "4": "salones",
      "5": "estacionamiento"
    };

    if (!areas[input]) {
      return send(withMenuFooter(`⚠️ Opción inválida

Selecciona un área para ver imágenes:

1️⃣ Habitaciones
2️⃣ Lobby
3️⃣ Restaurant
4️⃣ Salones
5️⃣ Estacionamiento`));
    }

    if (state.history.length > 20) state.history.shift();
    state.history.push({ step: state.step, data: { ...state.data } });

    const area = areas[input];
    const mediaDir = path.join(__dirname, "../../media", area);

    let filePath = null;
    if (fs.existsSync(mediaDir)) {
      const files = fs.readdirSync(mediaDir);
      if (files.length > 0) {
        filePath = path.join(mediaDir, files[0]);
      }
    }

    if (filePath) {
      await sock.sendMessage(from, { image: { url: filePath }, caption: `🖼️ Galería: ${area.toUpperCase()}` });
    } else {
      await send(withMenuFooter(`⚠️ Lo sentimos, no hay imágenes disponibles para ${area} en este momento.`));
    }

    state.module = null;
    state.step = null;
    state.data = {};
    state.history = [];

    return send(withMenuFooter(`🤝 ¿Necesitas algo más?\n\n👉 escribe:\nmenu`));
  }
}

module.exports = { handleGaleria };
