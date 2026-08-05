const crypto = require("crypto");

function toIsoDate(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) throw new Error(`Fecha invalida: ${text}`);
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function addDays(iso, days) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function numericRate(value) {
  const clean = String(value || "").replace(/[^0-9.]/g, "");
  return clean ? Number(clean) : null;
}

function normalizeRoomType(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("suite") && text.includes("king")) return "Suite King";
  if (text.includes("suite")) return "Doble Suite";
  if (text.includes("king")) return "King";
  return "Doble";
}

async function sendReservationToPortal(reservation = {}) {
  const endpoint = String(process.env.RESERVATION_PORTAL_API_URL || "").trim();
  const apiKey = String(process.env.RESERVATION_PORTAL_API_KEY || "").trim();
  const signingSecret = String(process.env.RESERVATION_PORTAL_SIGNING_SECRET || "").trim();
  if (!endpoint || !apiKey || !signingSecret) {
    throw new Error("Falta configurar la API segura de pagos en el .env del bot");
  }

  const dates = Array.isArray(reservation.dates) ? reservation.dates.filter(Boolean) : [];
  const arrivalDate = toIsoDate(dates[0] || reservation.fecha);
  const nights = Math.max(Number(reservation.noches || dates.length - 1 || 1), 1);
  const departureDate = dates.length > 1 ? toIsoDate(dates[dates.length - 1]) : addDays(arrivalDate, nights);
  const folio = String(reservation.folio || "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{2,29}$/.test(folio)) {
    throw new Error("La reserva necesita un folio valido de hasta 30 caracteres");
  }

  const payload = {
    externalId: String(reservation.sourceKey || folio),
    folio,
    guestName: String(reservation.nombre || "").trim(),
    phone: String(reservation.telefono || "").trim(),
    guestEmail: String(reservation.email || "").trim().toLowerCase(),
    arrivalDate,
    departureDate,
    nights,
    rooms: Math.max(Number(reservation.habitaciones || 1), 1),
    adults: Math.max(Number(reservation.adultos || 0), 0),
    children: Math.max(Number(reservation.ninos || 0), 0),
    roomType: normalizeRoomType(reservation.tipo),
    rate: numericRate(reservation.tarifa),
    arrivalTime: String(reservation.hora || "").trim(),
    source: "telefono-dashboard",
    note: String(reservation.note || "").trim()
  };
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac("sha256", signingSecret)
    .update(`${timestamp}.${rawBody}`).digest("hex");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": String(reservation.sourceKey || folio).slice(0, 191),
      "X-Timestamp": timestamp,
      "X-Signature": signature
    },
    body: rawBody,
    signal: AbortSignal.timeout(15000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `API de pagos respondio HTTP ${response.status}`);
  return {
    ...result,
    folio: result.folio || folio,
    paymentUrl: result.paymentUrl || `${String(process.env.RESERVATION_PORTAL_PAYMENT_BASE_URL || "").replace(/\/$/, "")}/${encodeURIComponent(folio)}`
  };
}

module.exports = { sendReservationToPortal };
