const fs = require("fs");
const path = require("path");
const { readCalendarReservations } = require("./reservationDatabaseService");

const FILE = path.join(__dirname, "../data/reservationArrivalReminders.json");

function readRows() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return []; }
}

function writeRows(rows) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(rows, null, 2), "utf8");
}

function parseHour(value) {
  const text = String(value || "").trim().toLowerCase();
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (match[3] === "pm" && hour < 12) hour += 12;
  if (match[3] === "am" && hour === 12) hour = 0;
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

function toIsoDate(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : "";
}

function scheduleArrivalReminder(reservation, paymentUrl) {
  const time = parseHour(reservation.hora);
  const date = toIsoDate((reservation.dates || [])[0] || reservation.fecha);
  if (!time || !date || !reservation.telefono) return false;
  // Mexico City is UTC-6 in the hotel's current operating convention.
  const dueAt = new Date(`${date}T${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}:00-06:00`);
  dueAt.setMinutes(dueAt.getMinutes() + 15);
  const rows = readRows().filter(row => row.folio !== reservation.folio);
  rows.push({
    folio: reservation.folio,
    nombre: reservation.nombre,
    telefono: reservation.telefono,
    hora: reservation.hora,
    paymentUrl,
    dueAt: dueAt.toISOString(),
    sentAt: null
  });
  writeRows(rows);
  return true;
}

function senderMatches(row, senderJid, alternateJid) {
  const senderDigits = `${senderJid} ${alternateJid}`.replace(/\D/g, "");
  const phone = String(row.telefono || "").replace(/\D/g, "").slice(-10);
  return phone.length === 10 && senderDigits.includes(phone);
}

function requestNewArrivalTime({ folio = "", senderJid = "", alternateJid = "" }) {
  const requestedFolio = String(folio || "").trim().toUpperCase();
  const rows = readRows();
  const candidates = rows
    .filter(row => row.sentAt)
    .filter(row => !requestedFolio || String(row.folio || "").toUpperCase() === requestedFolio)
    .filter(row => senderMatches(row, senderJid, alternateJid))
    .sort((left, right) => Date.parse(right.sentAt) - Date.parse(left.sentAt));
  const row = candidates[0];
  if (!row) return null;
  row.awaitingArrivalTimeAt = new Date().toISOString();
  row.confirmedAt = null;
  writeRows(rows);
  return { ...row };
}

function parseNewArrivalTime(text) {
  const match = String(text || "").trim().toLowerCase()
    .match(/(?:^|\s)(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?(?:\s|$)/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const period = String(match[3] || "").replace(/[.\s]/g, "").toUpperCase();
  if (minute > 59 || hour > 23 || (!period && hour <= 12)) return null;
  if (period) {
    if (hour < 1 || hour > 12) return null;
    return `${hour}:${String(minute).padStart(2, "0")} ${period}`;
  }
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function recordNewArrivalTime({ text = "", senderJid = "", alternateJid = "" }) {
  const rows = readRows();
  const row = rows
    .filter(item => item.awaitingArrivalTimeAt && !item.confirmedAt)
    .filter(item => Date.now() - Date.parse(item.awaitingArrivalTimeAt) <= 2 * 60 * 60 * 1000)
    .filter(item => senderMatches(item, senderJid, alternateJid))
    .sort((left, right) => Date.parse(right.awaitingArrivalTimeAt) - Date.parse(left.awaitingArrivalTimeAt))[0];
  if (!row) return null;
  const newArrivalTime = parseNewArrivalTime(text);
  if (!newArrivalTime) return { invalidTime: true, folio: row.folio };
  const parsedTime = parseHour(newArrivalTime);
  const afterSeven = Boolean(parsedTime && (parsedTime.hour > 19 || (parsedTime.hour === 19 && parsedTime.minute > 0)));
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date(row.dueAt)).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  const date = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
  const nextDueAt = new Date(`${date}T${String(parsedTime.hour).padStart(2, "0")}:${String(parsedTime.minute).padStart(2, "0")}:00-06:00`);
  nextDueAt.setMinutes(nextDueAt.getMinutes() + 15);
  row.previousArrivalTime = row.updatedArrivalTime || row.hora;
  row.updatedArrivalTime = newArrivalTime;
  row.confirmedAt = new Date().toISOString();
  row.awaitingArrivalTimeAt = null;
  row.dueAt = nextDueAt.toISOString();
  row.sentAt = null;
  row.followUpCount = Number(row.followUpCount || 0) + 1;
  writeRows(rows);
  return { ...row, invalidTime: false, afterSeven };
}

function createArrivalReminderWorker({ botId, log, intervalMs = 60000 }) {
  let timer;
  async function resolveJid(sock, rawPhone) {
    const raw = String(rawPhone || "").replace(/\D/g, "");
    const candidates = raw.length === 10 ? [`52${raw}`, `521${raw}`] : [raw];
    for (const candidate of candidates) {
      const result = await sock.onWhatsApp(candidate);
      const match = Array.isArray(result) ? result.find(item => item?.exists && item?.jid) : null;
      if (match) return match.jid;
    }
    throw new Error("El numero del cliente no esta registrado en WhatsApp");
  }
  async function flush(sock) {
    if (botId !== "principal") return;
    const rows = readRows();
    const currentReservations = readCalendarReservations();
    let changed = false;
    for (const row of rows) {
      if (row.sentAt || Date.parse(row.dueAt) > Date.now()) continue;
      const reservation = currentReservations.find(item =>
        String(item.folio || "").toUpperCase() === String(row.folio || "").toUpperCase()
      );
      if (reservation?.arrivalAt) {
        row.sentAt = new Date().toISOString();
        row.skippedBecauseArrivedAt = row.sentAt;
        changed = true;
        continue;
      }
      const arrivalTime = row.updatedArrivalTime || row.hora;
      const parsedArrival = parseHour(arrivalTime);
      const afterSeven = Boolean(parsedArrival && (parsedArrival.hour > 19 || (parsedArrival.hour === 19 && parsedArrival.minute > 0)));
      const text = [
        `Hola ${row.nombre || ""}, ¿aun utilizaras tu reservacion *${row.folio}*?`,
        `Tu hora estimada de llegada era ${arrivalTime}. Responde *CONFIRMAR ${row.folio}* para indicar una nueva hora.`,
        afterSeven ? "Las llegadas despues de las 7:00 p.m. estan sujetas a disponibilidad si la reserva no esta pagada." : "",
        afterSeven && row.paymentUrl ? `Para garantizarla puedes pagar aqui:\n${row.paymentUrl}` : ""
      ].filter(Boolean).join("\n\n");
      try {
        const jid = await resolveJid(sock, row.telefono);
        await sock.sendMessage(jid, { text });
        row.sentAt = new Date().toISOString();
        changed = true;
      } catch (error) {
        log({ usuario: "Sistema", modulo: "Reservas", accion: `Fallo recordatorio ${row.folio}: ${error.message}` });
      }
    }
    if (changed) writeRows(rows);
  }
  return {
    start(sock) { clearInterval(timer); flush(sock); timer = setInterval(() => flush(sock), intervalMs); },
    stop() { clearInterval(timer); }
  };
}

module.exports = {
  scheduleArrivalReminder,
  createArrivalReminderWorker,
  requestNewArrivalTime,
  recordNewArrivalTime
};
