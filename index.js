const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const pino =
  require("pino");

const qrcode =
  require("qrcode-terminal");

const log =
  require("./services/loggerService");

const {
  handleMessage
} = require(
  "./handlers/messageHandler"
);

async function startBot() {

  const {
    state,
    saveCreds
  } =
    await useMultiFileAuthState(
      "auth"
    );

  const {
    version
  } =
    await fetchLatestBaileysVersion();

  const sock =
    makeWASocket({

      version,

      logger: pino({
        level: "silent"
      }),

      auth: state,

      browser: [
        "Hotel Bot",
        "Chrome",
        "1.0"
      ]

    });

  // ==========================
  // GUARDAR
  // ==========================

  sock.ev.on(
    "creds.update",
    saveCreds
  );

  // ==========================
  // CONEXIÓN
  // ==========================

  sock.ev.on(
    "connection.update",
    (update) => {

      const {
        connection,
        qr,
        lastDisconnect
      } = update;

      // QR

      if (qr) {

        console.log(
          "\n📱 ESCANEA QR\n"
        );

        qrcode.generate(
          qr,
          {
            small: true
          }
        );

      }

      // OPEN

      if (
        connection ===
        "open"
      ) {

        log(
          "✅ BOT CONECTADO"
        );

      }

      // CLOSE

      if (
        connection ===
        "close"
      ) {

        log(
          "❌ DESCONECTADO"
        );

        const reconnect =

          lastDisconnect
            ?.error
            ?.output
            ?.statusCode

          !==

          DisconnectReason
            .loggedOut;

        if (reconnect) {

          startBot();

        }

      }

    }
  );

  // ==========================
  // MENSAJES
  // ==========================

  sock.ev.on(
    "messages.upsert",
    async ({
      messages,
      type
    }) => {

      try {

        if (
          type !==
          "notify"
        )
          return;

        const msg =
          messages[0];

        if (
          !msg.message
        )
          return;

        // IGNORAR BOT

        if (
          msg.key.fromMe
        )
          return;

        const from =
          msg.key.remoteJid;

        // IGNORAR GRUPOS

        if (
          from.endsWith(
            "@g.us"
          )
        )
          return;

        const text =

          msg.message
            .conversation ||

          msg.message
            .extendedTextMessage
            ?.text ||

          "";

        if (!text)
          return;

        log(
          `${from}: ${text}`
        );

        await handleMessage({

          sock,
          from,
          text

        });

      } catch (err) {

        log(err);

      }

    }
  );

}

startBot();