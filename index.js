const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage
} = require("@whiskeysockets/baileys");

const pino =
  require("pino");

const fs =
  require("fs");

const path =
  require("path");

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

const {
  writeBotStatus
} = require(
  "./services/botStatusService"
);
const {
  saveCalendarReservation,
  saveGroupMessage
} = require(
  "./services/reservationDatabaseService"
);
const {
  parseReservationEvent
} = require(
  "./services/groupReservationLogService"
);
const {
  readPendingReservationGroupNotifications,
  markReservationGroupNotificationSent
} = require(
  "./services/groupReservationNotificationService"
);

const BOT_ID =
  process.env.BOT_ID || "principal";
const BOT_LABEL =
  process.env.BOT_LABEL || "Bot principal";
const AUTH_DIR =
  process.env.BOT_AUTH_DIR || "auth";
const ACTIVE_HOURS =
  process.env.BOT_ACTIVE_HOURS || "";
const BOT_TIME_ZONE =
  process.env.BOT_TIME_ZONE || "America/Mexico_City";

let reconnectTimer =
  null;

let reconnectAttempts =
  0;

let isStarting =
  false;

let authResetDone =
  false;

let groupNotificationTimer =
  null;

let isFlushingGroupNotifications =
  false;

function getScheduleStatus() {
  if (!ACTIVE_HOURS) {
    return {
      active: true,
      detail: "Disponible 24/7"
    };
  }

  const match =
    ACTIVE_HOURS.match(/^(\d{1,2})-(\d{1,2})$/);

  if (!match) {
    return {
      active: true,
      detail: "Horario no valido; disponible"
    };
  }

  const start =
    Number(match[1]);
  const end =
    Number(match[2]);
  const hour =
    Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: BOT_TIME_ZONE,
        hour: "2-digit",
        hourCycle: "h23"
      }).format(new Date())
    );
  const active =
    start > end
      ? hour >= start || hour < end
      : hour >= start && hour < end;

  return {
    active,
    detail: active
      ? `Disponible ${ACTIVE_HOURS} (${BOT_TIME_ZONE})`
      : `Fuera de horario ${ACTIVE_HOURS} (${BOT_TIME_ZONE})`
  };
}

function updateScheduleStatus() {
  const schedule =
    getScheduleStatus();

  writeBotStatus(BOT_ID, {
    availability:
      schedule.active ? "active" : "inactive",
    schedule: schedule.detail
  });

  return schedule;
}

function formatReservationGroupNotification(notification) {
  const reservations =
    notification.reservations || [];
  const heading =
    reservations.length === 1
      ? "*RESERVA REGISTRADA*"
      : `*RESERVAS IMPORTADAS (${reservations.length})*`;
  const details =
    reservations.map((reservation, index) => {
      const title =
        reservations.length === 1
          ? `*Cliente:* ${reservation.nombre}`
          : `*${index + 1}. ${reservation.nombre}*`;
      const dates =
        Array.isArray(reservation.dates) && reservation.dates.length
          ? reservation.dates.join(" al ")
          : reservation.fecha;
      const guests =
        `${reservation.adultos || 0} adulto(s), ${reservation.ninos || 0} menor(es)`;
      const lines = [
        title,
        `Fecha: ${dates}`,
        `Habitaciones: ${reservation.habitaciones || 1}`,
        `Huespedes: ${guests}`
      ];

      if (reservation.tipo) lines.push(`Tipo: ${reservation.tipo}`);
      if (reservation.hora) lines.push(`Hora de llegada: ${reservation.hora}`);
      if (reservation.telefono) lines.push(`Telefono: ${reservation.telefono}`);
      if (reservation.tarifa) lines.push(`Tarifa: ${reservation.tarifa}`);
      if (reservation.folio) lines.push(`Folio: #${reservation.folio}`);

      return lines.join("\n");
    });

  return [heading, ...details].join("\n\n");
}

async function flushGroupReservationNotifications(sock) {
  if (BOT_ID !== "principal" || isFlushingGroupNotifications) {
    return;
  }

  isFlushingGroupNotifications = true;

  try {
    const pending =
      readPendingReservationGroupNotifications();

    for (const notification of pending) {
      await sock.sendMessage(GROUP_ID, {
        text: formatReservationGroupNotification(notification)
      });
      markReservationGroupNotificationSent(notification.id);
      await delay(1500);
    }
  } catch (error) {
    log({
      usuario: "Sistema",
      modulo: "Reservas",
      accion: `No se pudo enviar reserva al grupo: ${getErrorMessage(error)}`
    });
  } finally {
    isFlushingGroupNotifications = false;
  }
}

function startGroupReservationNotificationPolling(sock) {
  if (BOT_ID !== "principal") {
    return;
  }

  if (groupNotificationTimer) {
    clearInterval(groupNotificationTimer);
  }

  flushGroupReservationNotifications(sock);
  groupNotificationTimer =
    setInterval(
      () => flushGroupReservationNotifications(sock),
      5000
    );
}

// ==========================================
// DELAY
// ==========================================

function delay(ms) {

  return new Promise(
    resolve =>
      setTimeout(resolve, ms)
  );

}

function getErrorMessage(error) {

  return error?.stack || error?.message || String(error);

}

function shouldReconnect(statusCode) {

  return ![
    DisconnectReason.connectionReplaced,
    440
  ].includes(statusCode);

}

function resetAuthSession() {

  if (authResetDone) {

    return false;

  }

  const authDir =
    path.join(
      __dirname,
      AUTH_DIR
    );

  if (
    !fs.existsSync(authDir)
  ) {

    return false;

  }

  const backupDir =
    path.join(
      __dirname,
    `${AUTH_DIR}-invalid-${Date.now()}`
    );

  fs.renameSync(
    authDir,
    backupDir
  );

  authResetDone =
    true;

  log({
    usuario: "Sistema",
    modulo: "Core",
    accion: `Sesion WhatsApp 401 respaldada en ${path.basename(backupDir)}. Se generara un QR nuevo.`
  });

  return true;

}

