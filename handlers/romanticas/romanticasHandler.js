const fs = require("fs");
const path = require("path");

const { withMenuFooter } = require("../../utils/menuFooter");
const {
  ROMANTIC_MENU,
  ROMANTIC_DINNER_INFO,
  DECORATED_ROOM_INFO
} = require("../../constants/romantic");

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

function getImageFiles(directories) {
  return directories.flatMap(directory => {
    if (!fs.existsSync(directory)) return [];

    return fs.readdirSync(directory)
      .filter(file => IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase()))
      .map(file => path.join(directory, file));
  });
}

async function sendImages({ sock, from, directories, caption }) {
  const files = getImageFiles(directories);

  for (const filePath of files) {
    await sock.sendMessage(from, {
      image: {
        url: filePath
      },
      caption
    });
  }

  return files.length;
}

async function handleRomanticas({
  input,
  state,
  send,
  sock,
  from
}) {
  if (state.step === null) {
    state.step = 0;
    state.history = [];
    state.data = {};

    return send(withMenuFooter(ROMANTIC_MENU));
  }

  if (state.step === 0) {
    if (!["1", "2"].includes(input)) {
      return send(withMenuFooter(`Opcion invalida

${ROMANTIC_MENU}`));
    }

    const mediaRoot = path.join(__dirname, "../../media");

    if (input === "1") {
      await sendImages({
        sock,
        from,
        directories: [
          path.join(mediaRoot, "cenas-romanticas"),
          path.join(mediaRoot, "restaurant")
        ],
        caption: "Cena romantica"
      });

      return send(withMenuFooter(`${ROMANTIC_DINNER_INFO}

Para reservar escribe:
menu

Y selecciona la opcion 1 Reservas.`));
    }

    await sendImages({
      sock,
      from,
      directories: [
        path.join(mediaRoot, "habitaciones-decoradas"),
        path.join(mediaRoot, "habitaciones")
      ],
      caption: "Habitacion decorada"
    });

    return send(withMenuFooter(`${DECORATED_ROOM_INFO}

Para reservar escribe:
menu

Y selecciona la opcion 1 Reservas.`));
  }
}

module.exports = {
  handleRomanticas
};
