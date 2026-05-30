const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage
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

const {
  clearPendingReservation,
  hasPendingReservation
} = require(
  "./services/paymentReservationService"
);

const {
  GROUP_ID
} = require(
  "./config/config"
);

const {
  analyzeRackImage
} = require(
  "./services/rackAnalysisService"
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

          msg.message
            .imageMessage
            ?.caption ||

          msg.message
            .documentMessage
            ?.caption ||

          "";

        const hasPaymentProof =

          Boolean(
            msg.message
              .imageMessage
          )

          ||

          Boolean(
            msg.message
              .documentMessage
          );

        const isRackImage =

          Boolean(
            msg.message
              .imageMessage
          )

          &&

          text
            .toLowerCase()
            .includes("rack");

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

        if (
          isRackImage
        ) {

          const buffer =
            await downloadMediaMessage(
              msg,
              "buffer",
              {},
              {
                logger: pino({
                  level: "silent"
                }),
                reuploadRequest:
                  sock.updateMediaMessage
              }
            );

          const result =
            await analyzeRackImage({
              imageBase64:
                buffer.toString("base64"),
              mimeType:
                msg.message
                  .imageMessage
                  ?.mimetype
                  ||
                  "image/jpeg"
            });

          await sock.sendMessage(
            from,
            {
              text:
                result.ok
                  ? result.message
                  : result.error
            }
          );

          return;

        }

        if (
          hasPaymentProof
          &&
          hasPendingReservation(from)
        ) {

          const pending =
            clearPendingReservation(from);

          await sock.sendMessage(
            GROUP_ID,
            {
              text: `COMPROBANTE RECIBIDO

Folio: #${pending.folio}
WhatsApp: ${from}

El cliente envio una imagen o documento como comprobante de anticipo. Favor de validar la transferencia.`
            }
          );

          await sock.sendMessage(
            from,
            {
              text: `Comprobante recibido

Gracias. Enviaremos tu comprobante al equipo para validacion.`
            }
          );

          return;

        }

        if (!text)
          return;

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