function scheduleReconnect() {

  if (reconnectTimer) {

    return;

  }

  reconnectAttempts++;

  const waitMs =
    Math.min(
      30000,
      3000 * reconnectAttempts
    );

  log({
    usuario: "Sistema",
    modulo: "Core",
    accion: `Reconectando en ${Math.round(waitMs / 1000)}s`
  });

  reconnectTimer =
    setTimeout(() => {

      reconnectTimer = null;

      startBot().catch(err => {

        isStarting = false;

        log({
          usuario: "Sistema",
          modulo: "Error",
          accion: getErrorMessage(err)
        });

        scheduleReconnect();

      });

    }, waitMs);

}

function extractMessageText(message = {}) {

  const interactiveParams =
    message
      .interactiveResponseMessage
      ?.nativeFlowResponseMessage
      ?.paramsJson;

  if (interactiveParams) {

    try {

      const parsed =
        JSON.parse(interactiveParams);

      return parsed.id || parsed.title || "";

    } catch {

      return "";

    }

  }

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedButtonId ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.listResponseMessage?.singleSelectReply?.selectedRowId ||
    message.listResponseMessage?.title ||
    message.templateButtonReplyMessage?.selectedId ||
    message.templateButtonReplyMessage?.selectedDisplayText ||
    ""
  );

}

async function startBot() {

  if (isStarting) {

    return;

  }

  isStarting = true;

  const {
    state,
    saveCreds
  } =
    await useMultiFileAuthState(
      AUTH_DIR
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
        BOT_LABEL,
        "Chrome",
        "1.0"
      ]

    });

  isStarting =
    false;

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

        writeBotStatus(BOT_ID, {
          connection: "qr",
          qr,
          detail: `Escanea el QR para conectar ${BOT_LABEL}`,
          availability:
            getScheduleStatus().active ? "active" : "inactive",
          schedule: getScheduleStatus().detail
        });

        console.log(
          `\n📱 ESCANEA QR ${BOT_LABEL}\n`
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

        reconnectAttempts =
          0;

        writeBotStatus(BOT_ID, {
          connection: "open",
          qr: null,
          detail: `${BOT_LABEL} conectado`,
          availability:
            getScheduleStatus().active ? "active" : "inactive",
          schedule: getScheduleStatus().detail
        });

        startGroupReservationNotificationPolling(sock);

        log({usuario: "Sistema", modulo: "Core", accion: `✅ ${BOT_LABEL} CONECTADO`});

      }

      // ======================================
      // DESCONECTADO
      // ======================================

      if (
        connection ===
        "close"
      ) {

        log({usuario: "Sistema", modulo: "Core", accion: "❌ DESCONECTADO"});

        const statusCode =

          lastDisconnect
            ?.error
            ?.output
            ?.statusCode;

        const detail =

          lastDisconnect
            ?.error
            ?.message

          ||

          "sin detalle";

        writeBotStatus(BOT_ID, {
          connection: "close",
          detail:
            `${BOT_LABEL} desconectado status=${statusCode || "unknown"} detalle=${detail}`,
          schedule: getScheduleStatus().detail
        });

        log({
          usuario: "Sistema",
          modulo: "Core",
          accion: `Desconexion status=${statusCode || "unknown"} detalle=${detail}`
        });

        const reconnect =

          shouldReconnect(statusCode);

        if (reconnect) {

          if (
            statusCode === DisconnectReason.loggedOut
            ||
            statusCode === 401
          ) {

            resetAuthSession();

          }

          scheduleReconnect();

        } else {

          log({
            usuario: "Sistema",
            modulo: "Core",
            accion: "Sesion cerrada o reemplazada. Escanea QR o cierra otras sesiones antes de reiniciar."
          });

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

          extractMessageText(
            msg.message
          );

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

        if (!getScheduleStatus().active) {
          updateScheduleStatus();
          return;
        }

        // ======================================
        // LOG GRUPOS
        // ======================================

        if (
          from.endsWith("@g.us")
        ) {

          log({usuario: from, modulo: "Chat Grupal", accion: text});

          const timestamp =
            new Date()
              .toLocaleString();

          saveGroupMessage({
            messageKey:
              msg.key.id,
            groupId:
              from,
            timestamp,
            text
          });

          const reservation =
            parseReservationEvent({
              user:
                from,
              module:
                "Chat Grupal",
              timestamp,
              action:
                text
            });

          if (reservation) {
            saveCalendarReservation(reservation);
          }

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

        log({usuario: "Sistema", modulo: "Error", accion: getErrorMessage(err)});

      }

    }
  );

}

// ==========================================
// START
// ==========================================

process.on(
  "unhandledRejection",
  err => {

    log({
      usuario: "Sistema",
      modulo: "Error",
      accion: `UnhandledRejection: ${getErrorMessage(err)}`
    });

  }
);

process.on(
  "uncaughtException",
  err => {

    log({
      usuario: "Sistema",
      modulo: "Error",
      accion: `UncaughtException: ${getErrorMessage(err)}`
    });

    if (
      !String(err?.message || err)
        .includes("Bad MAC")
    ) {

      process.exitCode =
        1;

    }

  }
);

updateScheduleStatus();
setInterval(
  updateScheduleStatus,
  60 * 1000
);

startBot()
  .catch(err => {

    isStarting =
      false;

    log({
      usuario: "Sistema",
      modulo: "Error",
      accion: getErrorMessage(err)
    });

    scheduleReconnect();

  });
