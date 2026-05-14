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

// ==========================================
// DELAY
// ==========================================

function delay(ms) {

  return new Promise(
    resolve =>
      setTimeout(resolve, ms)
  );

}

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

  // ==========================================
  // DELAY GLOBAL MENSAJES
  // ==========================================

  const originalSendMessage =
    sock.sendMessage.bind(sock);

  sock.sendMessage =
    async (...args) => {

      // delay 5 segundos

      await delay(1500);

      return originalSendMessage(
        ...args
      );

    };

  // ==========================================
  // GUARDAR SESIÓN
  // ==========================================

  sock.ev.on(
    "creds.update",
    saveCreds
  );

  // ==========================================
  // CONEXIÓN
  // ==========================================

  sock.ev.on(
    "connection.update",
    (update) => {

      const {
        connection,
        qr,
        lastDisconnect
      } = update;

      // ======================================
      // QR
      // ======================================

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

      // ======================================
      // CONECTADO
      // ======================================

      if (
        connection ===
        "open"
      ) {

        log({usuario: "Sistema", modulo: "Core", accion: "✅ BOT CONECTADO"});

      }

      // ======================================
      // DESCONECTADO
      // ======================================

      if (
        connection ===
        "close"
      ) {

        log({usuario: "Sistema", modulo: "Core", accion: "❌ DESCONECTADO"});

        const reconnect =

          lastDisconnect
            ?.error
            ?.output
            ?.statusCode

          !==

          DisconnectReason
            .loggedOut;

        if (reconnect) {

          log({usuario: "Sistema", modulo: "Core", accion: "🔄 RECONECTANDO..."});

          startBot();

        }

      }

    }
  );

  // ==========================================
  // MENSAJES
  // ==========================================

  sock.ev.on(
    "messages.upsert",
    async ({
      messages,
      type
    }) => {

      try {

        // ======================================
        // SOLO notify
        // ======================================

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

        // ======================================
        // IGNORAR BOT
        // ======================================

        if (
          msg.key.fromMe
        )
          return;

        // ======================================
        // FROM
        // ======================================

        const from =
          msg.key.remoteJid;

        // ======================================
        // TEXTO
        // ======================================

        const text =

          msg.message
            .conversation ||

          msg.message
            .extendedTextMessage
            ?.text ||

          "";

        if (!text)
          return;

        // ======================================
        // LOG GRUPOS
        // ======================================

        if (
          from.endsWith("@g.us")
        ) {

          log({usuario: from, modulo: "Chat Grupal", accion: text});

          return;

        }

        // ======================================
        // LOG PRIVADOS
        // ======================================

        log({usuario: from, modulo: "Chat Privado", accion: text});

        // ======================================
        // MANEJAR MENSAJE
        // ======================================

        await handleMessage({

          sock,
          from,
          text

        });

      } catch (err) {

        log({usuario: "Sistema", modulo: "Error", accion: err.toString()});

      }

    }
  );

}

// ==========================================
// START
// ==========================================

startBot();