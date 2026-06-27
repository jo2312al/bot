const http = require("http");
const fs = require("fs");
const path = require("path");
const {
  URL
} = require("url");
const QRCode =
  require("qrcode");
const PDFDocument =
  require("pdfkit");
const {
  HOTEL_RATE_OPTIONS,
  HOTEL_ROOM_NUMBERS,
  hotelRateOptionsHtml
} = require("./constants/hotelCatalog");
const {
  readReservations,
  getRoomLimits,
  normalizeRoomType,
  cancelRoomReservationByFolio
} = require("./services/roomInventoryService");
const {
  closeDateRange,
  getMexicoTodayIso,
  openDate,
  openDateRange,
  readClosedDates
} = require("./services/closedDatesService");
const {
  analyzeRackCsv,
  analyzeRackImage,
  readLatestRackStatus,
  updateRackRoomStatus
} = require("./services/rackAnalysisService");
const {
  readBotStatus,
  readBotStatuses
} = require("./services/botStatusService");
const {
  TOTAL_ROOMS,
  readGroupReservations,
  buildGroupReservationCalendar
} = require("./services/groupReservationLogService");
const {
  cancelCalendarReservationByKey,
  readCalendarReservations,
  saveCalendarReservation,
  updateCalendarReservation
} = require("./services/reservationDatabaseService");
const {
  enqueueReservationGroupNotification
} = require("./services/groupReservationNotificationService");
const {
  createRoomBlockService
} = require("./services/roomBlockService");
const {
  createDashboardSearchService
} = require("./services/dashboardSearchService");
const {
  applyReservationPricing
} = require("./services/reservationPricingService");
const {
  EVENT_HALLS,
  getEventVoucher,
  getQuotation,
  getReservationNoteKey,
  readEventBookings,
  readQuotationMenu,
  readQuotations,
  readReservationNotes,
  saveEventBooking,
  saveEventVoucher,
  saveQuotationMenu,
  saveQuotation,
  saveReservationNote
} = require("./services/dashboardExtrasService");
const mysql =
  require("./services/mysqlCliService");
const {
  readRoomBlocks,
  saveRoomBlock
} = createRoomBlockService(mysql);
let dashboardSearchService =
  null;

const PORT =
  Number(process.env.DASHBOARD_PORT || 3333);

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function buildOccupancy(reservations) {
  const limits =
    getRoomLimits();

  const occupancy =
    {};

  const roomTypes =
    Object.keys(limits);

  reservations
    .filter(reservation =>
      reservation.status !== "cancelada"
    )
    .forEach(reservation => {
      const dates =
        Array.isArray(reservation.dates)
          ? reservation.dates
          : [reservation.fecha];

      dates.forEach(date => {
        if (!occupancy[date]) {
          occupancy[date] = {
            date,
            counts:
              Object.fromEntries(
                roomTypes.map(type => [
                  type,
                  0
                ])
              ),
            limits
          };
        }

        const type =
          normalizeRoomType(
            reservation.habitacion || reservation.tipo
          );

        if (occupancy[date].counts[type] !== undefined) {
          occupancy[date].counts[type] +=
            reservation.habitaciones || 1;
        }
      });
    });

  return Object.values(occupancy)
    .sort((left, right) =>
      dateValue(left.date) - dateValue(right.date)
    );
}

function attachReservationNotes(reservations, notes) {
  return reservations.map(reservation => {
    const key =
      getReservationNoteKey(reservation);
    const note =
      notes[key]?.note || "";

    return {
      ...reservation,
      note
    };
  });
}

function buildOverbookingAlerts(occupancy, todayDisplay) {
  return occupancy
    .filter(row =>
      dateValue(row.date) >= dateValue(todayDisplay)
    )
    .flatMap(row =>
      Object.keys(row.limits || {})
        .filter(type =>
          Number(row.counts?.[type] || 0) > Number(row.limits?.[type] || 0)
        )
        .map(type => ({
          date:
            row.date,
          type,
          used:
            Number(row.counts?.[type] || 0),
          limit:
            Number(row.limits?.[type] || 0),
          excess:
            Number(row.counts?.[type] || 0) - Number(row.limits?.[type] || 0)
        }))
    );
}

function buildTodayArrivals(reservations, todayDisplay) {
  return reservations
    .filter(reservation =>
      reservation.status !== "cancelada"
      &&
      (
        reservation.fecha === todayDisplay
        ||
        (
          Array.isArray(reservation.dates)
          &&
          reservation.dates[0] === todayDisplay
        )
      )
    )
    .sort((left, right) =>
      String(left.hora || "").localeCompare(String(right.hora || ""))
    );
}

function dateValue(value) {
  const [
    day,
    month,
    year
  ] =
    String(value || "")
      .split("/")
      .map(Number);

  return new Date(
    year,
    month - 1,
    day
  )
    .getTime();
}

function isoToDisplayDate(value) {
  const [
    year,
    month,
    day
  ] =
    String(value || "")
      .split("-")
      .map(Number);

  if (!day || !month || !year) {
    return "";
  }

  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

function getDatesBetween(startDisplay, endDisplay) {
  const start =
    dateValue(startDisplay);
  const end =
    dateValue(endDisplay || startDisplay);

  if (
    Number.isNaN(start)
    ||
    Number.isNaN(end)
    ||
    end < start
  ) {
    return [];
  }

  const dates =
    [];

  const current =
    new Date(start);

  const final =
    new Date(end);

  while (current <= final) {
    dates.push(
      `${String(current.getDate()).padStart(2, "0")}/${String(current.getMonth() + 1).padStart(2, "0")}/${current.getFullYear()}`
    );

    current.setDate(
      current.getDate() + 1
    );
  }

  return dates;
}

function normalizeManualReservation(input) {
  const pricedInput =
    applyReservationPricing(input);
  const fecha =
    String(pricedInput.fecha || "").includes("-")
      ? isoToDisplayDate(pricedInput.fecha)
      : String(pricedInput.fecha || "").trim();

  const fechaSalida =
    pricedInput.fechaSalida
      ? (
        String(pricedInput.fechaSalida).includes("-")
          ? isoToDisplayDate(pricedInput.fechaSalida)
          : String(pricedInput.fechaSalida).trim()
      )
      : fecha;

  const dates =
    getDatesBetween(
      fecha,
      fechaSalida
    );

  if (!pricedInput.nombre || !fecha || !dates.length) {
    throw new Error("Nombre y fecha valida son requeridos");
  }

  const sourceKey =
    pricedInput.sourceKey
    ||
    `manual:${Date.now()}:${Math.random().toString(16).slice(2)}`;

  return {
    source:
      pricedInput.source || "manual",
    sourceKey,
    folio:
      pricedInput.folio || sourceKey.replace("manual:", "M-").slice(0, 18),
    timestamp:
      new Date().toISOString(),
    nombre:
      String(pricedInput.nombre || "").trim(),
    telefono:
      String(pricedInput.telefono || "").trim(),
    fecha:
      dates[0],
    dates,
    habitaciones:
      Math.max(Number(pricedInput.habitaciones || 1), 1),
    adultos:
      Math.max(Number(pricedInput.adultos || 0), 0),
    ninos:
      Math.max(Number(pricedInput.ninos || 0), 0),
    tipo:
      normalizeRoomType(
        String(pricedInput.tipo || pricedInput.habitacion || "").trim()
      ),
    tarifa:
      String(pricedInput.tarifa || "").trim(),
    extraAdults:
      Math.max(Number(pricedInput.extraAdults || 0), 0),
    extraAmount:
      Math.max(Number(pricedInput.extraAmount || 0), 0),
    mananera:
      Boolean(pricedInput.mananera),
    hora:
      String(pricedInput.hora || "").trim(),
    note:
      String(pricedInput.note || "").trim(),
    raw:
      pricedInput.raw || "Captura manual",
    status:
      "activa"
  };
}

function parseCsv(text) {
  const rows =
    [];

  let row =
    [];
  let value =
    "";
  let quoted =
    false;

  for (let index = 0; index < String(text || "").length; index++) {
    const char =
      text[index];
    const next =
      text[index + 1];

    if (
      char === "\""
      &&
      quoted
      &&
      next === "\""
    ) {
      value += "\"";
      index++;
      continue;
    }

    if (char === "\"") {
      quoted =
        !quoted;
      continue;
    }

    if (
      char === ","
      &&
      !quoted
    ) {
      row.push(value);
      value = "";
      continue;
    }

    if (
      (char === "\n" || char === "\r")
      &&
      !quoted
    ) {
      if (
        char === "\r"
        &&
        next === "\n"
      ) {
        index++;
      }

      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value);
  rows.push(row);

  return rows.filter(items =>
    items.some(item =>
      String(item).trim()
    )
  );
}

function csvValue(value) {
  const text =
    String(value || "");

  return /[",\n\r]/.test(text)
    ? `"${text.replace(/"/g, "\"\"")}"`
    : text;
}

function htmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCurrency(value) {
  return Number(value || 0)
    .toLocaleString("es-MX", {
      style:
        "currency",
      currency:
        "MXN"
    });
}

function quoteNeedsCategory(quotation, category) {
  return quotation.sections
    .some(section =>
      section.category === category
    );
}

function quotePrimaryImage(quotation) {
  if (
    quoteNeedsCategory(
      quotation,
      "salon"
    )
  ) {
    return "/media/salones/1.jpg";
  }

  if (
    quoteNeedsCategory(
      quotation,
      "alimentos"
    )
  ) {
    return "/media/restaurant/1.jpg";
  }

  if (
    quoteNeedsCategory(
      quotation,
      "habitaciones"
    )
  ) {
    return "/media/habitaciones/1.jpg";
  }

  return "/media/lobby/1.jpg";
}

function quoteIncludedServices(quotation) {
  const services =
    [
      "Recepcion 24 horas",
      "Estacionamiento",
      "Internet",
      "Television por cable",
      "Agua fria y caliente"
    ];

  if (
    quoteNeedsCategory(
      quotation,
      "alimentos"
    )
    ||
    quoteNeedsCategory(
      quotation,
      "habitaciones"
    )
  ) {
    services.push("Restaurante");
  }

  if (
    quoteNeedsCategory(
      quotation,
      "salon"
    )
  ) {
    services.push("Salon para evento");
  }

  return services;
}

function quotationPrintHtml(quotation) {
  return quotation.template === "formal"
    ? quotationFormalPrintHtml(quotation)
    : quotationVisualPrintHtml(quotation);
}

function quotationFormalPrintHtml(quotation) {
  const title =
    quotation.headline
    ||
    quotation.eventName
    ||
    "Cotizacion";
  const serviceChargePercent =
    Number(quotation.serviceChargePercent || 0);

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${htmlEscape(quotation.id)} - Cotizacion formal</title>
  <style>
    :root {
      --brown: #4a2b22;
      --gold: #b88422;
      --line: #d9c4a4;
      --paper: #fffdf9;
      --muted: #6f6259;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: #eee7dd; color: #241711; font-family: Arial, sans-serif; }
    .page { width: min(920px, 100%); margin: 24px auto; background: var(--paper); border: 1px solid var(--line); box-shadow: 0 18px 50px rgba(74,43,34,.16); }
    .print-actions { position: sticky; top: 0; text-align: right; padding: 10px; background: #ffffff; border-bottom: 1px solid var(--line); }
    button { background: var(--brown); border: 1px solid var(--brown); color: #ffffff; border-radius: 8px; padding: 10px 14px; font-weight: 700; cursor: pointer; }
    .content { padding: 38px 46px 44px; }
    .header { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 24px; align-items: start; padding-bottom: 22px; border-bottom: 3px solid var(--gold); }
    .brand img { width: 220px; max-width: 100%; display: block; }
    .folio { text-align: right; color: var(--muted); }
    h1 { margin: 28px 0 8px; color: var(--brown); font-size: 30px; text-transform: uppercase; letter-spacing: .08em; }
    h2 { margin: 0 0 20px; color: #8f1236; font-size: 24px; }
    .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 22px; }
    .box { border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: #fff8ed; }
    .label { color: var(--muted); font-size: 12px; text-transform: uppercase; font-weight: 800; letter-spacing: .04em; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { background: var(--brown); color: #ffffff; padding: 11px 9px; text-align: left; font-size: 13px; text-transform: uppercase; }
    td { border: 1px solid var(--line); padding: 10px 9px; vertical-align: top; }
    td.num, th.num { text-align: right; }
    .totals { width: min(360px, 100%); margin-left: auto; margin-top: 18px; border: 1px solid var(--line); }
    .totals div { display: flex; justify-content: space-between; gap: 16px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
    .totals div:last-child { border-bottom: 0; background: #fff1d6; color: #8f1236; font-size: 22px; font-weight: 900; }
    .notes { margin-top: 22px; border-top: 1px solid var(--line); padding-top: 16px; color: var(--muted); line-height: 1.5; }
    @media print { body { background: #ffffff; } .page { width: 100%; margin: 0; box-shadow: none; } .print-actions { display: none; } }
    @media (max-width: 720px) { .content { padding: 24px; } .header, .meta { grid-template-columns: 1fr; } .folio { text-align: left; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="print-actions"><button onclick="window.print()">Imprimir / guardar PDF</button></div>
    <main class="content">
      <section class="header">
        <div class="brand"><img src="/media/logo-villa-margaritas.png" alt="Hotel Villa Margaritas"></div>
        <div class="folio">
          <strong>${htmlEscape(quotation.id)}</strong><br>
          ${new Date(quotation.createdAt || Date.now()).toLocaleDateString("es-MX")}
        </div>
      </section>
      <h1>Cotizacion</h1>
      <h2>${htmlEscape(title)}</h2>
      <section class="meta">
        <div class="box"><div class="label">Cliente</div><strong>${htmlEscape(quotation.client)}</strong></div>
        <div class="box"><div class="label">Contacto</div><strong>${htmlEscape(quotation.contact || "-")}</strong></div>
        <div class="box"><div class="label">Fechas / evento</div><strong>${htmlEscape(quotation.stayDates || quotation.eventName || "-")}</strong></div>
        <div class="box"><div class="label">Personas</div><strong>${quotation.people ? htmlEscape(quotation.people) : "-"}</strong></div>
      </section>
      <table>
        <thead>
          <tr><th>Concepto</th><th>Descripcion</th><th class="num">Cantidad</th><th class="num">Precio unitario</th><th class="num">Subtotal</th></tr>
        </thead>
        <tbody>
          ${quotation.sections.map(section => `
            <tr>
              <td><strong>${htmlEscape(section.title)}</strong><br><span class="label">${htmlEscape(section.category)}</span></td>
              <td>${htmlEscape(section.includes || "-").replace(/\n/g, "<br>")}</td>
              <td class="num">${htmlEscape(section.quantity)}</td>
              <td class="num">${formatCurrency(section.unitPrice)}</td>
              <td class="num"><strong>${formatCurrency(section.subtotal)}</strong></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <section class="totals">
        <div><span>Subtotal</span><strong>${formatCurrency(quotation.subtotal || quotation.total)}</strong></div>
        ${serviceChargePercent && quotation.serviceCharge ? `<div><span>Servicio ${serviceChargePercent}% alimentos</span><strong>${formatCurrency(quotation.serviceCharge)}</strong></div>` : ""}
        <div><span>Total estimado</span><strong>${formatCurrency(quotation.total)}</strong></div>
      </section>
      <section class="notes">
        <strong>Notas:</strong><br>
        Cotizacion informativa, no fiscal. Tarifa sujeta a disponibilidad y valida unicamente para las fechas indicadas.
        ${quotation.notes ? `<br>${htmlEscape(quotation.notes).replace(/\n/g, "<br>")}` : ""}
      </section>
    </main>
  </div>
</body>
</html>`;
}

function quotationVisualPrintHtml(quotation) {
  const title =
    quotation.headline
    ||
    quotation.eventName
    ||
    "Cotizacion";
  const primaryImage =
    quotePrimaryImage(quotation);
  const services =
    quoteIncludedServices(quotation);
  const serviceChargePercent =
    Number(quotation.serviceChargePercent || 0);

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${htmlEscape(quotation.id)} - Cotizacion</title>
  <style>
    :root {
      --gold: #b88422;
      --gold-light: #e0b556;
      --brown: #4a2b22;
      --wine: #8f1236;
      --paper: #fffdf9;
      --ink: #241711;
      --muted: #775c4e;
      --line: #d8ad58;
      --soft: #fff7ea;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #efe7db;
      color: var(--ink);
      font-family: Georgia, 'Times New Roman', serif;
    }
    .page {
      width: min(920px, 100%);
      margin: 18px auto;
      background:
        radial-gradient(circle at 50% 0%, rgba(224, 181, 86, .13), transparent 32%),
        var(--paper);
      border: 4px solid var(--gold);
      box-shadow: 0 24px 70px rgba(74, 43, 34, .2);
    }
    .print-actions {
      position: sticky;
      top: 0;
      z-index: 2;
      padding: 10px;
      text-align: right;
      background: #ffffff;
      border-bottom: 1px solid #ead7b2;
    }
    button {
      border: 1px solid var(--gold);
      background: var(--brown);
      color: #ffffff;
      border-radius: 8px;
      padding: 10px 14px;
      font-weight: 700;
      cursor: pointer;
    }
    .content {
      padding: 34px 54px 42px;
    }
    .brand {
      text-align: center;
      margin-bottom: 14px;
    }
    .brand img {
      width: 360px;
      max-width: 78%;
      display: block;
      margin: 0 auto;
    }
    .divider-title {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 20px;
      align-items: center;
      margin: 26px 0 10px;
      color: var(--brown);
      font-family: Arial, sans-serif;
      font-size: 42px;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .divider-title:before,
    .divider-title:after {
      content: "";
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--gold), transparent);
    }
    .headline {
      color: var(--wine);
      text-align: center;
      font-size: 36px;
      font-weight: 800;
      margin: 8px auto 18px;
      max-width: 760px;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      border: 1px solid var(--line);
      border-radius: 14px;
      overflow: hidden;
      margin-bottom: 22px;
      background: rgba(255, 247, 234, .68);
    }
    .summary .box {
      border: 0;
      border-right: 1px solid #e9c47c;
      border-radius: 0;
      background: transparent;
      padding: 16px;
    }
    .summary .box:last-child { border-right: 0; }
    .label {
      color: var(--wine);
      font-family: Arial, sans-serif;
      font-size: 14px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .value {
      font-family: Arial, sans-serif;
      font-size: 22px;
      font-weight: 800;
      margin-top: 4px;
    }
    .main-grid {
      display: grid;
      grid-template-columns: .78fr 1.22fr;
      gap: 28px;
      align-items: start;
      margin-top: 18px;
    }
    .price-card {
      border-top: 2px dashed var(--gold);
      border-bottom: 2px dashed var(--gold);
      padding: 20px 0;
      margin-bottom: 18px;
    }
    .price-card strong {
      display: block;
      color: var(--wine);
      font-family: Arial, sans-serif;
      font-size: 44px;
      line-height: 1;
      margin-top: 8px;
    }
    .schedule {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 16px;
      background: rgba(255, 247, 234, .68);
    }
    .schedule h2,
    .services h2 {
      color: var(--wine);
      font-family: Arial, sans-serif;
      font-size: 22px;
      margin: 0 0 12px;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .hero-photo {
      width: 100%;
      aspect-ratio: 16 / 10;
      object-fit: cover;
      border: 9px solid #ffffff;
      box-shadow: 0 8px 22px rgba(74, 43, 34, .22);
    }
    .services {
      margin-top: 18px;
    }
    .services ul {
      list-style: none;
      padding: 0;
      margin: 0;
      columns: 2;
    }
    .services li {
      break-inside: avoid;
      margin: 7px 0;
      font-size: 18px;
    }
    .services li:before {
      content: "✦";
      color: var(--gold);
      margin-right: 10px;
      font-weight: 900;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 24px;
      font-family: Arial, sans-serif;
      border: 1px solid var(--wine);
      overflow: hidden;
    }
    th {
      background: linear-gradient(180deg, #9f163d, #780b2b);
      color: #ffffff;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: .04em;
      padding: 10px;
    }
    td {
      border: 1px solid #c8798d;
      padding: 10px;
      text-align: center;
      vertical-align: top;
      font-size: 15px;
    }
    td:first-child,
    td:nth-child(2) {
      text-align: left;
    }
    .total-row td {
      background: #fff5e7;
      font-size: 20px;
      font-weight: 900;
    }
    .total-row .grand {
      background: linear-gradient(180deg, #9f163d, #780b2b);
      color: #ffffff;
      font-size: 28px;
      text-align: center;
    }
    .muted { color: var(--muted); }
    .note {
      border: 1px solid var(--wine);
      border-radius: 10px;
      padding: 12px 16px;
      margin-top: 16px;
      color: var(--wine);
      font-size: 18px;
      font-weight: 700;
    }
    .contact {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 22px;
      font-size: 22px;
      color: var(--wine);
      font-weight: 900;
    }
    .contact span {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: #28b45b;
      color: #ffffff;
      font-family: Arial, sans-serif;
    }
    @media print {
      body { background: #ffffff; }
      .page { margin: 0; width: 100%; box-shadow: none; }
      .print-actions { display: none; }
    }
    @media (max-width: 760px) {
      .content { padding: 24px; }
      .summary,
      .main-grid {
        grid-template-columns: 1fr;
      }
      .summary .box {
        border-right: 0;
        border-bottom: 1px solid #e9c47c;
      }
      .services ul { columns: 1; }
      .divider-title { font-size: 30px; }
      .headline { font-size: 28px; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="print-actions"><button onclick="window.print()">Imprimir / guardar PDF</button></div>
    <main class="content">
      <section class="brand">
        <img src="/media/logo-villa-margaritas.png" alt="Hotel Villa Margaritas">
      </section>
      <div class="divider-title"><span>Cotizacion</span></div>
      <div class="headline">${htmlEscape(title)}</div>
      <section class="summary">
        <div class="box">
          <div class="label">Para</div>
          <div class="value">${htmlEscape(quotation.client)}</div>
        </div>
        <div class="box">
          <div class="label">Fechas / evento</div>
          <div class="value">${htmlEscape(quotation.stayDates || quotation.eventName || "-")}</div>
        </div>
        <div class="box">
          <div class="label">Personas</div>
          <div class="value">${quotation.people ? htmlEscape(quotation.people) : "-"}</div>
        </div>
      </section>
      <section class="main-grid">
        <div>
          <div class="price-card">
            <div class="muted">Subtotal antes de servicio</div>
            <strong>${formatCurrency(quotation.subtotal || quotation.total)}</strong>
            ${serviceChargePercent && quotation.serviceCharge ? `<div class="muted">+ ${serviceChargePercent}% de servicio sobre alimentos: ${formatCurrency(quotation.serviceCharge)}</div>` : ""}
          </div>
          <div class="schedule">
            <h2>Horarios</h2>
            <div><span class="label">Check-in</span><div class="value">${htmlEscape(quotation.checkIn || "3:00 PM")}</div></div>
            <hr>
            <div><span class="label">Check-out</span><div class="value">${htmlEscape(quotation.checkOut || "12:00 PM")}</div></div>
          </div>
          <div class="contact"><span>☎</span>993 205 4701</div>
        </div>
        <div>
          <img class="hero-photo" src="${primaryImage}" alt="Hotel Villa Margaritas">
          <div class="services">
            <h2>Servicios incluidos</h2>
            <ul>
              ${services.map(service => `<li>${htmlEscape(service)}</li>`).join("")}
            </ul>
          </div>
        </div>
      </section>
      <table>
        <thead>
          <tr><th>Concepto</th><th>Incluye</th><th>Cantidad</th><th>Precio unitario</th><th>Subtotal</th></tr>
        </thead>
        <tbody>
          ${quotation.sections.map(section => `
            <tr>
              <td><strong>${htmlEscape(section.title)}</strong><br><span class="muted">${htmlEscape(section.category)}</span></td>
              <td>${htmlEscape(section.includes || "-").replace(/\n/g, "<br>")}</td>
              <td>${htmlEscape(section.quantity)}</td>
              <td>${formatCurrency(section.unitPrice)}</td>
              <td><strong>${formatCurrency(section.subtotal)}</strong></td>
            </tr>
          `).join("")}
          ${serviceChargePercent && quotation.serviceCharge ? `
            <tr>
              <td><strong>Servicio</strong></td>
              <td>${serviceChargePercent}% de servicio sobre alimentos</td>
              <td>1</td>
              <td>${formatCurrency(quotation.serviceCharge)}</td>
              <td><strong>${formatCurrency(quotation.serviceCharge)}</strong></td>
            </tr>
          ` : ""}
          <tr class="total-row">
            <td colspan="3">Total estimado</td>
            <td colspan="2" class="grand">${formatCurrency(quotation.total)}</td>
          </tr>
        </tbody>
      </table>
      <div class="note">
        Nota: Tarifa valida unicamente para las fechas indicadas.
        ${quotation.notes ? `<br>${htmlEscape(quotation.notes).replace(/\n/g, "<br>")}` : ""}
      </div>
    </main>
  </div>
</body>
</html>`;
}

function mediaFilePath(relativePath) {
  const mediaRoot =
    path.resolve(
      __dirname,
      "media"
    );
  const filePath =
    path.resolve(
      mediaRoot,
      String(relativePath || "").replace(/^\/media\//, "")
    );

  return filePath.startsWith(mediaRoot) && fs.existsSync(filePath)
    ? filePath
    : "";
}

function cleanPdfText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "");
}

function collectPdf(doc) {
  return new Promise((resolve, reject) => {
    const chunks =
      [];

    doc.on("data", chunk =>
      chunks.push(chunk)
    );
    doc.on("end", () =>
      resolve(Buffer.concat(chunks))
    );
    doc.on("error", reject);
    doc.end();
  });
}

function addPdfImage(doc, filePath, x, y, options) {
  if (!filePath) {
    return false;
  }

  try {
    doc.image(
      filePath,
      x,
      y,
      options
    );
    return true;
  } catch (error) {
    return false;
  }
}

function ensurePdfSpace(doc, y, needed) {
  if (y + needed <= doc.page.height - 54) {
    return y;
  }

  doc.addPage();
  return 54;
}

function drawPdfWrapped(doc, text, x, y, width, options = {}) {
  const height =
    doc.heightOfString(
      cleanPdfText(text),
      {
        width,
        ...options
      }
    );

  doc.text(
    cleanPdfText(text),
    x,
    y,
    {
      width,
      ...options
    }
  );

  return y + height;
}

function drawPdfQuoteTable(doc, quotation, startY, theme, options = {}) {
  let y =
    startY;
  const compact =
    Boolean(options.compact);
  const left =
    54;
  const widths =
    [
      108,
      194,
      62,
      78,
      86
    ];
  const headers =
    [
      "Concepto",
      "Descripcion",
      "Cant.",
      "P. unit.",
      "Subtotal"
    ];

  function drawHeader() {
    const headerHeight =
      compact ? 18 : 24;

    doc
      .rect(left, y, 528, headerHeight)
      .fill(theme.header);
    doc
      .fillColor("#ffffff")
      .font("Helvetica-Bold")
      .fontSize(8);

    let x =
      left;
    headers.forEach((header, index) => {
      doc.text(
        header,
        x + 5,
        y + (compact ? 5 : 8),
        {
          width:
            widths[index] - 10,
          align:
            index >= 2 ? "right" : "left"
        }
      );
      x += widths[index];
    });

    y += headerHeight;
  }

  drawHeader();

  quotation.sections.forEach(section => {
    const description =
      section.includes || "-";
    const rowHeight =
      Math.max(
        compact ? 32 : 48,
        doc.heightOfString(
          cleanPdfText(description),
          {
            width:
              widths[1] - 10
          }
        )
        +
        (compact ? 12 : 22)
      );

    y =
      ensurePdfSpace(
        doc,
        y,
        rowHeight + 42
      );

    if (y === 54) {
      drawHeader();
    }

    doc
      .rect(left, y, 528, rowHeight)
      .strokeColor(theme.line)
      .stroke();

    let x =
      left;
    widths.slice(0, -1).forEach(width => {
      x += width;
      doc
        .moveTo(x, y)
        .lineTo(x, y + rowHeight)
        .strokeColor(theme.line)
        .stroke();
    });

    x = left;
    doc
      .fillColor(theme.text)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(
        cleanPdfText(section.title),
        x + 5,
        y + (compact ? 5 : 8),
        {
          width:
            widths[0] - 10
        }
      )
      .font("Helvetica")
      .fontSize(7)
      .fillColor(theme.muted)
      .text(
        cleanPdfText(section.category),
        x + 5,
        y + (compact ? 18 : 23),
        {
          width:
            widths[0] - 10
        }
      );

    x += widths[0];
    doc
      .fillColor(theme.text)
      .font("Helvetica")
      .fontSize(8)
      .text(
        cleanPdfText(description),
        x + 5,
        y + (compact ? 5 : 8),
        {
          width:
            widths[1] - 10
        }
      );

    x += widths[1];
    [
      section.quantity,
      formatCurrency(section.unitPrice),
      formatCurrency(section.subtotal)
    ].forEach((value, index) => {
      doc
        .fillColor(theme.text)
        .font("Helvetica")
        .fontSize(8)
        .text(
          cleanPdfText(value),
          x + 5,
          y + (compact ? 5 : 8),
          {
            width:
              widths[index + 2] - 10,
            align:
              "right"
          }
        );
      x += widths[index + 2];
    });

    y += rowHeight;
  });

  if (quotation.serviceChargePercent && quotation.serviceCharge) {
    y =
      ensurePdfSpace(
        doc,
        y,
        40
      );
    doc
      .fillColor(theme.text)
      .font("Helvetica")
      .fontSize(9)
      .text(
        `Servicio ${quotation.serviceChargePercent}% alimentos`,
        left + 310,
        y + (compact ? 5 : 8),
        {
          width:
            120,
          align:
            "right"
        }
      )
      .font("Helvetica-Bold")
      .text(
        formatCurrency(quotation.serviceCharge),
        left + 438,
        y + (compact ? 5 : 8),
        {
          width:
            86,
          align:
            "right"
        }
      );
    y += compact ? 18 : 24;
  }

  y =
    ensurePdfSpace(
      doc,
      y,
      54
    );
  doc
    .rect(left, y, 528, compact ? 30 : 36)
    .fill(theme.total);
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(compact ? 13 : 15)
    .text(
      "TOTAL ESTIMADO",
      left + 14,
      y + (compact ? 8 : 10),
      {
        width:
          250
      }
    )
    .text(
      formatCurrency(quotation.total),
      left + 300,
      y + (compact ? 7 : 9),
      {
        width:
          210,
        align:
          "right"
      }
    );

  return y + (compact ? 40 : 52);
}

async function quotationPdfBuffer(quotation) {
  quotation =
    withComputedQuotationTotals(quotation);

  const doc =
    new PDFDocument({
      size:
        "LETTER",
      margin:
        0,
      info: {
        Title:
          `${quotation.id} - Cotizacion`,
        Author:
          "Hotel Villa Margaritas"
      }
    });

  if (quotation.template === "formal") {
    drawFormalQuotationPdf(
      doc,
      quotation
    );
  } else {
    drawVisualQuotationPdf(
      doc,
      quotation
    );
  }

  return collectPdf(doc);
}

function withComputedQuotationTotals(quotation) {
  const sections =
    Array.isArray(quotation.sections)
      ? quotation.sections.map(section => ({
        ...section,
        subtotal:
          Number(section.quantity || 0) * Number(section.unitPrice || 0)
      }))
      : [];
  const subtotal =
    sections.reduce(
      (total, section) => total + Number(section.subtotal || 0),
      0
    );
  const serviceChargeBase =
    sections.reduce(
      (total, section) =>
        section.category === "alimentos"
          ? total + Number(section.subtotal || 0)
          : total,
      0
    );
  const serviceChargePercent =
    Number(quotation.serviceChargePercent || 0);
  const serviceCharge =
    serviceChargeBase * serviceChargePercent / 100;

  return {
    ...quotation,
    sections,
    subtotal,
    serviceChargeBase,
    serviceCharge,
    total:
      subtotal + serviceCharge
  };
}

function drawFormalQuotationPdf(doc, quotation) {
  const theme = {
    text:
      "#241711",
    muted:
      "#6f6259",
    line:
      "#d9c4a4",
    header:
      "#4a2b22",
    total:
      "#8f1236"
  };
  const logo =
    mediaFilePath("/media/logo-villa-margaritas.png");
  const title =
    quotation.headline || quotation.eventName || "Cotizacion";

  doc
    .rect(26, 26, 560, 740)
    .strokeColor(theme.line)
    .lineWidth(1)
    .stroke();

  addPdfImage(
    doc,
    logo,
    54,
    44,
    {
      width:
        118
    }
  );

  doc
    .fillColor(theme.muted)
    .font("Helvetica")
    .fontSize(9)
    .text(
      cleanPdfText(new Date(quotation.createdAt || Date.now()).toLocaleDateString("es-MX")),
      390,
      58,
      {
        width:
          160,
        align:
          "right"
      }
    )
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(
      cleanPdfText(quotation.id),
      390,
      76,
      {
        width:
          160,
        align:
          "right"
      }
    );

  doc
    .moveTo(54, 166)
    .lineTo(558, 166)
    .strokeColor("#b88422")
    .lineWidth(2)
    .stroke();

  doc
    .fillColor(theme.header)
    .font("Helvetica-Bold")
    .fontSize(24)
    .text("COTIZACION", 54, 188)
    .fillColor("#8f1236")
    .fontSize(18)
    .text(cleanPdfText(title), 54, 219, {
      width:
        504
    });

  const metaY =
    266;
  [
    [
      "Cliente",
      quotation.client
    ],
    [
      "Contacto",
      quotation.contact || "-"
    ],
    [
      "Fechas / evento",
      quotation.stayDates || quotation.eventName || "-"
    ],
    [
      "Personas",
      quotation.people || "-"
    ]
  ].forEach((item, index) => {
    const x =
      54 + (index % 2) * 252;
    const y =
      metaY + Math.floor(index / 2) * 54;
    doc
      .rect(x, y, 238, 42)
      .fillAndStroke("#fff8ed", theme.line)
      .fillColor(theme.muted)
      .font("Helvetica-Bold")
      .fontSize(7)
      .text(item[0].toUpperCase(), x + 10, y + 8)
      .fillColor(theme.text)
      .fontSize(10)
      .text(cleanPdfText(item[1]), x + 10, y + 21, {
        width:
          218
      });
  });

  let y =
    drawPdfQuoteTable(
      doc,
      quotation,
      388,
      theme
    );

  y =
    ensurePdfSpace(doc, y, 90);

  doc
    .moveTo(54, y)
    .lineTo(558, y)
    .strokeColor(theme.line)
    .lineWidth(1)
    .stroke();
  y += 14;

  doc
    .fillColor(theme.muted)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("Notas:", 54, y);
  y += 14;
  drawPdfWrapped(
    doc,
    `Cotizacion informativa, no fiscal. Tarifa sujeta a disponibilidad y valida unicamente para las fechas indicadas.${quotation.notes ? `\n${quotation.notes}` : ""}`,
    54,
    y,
    504,
    {
      fontSize:
        9
    }
  );
}

function drawVisualQuotationPdf(doc, quotation) {
  const theme = {
    text:
      "#241711",
    muted:
      "#775c4e",
    line:
      "#d8ad58",
    header:
      "#8f1236",
    total:
      "#8f1236"
  };
  const logo =
    mediaFilePath("/media/logo-villa-margaritas.png");
  const image =
    mediaFilePath(quotePrimaryImage(quotation));
  const title =
    quotation.headline || quotation.eventName || "Cotizacion";
  const showSubtitle =
    cleanPdfText(title).toLowerCase() !== "cotizacion";
  const services =
    quoteIncludedServices(quotation);

  doc
    .rect(14, 14, 584, 764)
    .strokeColor("#b88422")
    .lineWidth(3)
    .stroke();

  addPdfImage(
    doc,
    logo,
    54,
    34,
    {
      width:
        132
    }
  );

  doc
    .fillColor("#4a2b22")
    .font("Helvetica-Bold")
    .fontSize(24)
    .text("COTIZACION", 226, 42, {
      width:
        320,
      align:
        "right"
    })
    .fillColor("#8f1236")
    .fontSize(15)
    .text(showSubtitle ? cleanPdfText(title) : cleanPdfText(quotation.id), 226, 74, {
      width:
        320,
      align:
        "right"
    })
    .fillColor(theme.muted)
    .font("Helvetica")
    .fontSize(9)
    .text(
      cleanPdfText(new Date(quotation.createdAt || Date.now()).toLocaleDateString("es-MX")),
      226,
      98,
      {
        width:
          320,
        align:
          "right"
      }
    );

  doc
    .moveTo(54, 132)
    .lineTo(558, 132)
    .strokeColor("#d8ad58")
    .lineWidth(1)
    .stroke();

  doc
    .roundedRect(72, 154, 468, 64, 8)
    .strokeColor("#d8ad58")
    .lineWidth(1)
    .stroke();

  [
    [
      "Para",
      quotation.client
    ],
    [
      "Fecha/evento",
      quotation.stayDates || quotation.eventName || "-"
    ],
    [
      "Personas",
      quotation.people || "-"
    ]
  ].forEach((item, index) => {
    const x =
      86 + index * 150;
    doc
      .fillColor("#8f1236")
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(item[0].toUpperCase(), x, 170, {
        width:
          132
      })
      .fillColor("#241711")
      .fontSize(11)
      .text(cleanPdfText(item[1]), x, 186, {
        width:
          132,
        height:
          24
      });
  });

  doc
    .fillColor(theme.muted)
    .font("Helvetica")
    .fontSize(10)
    .text("Subtotal antes de servicio", 54, 256)
    .fillColor("#8f1236")
    .font("Helvetica-Bold")
    .fontSize(26)
    .text(formatCurrency(quotation.subtotal || quotation.total), 54, 276, {
      width:
        190
    });

  if (quotation.serviceChargePercent && quotation.serviceCharge) {
    doc
      .fillColor(theme.muted)
      .font("Helvetica")
      .fontSize(9)
      .text(`+ ${quotation.serviceChargePercent}% servicio alimentos: ${formatCurrency(quotation.serviceCharge)}`, 54, 312, {
        width:
          190
      });
  }

  doc
    .roundedRect(54, 356, 180, 84, 8)
    .strokeColor(theme.line)
    .stroke()
    .fillColor("#8f1236")
    .font("Helvetica-Bold")
    .fontSize(14)
    .text("HORARIOS", 74, 372, {
      width:
        140,
      align:
        "center"
    })
    .fillColor(theme.text)
    .fontSize(10)
    .text(`Check-in: ${cleanPdfText(quotation.checkIn || "3:00 PM")}`, 74, 400)
    .text(`Check-out: ${cleanPdfText(quotation.checkOut || "12:00 PM")}`, 74, 420);

  addPdfImage(
    doc,
    image,
    270,
    244,
    {
      width:
        260,
      height:
        148
    }
  );

  doc
    .fillColor("#8f1236")
    .font("Helvetica-Bold")
    .fontSize(14)
    .text("SERVICIOS INCLUIDOS", 270, 410);

  services.slice(0, 7).forEach((service, index) => {
    doc
      .fillColor("#8f1236")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("-", 278, 434 + index * 13)
      .fillColor(theme.text)
      .font("Helvetica")
      .text(cleanPdfText(service), 292, 434 + index * 13, {
        width:
          220
      });
  });

  let y =
    drawPdfQuoteTable(
      doc,
      quotation,
      548,
      theme,
      {
        compact:
          true
      }
    );

  y =
    ensurePdfSpace(doc, y, 50);
  doc
    .roundedRect(54, y, 504, 34, 8)
    .strokeColor("#8f1236")
    .stroke()
    .fillColor("#8f1236")
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("Nota:", 70, y + 10)
    .font("Helvetica")
    .text(
      cleanPdfText(`Tarifa valida unicamente para las fechas indicadas.${quotation.notes ? ` ${quotation.notes}` : ""}`),
      104,
      y + 10,
      {
        width:
          420
      }
    );
}

function reservationsToCsv(reservations) {
  const headers = [
    "nombre",
    "telefono",
    "fecha",
    "fechaSalida",
    "habitaciones",
    "adultos",
    "ninos",
    "tipo",
    "hora",
    "tarifa",
    "nota",
    "folio",
    "fuente"
  ];

  const rows =
    reservations.map(reservation => {
      const dates =
        Array.isArray(reservation.dates)
          ? reservation.dates
          : [reservation.fecha];

      return [
        reservation.nombre,
        reservation.telefono,
        reservation.fecha,
        dates[dates.length - 1] || reservation.fecha,
        reservation.habitaciones || 1,
        reservation.adultos || 0,
        reservation.ninos || 0,
        reservation.tipo || reservation.habitacion || "",
        reservation.hora || "",
        reservation.tarifa || "",
        reservation.note || "",
        reservation.folio || "",
        reservation.source || ""
      ];
    });

  return [
    headers,
    ...rows
  ]
    .map(row =>
      row.map(csvValue).join(",")
    )
    .join("\n");
}

function filterReservationsByDisplayDate(reservations, displayDate) {
  const isoDate =
    displayDateToIso(displayDate);

  return reservations.filter(reservation => {
    const dates =
      Array.isArray(reservation.dates)
        ? reservation.dates
        : [reservation.fecha];

    return dates.some(date =>
      date === displayDate
      ||
      date === isoDate
      ||
      displayDateToIso(date) === isoDate
      ||
      isoToDisplayDate(date) === displayDate
    );
  });
}

function importReservationsFromCsv(csv) {
  const rows =
    parseCsv(csv);

  if (rows.length < 2) {
    throw new Error("El CSV debe incluir encabezados y al menos una reserva");
  }

  const headers =
    rows[0].map(normalizeCsvHeader);

  const imported =
    [];

  const errors =
    [];

  rows
    .slice(1)
    .forEach((row, index) => {
      const data =
        {};

      headers.forEach((header, columnIndex) => {
        data[header] =
          row[columnIndex] || "";
      });

      try {
        const reservation =
          normalizeManualReservation({
            source:
              "excel",
            sourceKey:
              data.folio
                ? `excel:${data.folio}:${index + 2}`
                : `excel:${data.nombre}:${data.fecha}:${data.telefono}:${index + 2}`,
            folio:
              data.folio,
            nombre:
              data.nombre,
            telefono:
              data.telefono,
            fecha:
              data.fecha,
            fechaSalida:
              data.fechasalida || data.salida || data.fecha,
            habitaciones:
              data.habitaciones || data.habs || data.hab,
            adultos:
              data.adultos,
            ninos:
              data.ninos || data.menores,
            tipo:
              data.tipo || data.habitacion,
            hora:
              data.hora,
            tarifa:
              data.tarifa,
            note:
              data.nota || data.note,
            raw:
              "Importado desde CSV"
          });

        saveCalendarReservation(reservation);
        if (reservation.note) {
          saveReservationNote({
            reservationKey: getReservationNoteKey(reservation),
            note: reservation.note
          });
        }
        imported.push(reservation);
      } catch (error) {
        errors.push(
          `Fila ${index + 2}: ${error.message}`
        );
      }
    });

  return {
    imported,
    errors
  };
}

function normalizeCsvHeader(header) {
  const key =
    String(header || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

  const aliases = {
    huesped:
      "nombre",
    cliente:
      "nombre",
    celular:
      "telefono",
    tel:
      "telefono",
    entrada:
      "fecha",
    fechaentrada:
      "fecha",
    salida:
      "fechasalida",
    fechasalida:
      "fechasalida",
    hab:
      "habitaciones",
    habs:
      "habitaciones",
    habitacion:
      "tipo",
    tipohabitacion:
      "tipo",
    menores:
      "ninos",
    ninos:
      "ninos",
    llegada:
      "hora",
    preciotarifa:
      "tarifa",
    precio:
      "tarifa",
    nota:
      "nota",
    note:
      "nota"
  };

  return aliases[key] || key;
}

function getSummary() {
  const notes =
    readReservationNotes();

  const reservations =
    attachReservationNotes(
      readReservations(),
      notes
    );

  const groupReservations =
    attachReservationNotes(
      readGroupReservations(),
      notes
    );

  const groupReservationCalendar =
    buildGroupReservationCalendar(
      groupReservations
    );

  const active =
    reservations.filter(reservation =>
      reservation.status !== "cancelada"
    );

  const canceled =
    reservations.filter(reservation =>
      reservation.status === "cancelada"
    );

  const today =
    getMexicoTodayIso();

  const todayDisplay =
    isoToDisplayDate(today);

  const todayReservationSummary =
    groupReservationCalendar.find(row =>
      row.date === todayDisplay
    );

  const occupancy =
    buildOccupancy(groupReservations);

  return {
    generatedAt:
      new Date().toISOString(),
    limits:
      getRoomLimits(),
    today:
      today,
    closedDates:
      readClosedDates(),
    totals: {
      reservations:
        reservations.length,
      groupReservations:
        groupReservations.length,
      active:
        active.length,
      canceled:
        canceled.length
    },
    todayReservations: {
      date:
        todayDisplay,
      occupied:
        todayReservationSummary?.occupied || 0,
      reservations:
        todayReservationSummary?.reservations?.length || 0
    },
    todayArrivals:
      buildTodayArrivals(
        groupReservations,
        todayDisplay
      ),
    overbookingAlerts:
      buildOverbookingAlerts(
        occupancy,
        todayDisplay
      ),
    occupancy:
      occupancy,
    groupReservationCalendar,
    groupReservations,
    quotations:
      readQuotations(),
    quotationMenu:
      readQuotationMenu(),
    eventHalls:
      EVENT_HALLS,
    eventBookings:
      readEventBookings(),
    roomBlocks:
      readRoomBlocks(),
    totalRooms:
      TOTAL_ROOMS,
    rackStatus:
      readLatestRackStatus(),
    reservations:
      reservations
        .slice()
        .reverse()
  };
}

function getDashboardSearchService() {
  if (!dashboardSearchService) {
    dashboardSearchService =
      createDashboardSearchService({
        mysql,
        getSummary
      });
  }

  return dashboardSearchService;
}

function normalizeReportMonth(value) {
  const match =
    String(value || "")
      .match(/^(\d{4})-(\d{2})$/);

  if (match) {
    return `${match[1]}-${match[2]}`;
  }

  return getMexicoTodayIso()
    .slice(0, 7);
}

function displayDateToIso(value) {
  const [
    day,
    month,
    year
  ] =
    String(value || "")
      .split("/")
      .map(Number);

  if (!day || !month || !year) {
    return "";
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getMonthRange(month) {
  const [year, monthNumber] =
    normalizeReportMonth(month)
      .split("-")
      .map(Number);
  const start =
    new Date(
      year,
      monthNumber - 1,
      1
    );
  const end =
    new Date(
      year,
      monthNumber,
      0
    );

  return {
    month:
      `${year}-${String(monthNumber).padStart(2, "0")}`,
    startIso:
      `${year}-${String(monthNumber).padStart(2, "0")}-01`,
    endIso:
      `${year}-${String(monthNumber).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`,
    start,
    end
  };
}

function getReports({ month } = {}) {
  const range =
    getMonthRange(month);

  if (mysql.ensureSchema()) {
    return getMysqlReports(range);
  }

  return getFallbackReports(range);
}

function getMysqlReports(range) {
  const monthStart =
    `${range.month}-01`;

  return {
    mode:
      "mysql",
    month:
      range.month,
    generatedAt:
      new Date().toISOString(),
    dailyOccupancy:
      mysql.queryJson(`
        SELECT JSON_OBJECT(
          'date', DATE_FORMAT(stay_date, '%d/%m/%Y'),
          'occupiedRoomNights', occupied_room_nights,
          'occupiedRooms', occupied_rooms,
          'occupancyPercent', occupancy_percent
        )
        FROM report_daily_occupancy
        WHERE stay_date BETWEEN ${mysql.quote(range.startIso)} AND ${mysql.quote(range.endIso)}
        ORDER BY stay_date;
      `),
    roomRotation:
      mysql.queryJson(`
        SELECT JSON_OBJECT(
          'monthStart', ${mysql.quote(monthStart)},
          'roomNumber', room.room_number,
          'roomType', rt.name,
          'occupiedNights', COUNT(DISTINCT rn.id),
          'lastOccupiedDate', IFNULL(DATE_FORMAT(MAX(rn.stay_date), '%d/%m/%Y'), ''),
          'lastDeepCleanDate', IFNULL(DATE_FORMAT(MAX(CASE WHEN ret.code = 'DEEP_CLEAN' THEN re.event_date END), '%d/%m/%Y'), ''),
          'lastAcMaintenanceDate', IFNULL(DATE_FORMAT(MAX(CASE WHEN ret.code = 'AC_MAINTENANCE' THEN re.event_date END), '%d/%m/%Y'), ''),
          'lastMaintenanceDate', IFNULL(DATE_FORMAT(MAX(CASE WHEN ret.code = 'MAINTENANCE' THEN re.event_date END), '%d/%m/%Y'), '')
        )
        FROM rooms room
        LEFT JOIN room_types rt ON rt.id = room.room_type_id
        LEFT JOIN reservation_room_nights rn
          ON rn.room_id = room.id
          AND rn.stay_date BETWEEN ${mysql.quote(range.startIso)} AND ${mysql.quote(range.endIso)}
        LEFT JOIN room_events re ON re.room_id = room.id
        LEFT JOIN room_event_types ret ON ret.id = re.event_type_id
        GROUP BY room.id, room.room_number, rt.name
        ORDER BY COUNT(DISTINCT rn.id) DESC, room.room_number;
      `),
    serviceDue:
      mysql.queryJson(`
        SELECT JSON_OBJECT(
          'roomNumber', room_number,
          'roomType', room_type,
          'lastDeepCleanDate', IFNULL(DATE_FORMAT(last_deep_clean_date, '%d/%m/%Y'), ''),
          'daysSinceDeepClean', IFNULL(days_since_deep_clean, 9999),
          'lastAcMaintenanceDate', IFNULL(DATE_FORMAT(last_ac_maintenance_date, '%d/%m/%Y'), ''),
          'daysSinceAcMaintenance', IFNULL(days_since_ac_maintenance, 9999),
          'occupiedNightsLast30Days', occupied_nights_last_30_days
        )
        FROM report_room_service_due
        ORDER BY occupied_nights_last_30_days DESC, days_since_deep_clean DESC, room_number;
      `),
    reservationsBySource:
      mysql.queryJson(`
        SELECT JSON_OBJECT(
          'monthStart', month_start,
          'source', source,
          'reservationsCount', reservations_count,
          'roomsReserved', rooms_reserved,
          'adultsCount', adults_count,
          'childrenCount', children_count
        )
        FROM report_reservations_by_source_month
        WHERE month_start = ${mysql.quote(monthStart)}
        ORDER BY reservations_count DESC;
      `),
    todayOccupancy:
      mysql.queryJson(`
        SELECT JSON_OBJECT(
          'roomNumber', room_number,
          'roomType', room_type,
          'occupancyStatus', occupancy_status,
          'folio', folio,
          'guestName', guest_name,
          'arrivalAt', IFNULL(DATE_FORMAT(arrival_at, '%Y-%m-%dT%H:%i:%s.000Z'), '')
        )
        FROM report_today_occupancy
        ORDER BY room_number;
      `),
    roomEvents:
      mysql.queryJson(`
        SELECT JSON_OBJECT(
          'id', e.id,
          'roomNumber', room.room_number,
          'eventType', t.name,
          'eventCode', t.code,
          'eventDate', DATE_FORMAT(e.event_date, '%d/%m/%Y'),
          'status', e.status,
          'title', e.title,
          'notes', e.notes,
          'cost', e.cost,
          'createdBy', e.created_by
        )
        FROM room_events e
        JOIN rooms room ON room.id = e.room_id
        JOIN room_event_types t ON t.id = e.event_type_id
        WHERE e.event_date BETWEEN ${mysql.quote(range.startIso)} AND ${mysql.quote(range.endIso)}
        ORDER BY e.event_date DESC, room.room_number;
      `),
    eventSummary:
      mysql.queryJson(`
        SELECT JSON_OBJECT(
          'hallName', hall.name,
          'eventsCount', COUNT(event.id),
          'quotationCount', SUM(event.status = 'cotizacion'),
          'bookedCount', SUM(event.status = 'apartado'),
          'paidCount', SUM(event.status = 'pago_completo'),
          'totalAmount', IFNULL(SUM(event.total_amount), 0),
          'paidAmount', IFNULL(SUM(event.paid_amount), 0),
          'pendingAmount', IFNULL(SUM(GREATEST(event.total_amount - event.paid_amount, 0)), 0)
        )
        FROM event_halls hall
        LEFT JOIN quote_events event
          ON event.hall_id = hall.id
          AND event.event_date BETWEEN ${mysql.quote(range.startIso)} AND ${mysql.quote(range.endIso)}
        GROUP BY hall.id, hall.name, hall.sort_order
        ORDER BY hall.sort_order;
      `),
    events:
      mysql.queryJson(`
        SELECT JSON_OBJECT(
          'id', event.id,
          'date', DATE_FORMAT(event.event_date, '%d/%m/%Y'),
          'isoDate', DATE_FORMAT(event.event_date, '%Y-%m-%d'),
          'hallName', hall.name,
          'client', event.client,
          'eventName', event.event_name,
          'status', event.status,
          'totalAmount', event.total_amount,
          'paidAmount', event.paid_amount,
          'pendingAmount', GREATEST(event.total_amount - event.paid_amount, 0)
        )
        FROM quote_events event
        JOIN event_halls hall ON hall.id = event.hall_id
        WHERE event.event_date BETWEEN ${mysql.quote(range.startIso)} AND ${mysql.quote(range.endIso)}
        ORDER BY event.event_date, hall.sort_order;
      `),
    roomEventTypes:
      mysql.queryJson(`
        SELECT JSON_OBJECT(
          'code', code,
          'name', name,
          'defaultIntervalDays', default_interval_days
        )
        FROM room_event_types
        ORDER BY name;
      `),
    rooms:
      mysql.queryJson(`
        SELECT JSON_OBJECT(
          'roomNumber', room_number
        )
        FROM rooms
        ORDER BY room_number;
      `)
  };
}

function getFallbackReports(range) {
  const summary =
    getSummary();
  const reservations =
    summary.groupReservations || [];
  const byDate =
    new Map();
  const roomRotation =
    new Map();

  reservations
    .filter(reservation =>
      reservation.status !== "cancelada"
    )
    .forEach(reservation => {
      const dates =
        Array.isArray(reservation.dates)
          ? reservation.dates
          : [reservation.fecha].filter(Boolean);
      const roomsCount =
        Number(reservation.habitaciones || 1);

      dates.forEach(displayDate => {
        const iso =
          displayDateToIso(displayDate);

        if (iso < range.startIso || iso > range.endIso) {
          return;
        }

        const current =
          byDate.get(displayDate)
          ||
          {
            date:
              displayDate,
            occupiedRoomNights:
              0,
            occupiedRooms:
              0,
            occupancyPercent:
              0
          };

        current.occupiedRoomNights += roomsCount;
        current.occupiedRooms += roomsCount;
        current.occupancyPercent =
          Number(((current.occupiedRooms / TOTAL_ROOMS) * 100).toFixed(2));
        byDate.set(
          displayDate,
          current
        );

        if (reservation.roomNumber) {
          const row =
            roomRotation.get(reservation.roomNumber)
            ||
            {
              roomNumber:
                reservation.roomNumber,
              roomType:
                reservation.tipo || "",
              occupiedNights:
                0,
              lastOccupiedDate:
                "",
              lastDeepCleanDate:
                "",
              lastAcMaintenanceDate:
                "",
              lastMaintenanceDate:
                ""
            };

          row.occupiedNights += 1;
          row.lastOccupiedDate =
            displayDate;
          roomRotation.set(
            reservation.roomNumber,
            row
          );
        }
      });
    });

  const rackRooms =
    readLatestRackStatus()?.rooms || [];
  const events =
    readEventBookings()
      .filter(event =>
        event.eventDate >= range.startIso
        &&
        event.eventDate <= range.endIso
      );

  return {
    mode:
      "fallback",
    month:
      range.month,
    generatedAt:
      new Date().toISOString(),
    dailyOccupancy:
      Array.from(byDate.values())
        .sort((left, right) =>
          dateValue(left.date) - dateValue(right.date)
        ),
    roomRotation:
      Array.from(roomRotation.values())
        .sort((left, right) =>
          Number(right.occupiedNights || 0) - Number(left.occupiedNights || 0)
        ),
    serviceDue:
      rackRooms.map(room => ({
        roomNumber:
          room.room,
        roomType:
          room.type,
        lastDeepCleanDate:
          "",
        daysSinceDeepClean:
          null,
        lastAcMaintenanceDate:
          "",
        daysSinceAcMaintenance:
          null,
        occupiedNightsLast30Days:
          0
      })),
    reservationsBySource:
      Object.values(
        reservations.reduce((acc, reservation) => {
          const source =
            reservation.source || "-";
          if (!acc[source]) {
            acc[source] = {
              source,
              reservationsCount:
                0,
              roomsReserved:
                0,
              adultsCount:
                0,
              childrenCount:
                0
            };
          }
          acc[source].reservationsCount++;
          acc[source].roomsReserved += Number(reservation.habitaciones || 1);
          acc[source].adultsCount += Number(reservation.adultos || 0);
          acc[source].childrenCount += Number(reservation.ninos || 0);
          return acc;
        }, {})
      ),
    todayOccupancy:
      rackRooms.map(room => ({
        roomNumber:
          room.room,
        roomType:
          room.type,
        occupancyStatus:
          ["OC", "OS", "OL", "OR", "OSE", "ND"].includes(room.status)
            ? "ocupada"
            : "libre",
        folio:
          "",
        guestName:
          "",
        arrivalAt:
          ""
      })),
    roomEvents:
      [],
    eventSummary:
      EVENT_HALLS.map(hall => {
        const hallEvents =
          events.filter(event =>
            event.hallCode === hall.code
          );
        return {
          hallName:
            hall.name,
          eventsCount:
            hallEvents.length,
          quotationCount:
            hallEvents.filter(event => event.status === "cotizacion").length,
          bookedCount:
            hallEvents.filter(event => event.status === "apartado").length,
          paidCount:
            hallEvents.filter(event => event.status === "pago_completo").length,
          totalAmount:
            hallEvents.reduce((total, event) => total + Number(event.totalAmount || 0), 0),
          paidAmount:
            hallEvents.reduce((total, event) => total + Number(event.paidAmount || 0), 0),
          pendingAmount:
            hallEvents.reduce((total, event) => total + Math.max(Number(event.totalAmount || 0) - Number(event.paidAmount || 0), 0), 0)
        };
      }),
    events:
      events.map(event => ({
        id:
          event.id,
        date:
          isoToDisplay(event.eventDate),
        isoDate:
          event.eventDate,
        hallName:
          event.hallName,
        client:
          event.client,
        eventName:
          event.eventName,
        status:
          event.status,
        totalAmount:
          event.totalAmount,
        paidAmount:
          event.paidAmount,
        pendingAmount:
          Math.max(Number(event.totalAmount || 0) - Number(event.paidAmount || 0), 0)
      })),
    roomEventTypes:
      [
        {
          code:
            "DEEP_CLEAN",
          name:
            "Limpieza profunda"
        },
        {
          code:
            "MAINTENANCE",
          name:
            "Mantenimiento general"
        },
        {
          code:
            "AC_MAINTENANCE",
          name:
            "Mantenimiento de clima"
        },
        {
          code:
            "OBSERVATION",
          name:
            "Nota de habitacion"
        }
      ],
    rooms:
      HOTEL_ROOM_NUMBERS.map(roomNumber => ({
        roomNumber
      }))
  };
}

function saveRoomEvent(input) {
  if (!mysql.ensureSchema()) {
    throw new Error("Activa MySQL para guardar historial de habitaciones");
  }

  const room =
    String(input.roomNumber || "")
      .replace(/\D/g, "");
  const eventCode =
    String(input.eventCode || "")
      .trim()
      .toUpperCase();
  const eventDate =
    String(input.eventDate || "")
      .trim();

  if (!room || !eventCode || !eventDate) {
    throw new Error("Habitacion, tipo y fecha son requeridos");
  }

  mysql.runSql(`
    INSERT INTO room_events (
      room_id,
      event_type_id,
      event_date,
      status,
      title,
      notes,
      cost,
      created_by
    ) VALUES (
      (SELECT id FROM rooms WHERE room_number = ${mysql.quote(room)}),
      (SELECT id FROM room_event_types WHERE code = ${mysql.quote(eventCode)}),
      ${mysql.quote(eventDate)},
      ${mysql.quote(input.status || "hecho")},
      ${mysql.quote(input.title || "")},
      ${mysql.quote(input.notes || "")},
      ${input.cost ? Number(input.cost) : "NULL"},
      ${mysql.quote(input.createdBy || "dashboard")}
    );
  `);

  return {
    ok:
      true
  };
}

function getReportCsv(type, report) {
  const selected =
    String(type || "all").trim();
  const sections = [];
  const addSection = (name, headers, rows) => {
    sections.push([name]);
    sections.push(headers);
    rows.forEach(row => sections.push(row));
    sections.push([]);
  };

  if (selected === "all" || selected === "occupancy") {
    addSection(
      "Ocupacion diaria",
      ["Fecha", "Habitaciones ocupadas", "Room nights", "Porcentaje"],
      (report.dailyOccupancy || []).map(row => [
        row.date || "",
        row.occupiedRooms || 0,
        row.occupiedRoomNights || row.occupiedRooms || 0,
        row.occupancyPercent || 0
      ])
    );
  }

  if (selected === "all" || selected === "rotation") {
    addSection(
      "Rotacion habitaciones",
      ["Habitacion", "Tipo", "Noches", "Ultima ocupacion", "Limpieza profunda", "Clima", "Mantenimiento"],
      (report.roomRotation || []).map(row => [
        row.roomNumber || "",
        row.roomType || "",
        row.occupiedNights || 0,
        row.lastOccupiedDate || "",
        row.lastDeepCleanDate || "",
        row.lastAcMaintenanceDate || "",
        row.lastMaintenanceDate || ""
      ])
    );
  }

  if (selected === "all" || selected === "sources") {
    addSection(
      "Reservas por fuente",
      ["Fuente", "Reservas", "Habitaciones", "Adultos", "Menores"],
      (report.reservationsBySource || []).map(row => [
        row.source || "",
        row.reservationsCount || 0,
        row.roomsReserved || 0,
        row.adultsCount || 0,
        row.childrenCount || 0
      ])
    );
  }

  if (selected === "all" || selected === "events") {
    addSection(
      "Eventos",
      ["Fecha", "Salon", "Cliente", "Evento", "Estado", "Total", "Pagado", "Pendiente"],
      (report.events || []).map(row => [
        row.date || "",
        row.hallName || "",
        row.client || "",
        row.eventName || "",
        row.status || "",
        row.totalAmount || 0,
        row.paidAmount || 0,
        row.pendingAmount || 0
      ])
    );
  }

  return "\uFEFF" +
    sections
      .map(row => row.map(csvValue).join(","))
      .join("\n");
}

async function getBotStatus() {
  const statuses =
    readBotStatuses();
  const instances =
    await Promise.all(
      Object.entries(statuses).map(async ([id, status]) => ({
        id,
        label:
          id === "nocturno" ? "Bot nocturno" : "Bot principal",
        ...status,
        qrDataUrl:
          status.qr
            ? await QRCode.toDataURL(
              status.qr,
              {
                margin: 1,
                width: 320
              }
            )
            : null
      }))
    );
  const primary =
    instances.find(instance => instance.id === "principal")
    || {
      ...readBotStatus(),
      qrDataUrl: null
    };

  return {
    ...primary,
    instances
  };
}

function pageHtml() {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hotel Villa Margaritas - Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fb;
      --panel: #ffffff;
      --text: #1f2937;
      --muted: #6b7280;
      --line: #d9dee8;
      --accent: #0f766e;
      --danger: #b91c1c;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Arial, Helvetica, sans-serif;
    }
    header {
      background: var(--panel);
      border-bottom: 1px solid var(--line);
      padding: 18px 24px;
      position: sticky;
      top: 0;
      z-index: 2;
    }
    h1 {
      font-size: 22px;
      margin: 0 0 4px;
    }
    main {
      padding: 20px 24px 40px;
      max-width: 1180px;
      margin: 0 auto;
    }
    .muted { color: var(--muted); }
    .grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 14px;
      margin-bottom: 18px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 18px;
    }
    .view-tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin: 0 0 16px;
    }
    .view-tabs button.active {
      background: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }
    .view-panel.hidden {
      display: none;
    }
    .metric {
      font-size: 30px;
      font-weight: 700;
      margin-top: 8px;
    }
    .limit-list {
      display: grid;
      gap: 4px;
      margin-top: 8px;
      font-size: 16px;
      font-weight: 700;
      line-height: 1.25;
    }
    .limit-list span {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      border-bottom: 1px solid #eef2f7;
      padding-bottom: 3px;
    }
    .bot-status {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: center;
    }
    .bot-status-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    .bot-status-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }
    .bot-status-card .bot-status {
      min-height: 118px;
    }
    .status-row {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      margin-top: 8px;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #9ca3af;
      display: inline-block;
    }
    .status-dot.open {
      background: #0f766e;
    }
    .status-dot.qr,
    .status-dot.close {
      background: #b91c1c;
    }
    .qr-box {
      display: grid;
      gap: 8px;
      justify-items: center;
      min-width: 210px;
    }
    .qr-box img {
      width: 210px;
      height: 210px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #ffffff;
      padding: 8px;
    }
    .hidden {
      display: none !important;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .global-search-panel {
      margin-top: 0;
      background: #f8fafc;
    }
    .search-controls {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    .search-controls input {
      min-width: min(520px, 70vw);
    }
    .search-results {
      border-top: 1px solid var(--line);
      padding-top: 12px;
    }
    .search-grid,
    .today-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .search-card,
    .today-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #ffffff;
      padding: 12px;
      min-width: 0;
    }
    .search-card h3,
    .today-card h3 {
      margin: 0 0 8px;
      font-size: 16px;
    }
    .mini-list {
      display: grid;
      gap: 8px;
    }
    .mini-item {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #f8fafc;
      padding: 9px;
    }
    .search-result-button {
      width: 100%;
      text-align: left;
      font-weight: 400;
      color: var(--text);
    }
    .search-result-button:hover {
      border-color: var(--accent);
      background: #eefdf9;
    }
    button {
      border: 1px solid var(--line);
      background: #ffffff;
      border-radius: 6px;
      padding: 9px 12px;
      cursor: pointer;
      font-weight: 600;
    }
    button:disabled {
      cursor: wait;
      opacity: .65;
    }
    button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }
    button.danger {
      color: var(--danger);
    }
    button.compact {
      padding: 6px 8px;
      font-size: 12px;
    }
    .help-button {
      border-radius: 999px;
      width: 26px;
      height: 26px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      border-color: #99b9d8;
      color: #1e6091;
      background: #eef6ff;
      margin-left: 6px;
      vertical-align: middle;
    }
    .help-button:hover {
      background: #dbeafe;
    }
    input,
    select {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 9px 10px;
      min-width: 220px;
      max-width: 100%;
    }
    .file-input {
      display: none;
    }
    .file-dropzone {
      border: 1px dashed #99bdb8;
      border-radius: 8px;
      background: #f8fffd;
      padding: 10px 12px;
      min-height: 48px;
      min-width: 250px;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 10px;
      align-items: center;
      cursor: pointer;
      transition: border-color .15s ease, background .15s ease, box-shadow .15s ease;
    }
    .file-dropzone:hover,
    .file-dropzone:focus-within,
    .file-dropzone.active {
      border-color: var(--accent);
      background: #eefdf9;
      box-shadow: 0 0 0 3px rgba(15, 118, 110, .12);
      outline: none;
    }
    .file-dropzone.dragging {
      border-color: var(--accent);
      background: #ccfbf1;
    }
    .file-badge {
      width: 38px;
      height: 38px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      background: var(--accent);
      color: #ffffff;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .02em;
    }
    .file-copy {
      min-width: 0;
    }
    .file-copy strong,
    .file-copy span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .file-copy span {
      color: var(--muted);
      font-size: 12px;
      margin-top: 2px;
    }
    .file-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: stretch;
    }
    .table-wrap {
      width: 100%;
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 10px 8px;
      text-align: left;
      vertical-align: top;
    }
    th {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .pill {
      display: inline-block;
      border-radius: 999px;
      padding: 3px 8px;
      background: #e7f5f2;
      color: #115e59;
      font-size: 12px;
      font-weight: 700;
    }
    .pill.cancelada {
      background: #fee2e2;
      color: #991b1b;
    }
    .bar {
      height: 8px;
      background: #e5e7eb;
      border-radius: 999px;
      overflow: hidden;
      margin-top: 4px;
      min-width: 120px;
    }
    .bar span {
      display: block;
      height: 100%;
      background: var(--accent);
    }
    .occupancy-list {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 10px;
    }
    .occupancy-card {
      display: flex;
      flex-direction: column;
      gap: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #ffffff;
      min-width: 0;
    }
    .occupancy-types {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    .occupancy-type {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 5px 7px;
      min-width: 0;
      background: #f8fafc;
    }
    .occupancy-type span {
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .occupancy-type strong {
      font-size: 12px;
    }
    .occupancy-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .occupancy-date strong {
      display: block;
      font-size: 15px;
    }
    .occupancy-ring {
      --pct: 0;
      width: 58px;
      height: 58px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      background:
        conic-gradient(var(--accent) calc(var(--pct) * 1%), #e5e7eb 0);
    }
    .occupancy-ring span {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #ffffff;
      font-size: 12px;
      font-weight: 800;
    }
    .rack-dashboard {
      display: grid;
      grid-template-columns: 1.25fr 1.35fr repeat(4, minmax(0, 1fr));
      gap: 10px;
      align-items: stretch;
    }
    .rack-meta-card,
    .rack-kpi-card,
    .rack-pie-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #ffffff;
      min-width: 0;
    }
    .rack-kpi-card strong {
      display: block;
      font-size: 26px;
      margin-top: 4px;
    }
    .rack-type-line {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
      margin-top: 6px;
    }
    .rack-pie-card {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 12px;
      align-items: center;
    }
    .rack-pie {
      --occupied: 0deg;
      --available: 0deg;
      width: 82px;
      height: 82px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background:
        conic-gradient(
          #0f766e 0deg var(--occupied),
          #d1fae5 var(--occupied) calc(var(--occupied) + var(--available)),
          #e5e7eb calc(var(--occupied) + var(--available)) 360deg
        );
    }
    .rack-pie span {
      display: grid;
      place-items: center;
      width: 54px;
      height: 54px;
      border-radius: 50%;
      background: #ffffff;
      font-weight: 800;
      font-size: 13px;
    }
    .rack-pie-legend {
      display: grid;
      gap: 6px;
      font-size: 12px;
    }
    .rack-pie-legend div {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .rack-pie-legend i {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      display: inline-block;
      margin-right: 6px;
    }
    .rack-pie-legend strong {
      font-size: 13px;
    }
    .rack-pie-occupied { background: #0f766e; }
    .rack-pie-available { background: #d1fae5; border: 1px solid #99f6e4; }
    .rack-pie-blocked { background: #e5e7eb; border: 1px solid #cbd5e1; }
    .rack-room-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
      gap: 8px;
      margin-top: 12px;
    }
    .rack-room {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 8px 6px;
      background: #ffffff;
      text-align: left;
      min-width: 0;
    }
    .rack-room strong {
      display: block;
      font-size: 15px;
    }
    .rack-room span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      margin-top: 2px;
    }
    .rack-room.occupied {
      background: #fee2e2;
      border-color: #fecaca;
    }
    .rack-room.available {
      background: #ecfdf5;
      border-color: #99f6e4;
    }
    .rack-room.available-type-king {
      background: #ede9fe;
      border-color: #c4b5fd;
    }
    .rack-room.available-type-double {
      background: #dbeafe;
      border-color: #93c5fd;
    }
    .rack-room.available-type-suite {
      background: #fef3c7;
      border-color: #fcd34d;
    }
    .rack-room.blocked {
      background: #f3f4f6;
      border-color: #cbd5e1;
    }
    textarea {
      width: 100%;
      min-height: 220px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
      font-family: Consolas, monospace;
      white-space: pre-wrap;
    }
    .rack-controls {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .date-controls {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      align-items: end;
    }
    label {
      display: grid;
      gap: 5px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 600;
    }
    .calendar-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin: 14px 0 10px;
    }
    .calendar-title {
      font-weight: 700;
      text-transform: capitalize;
    }
    .calendar-grid {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 6px;
    }
    .weekday {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-align: center;
      text-transform: uppercase;
    }
    .day {
      min-height: 92px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #ffffff;
      padding: 7px;
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 4px;
      text-align: left;
      cursor: pointer;
    }
    .day.empty {
      background: transparent;
      border-color: transparent;
    }
    .day.closed {
      background: #fee2e2;
      border-color: #fecaca;
    }
    .day.today {
      outline: 2px solid var(--accent);
      outline-offset: -2px;
    }
    .day-number {
      font-weight: 700;
    }
    .day-meta {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.25;
    }
    .day-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .day-view {
      border-color: #b8c2d6;
      padding: 3px 6px;
      min-width: auto;
      font-size: 11px;
      line-height: 1.1;
    }
    .day-view.has-reservations {
      background: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }
    .day.closed .day-meta {
      color: #991b1b;
      font-weight: 700;
    }
    .day.in-range {
      background: #ecfdf5;
      border-color: #99f6e4;
    }
    .day.selected {
      background: #ccfbf1;
      border-color: var(--accent);
      box-shadow: inset 0 0 0 2px var(--accent);
    }
    .selection-summary {
      margin-top: 10px;
      color: var(--muted);
      font-size: 14px;
      font-weight: 600;
    }
    .day-summary-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      margin-top: 14px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #f8fafc;
    }
    .summary-chips {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 8px;
    }
    .chip {
      display: inline-flex;
      gap: 5px;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #ffffff;
      padding: 4px 8px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }
    .alert-list,
    .arrival-list,
    .quote-list {
      display: grid;
      gap: 10px;
    }
    .alert-item {
      border: 1px solid #fecaca;
      border-radius: 8px;
      background: #fff7f7;
      padding: 10px 12px;
    }
    .arrival-item,
    .quote-item,
    .quote-section {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #ffffff;
      padding: 12px;
    }
    .arrival-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
    }
    .arrival-item.arrived,
    .day-reservation-item.arrived {
      background: #dcfce7;
      border-color: #86efac;
    }
    .arrival-item.pending,
    .day-reservation-item.pending {
      background: #dbeafe;
      border-color: #2563eb;
      box-shadow: inset 4px 0 0 #2563eb;
    }
    .arrival-item.delayed,
    .day-reservation-item.delayed {
      background: #fee2e2;
      border-color: #fca5a5;
    }
    .rack-type-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 12px 0 -2px;
    }
    .rack-type-legend span {
      border-radius: 999px;
      padding: 5px 9px;
      font-size: 12px;
      font-weight: 700;
      border: 1px solid var(--line);
    }
    .rack-type-legend .king { background: #ede9fe; border-color: #c4b5fd; }
    .rack-type-legend .double { background: #dbeafe; border-color: #60a5fa; }
    .rack-type-legend .suite { background: #fef3c7; border-color: #fcd34d; }
    .report-toolbar {
      display: flex;
      gap: 10px;
      align-items: end;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .report-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    .report-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #ffffff;
      padding: 12px;
      min-width: 0;
    }
    .report-card.wide {
      grid-column: 1 / -1;
    }
    .report-card h3 {
      margin: 0 0 4px;
      font-size: 16px;
    }
    .report-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      font-size: 13px;
    }
    .report-table th,
    .report-table td {
      border-bottom: 1px solid var(--line);
      padding: 7px 6px;
      text-align: left;
      vertical-align: top;
    }
    .report-table th {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
    }
    .report-kpis {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .report-kpi {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #f8fafc;
      padding: 10px;
    }
    .report-kpi strong {
      display: block;
      font-size: 24px;
      margin-top: 4px;
    }
    .room-event-form {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      align-items: end;
    }
    .room-event-form .wide {
      grid-column: span 2;
    }
    .note-row {
      display: grid;
      grid-template-columns: minmax(160px, 1fr) auto;
      gap: 8px;
      margin-top: 8px;
    }
    .note-row input {
      min-width: 0;
      width: 100%;
    }
    .quote-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(300px, .75fr);
      gap: 16px;
      align-items: start;
    }
    .quote-workspace {
      background:
        linear-gradient(180deg, rgba(184, 132, 34, .12), transparent 190px),
        #fffdf9;
      border-color: #d7b36a;
    }
    .quote-hero-panel {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: center;
      padding: 16px;
      border: 1px solid #d7b36a;
      border-radius: 8px;
      background: #fff7ea;
      margin-bottom: 14px;
    }
    .quote-hero-panel strong {
      display: block;
      color: #4a2b22;
      font-size: 22px;
    }
    .quote-hero-panel span {
      color: #8f1236;
      font-weight: 800;
    }
    .quote-save-card {
      position: sticky;
      top: 96px;
      border: 1px solid #d7b36a;
      background: #fffdf9;
    }
    .quote-save-card .primary {
      width: 100%;
      margin-top: 12px;
      background: #6f4427;
      border-color: #6f4427;
    }
    .quote-fieldset {
      display: grid;
      gap: 12px;
      margin-bottom: 16px;
    }
    .quote-fieldset-title {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      color: #4a2b22;
      font-weight: 800;
      margin: 14px 0 8px;
    }
    .quote-presets {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .quote-presets button {
      border-color: #d7b36a;
      background: #fff7ea;
      color: #4a2b22;
    }
    .quote-menu-picker {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto;
      gap: 8px;
      align-items: end;
      padding: 12px;
      border: 1px solid #ead7b2;
      border-radius: 8px;
      background: #fffaf2;
      margin: 10px 0;
    }
    .quote-menu-preview {
      grid-column: 1 / -1;
      color: #775c4e;
      font-size: 13px;
      line-height: 1.4;
    }
    .quote-menu-modifiers {
      grid-column: 1 / -1;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .quote-menu-modifiers label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid #ead7b2;
      border-radius: 999px;
      padding: 6px 10px;
      background: #ffffff;
      color: #4a2b22;
      font-weight: 700;
    }
    .quote-menu-modifiers input {
      min-width: 0;
    }
    .quote-template-toggle {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .quote-template-option {
      border: 1px solid #d7b36a;
      border-radius: 8px;
      padding: 10px;
      background: #ffffff;
    }
    .quote-template-option input {
      min-width: 0;
      margin-right: 6px;
    }
    .quote-menu-editor {
      margin-top: 12px;
      border: 1px solid #ead7b2;
      border-radius: 8px;
      background: #fffdf9;
      padding: 12px;
    }
    .quote-menu-editor-head {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      margin-bottom: 10px;
    }
    .quote-menu-row {
      display: grid;
      grid-template-columns: minmax(150px, 1fr) 96px minmax(220px, 1.35fr) auto;
      gap: 8px;
      align-items: center;
      margin-top: 8px;
    }
    .quote-menu-row input {
      min-width: 0;
      width: 100%;
    }
    .quote-menu-status {
      color: #775c4e;
      font-size: 13px;
      margin-top: 8px;
    }
    .event-board {
      margin-top: 16px;
    }
    .event-calendar {
      display: grid;
      grid-template-columns: repeat(7, minmax(120px, 1fr));
      gap: 8px;
      margin: 12px 0 18px;
    }
    .event-day {
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 12px;
      min-height: 106px;
      padding: 9px;
    }
    .event-day.today {
      outline: 2px solid var(--primary);
    }
    .event-day.empty {
      background: transparent;
      border-color: transparent;
    }
    .event-date-label {
      font-weight: 800;
      margin-bottom: 6px;
    }
    .event-pill {
      border-radius: 10px;
      border: 1px solid var(--line);
      padding: 6px;
      margin-top: 5px;
      font-size: 12px;
      background: #f8fafc;
      cursor: pointer;
    }
    .event-pill.cotizacion {
      background: #fff7ed;
      border-color: #fed7aa;
    }
    .event-pill.apartado {
      background: #eff6ff;
      border-color: #93c5fd;
    }
    .event-pill.pago_completo {
      background: #ecfdf5;
      border-color: #86efac;
    }
    .payment-bar {
      background: #e2e8f0;
      border-radius: 999px;
      height: 8px;
      overflow: hidden;
      margin-top: 5px;
    }
    .payment-bar span {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, #0f766e, #22c55e);
    }
    .event-list {
      display: grid;
      gap: 10px;
      margin-top: 14px;
    }
    .event-card {
      border: 1px solid var(--line);
      border-radius: 12px;
      background: #fff;
      padding: 12px;
      cursor: pointer;
    }
    .event-card:hover,
    .event-pill:hover {
      box-shadow: 0 8px 24px rgba(15, 23, 42, .12);
    }
    .event-alert {
      border: 1px solid #fed7aa;
      background: #fff7ed;
      border-radius: 12px;
      padding: 10px 12px;
    }
    .event-alert.danger {
      border-color: #fecaca;
      background: #fef2f2;
    }
    .availability-ok {
      color: #047857;
      font-weight: 700;
    }
    .availability-bad {
      color: #b91c1c;
      font-weight: 700;
    }
    .event-detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .event-detail-box {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px;
      background: #f8fafc;
    }
    .event-detail-box span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 4px;
    }
    .voucher-list {
      display: grid;
      gap: 8px;
      margin-top: 10px;
    }
    .voucher-item {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px;
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      background: #fff;
    }
    .floor-map {
      margin-top: 14px;
      display: grid;
      gap: 12px;
    }
    .floor-card {
      border: 1px solid var(--line);
      border-radius: 12px;
      background: #fff;
      padding: 12px;
    }
    .floor-rooms {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(62px, 1fr));
      gap: 8px;
      margin-top: 10px;
    }
    .floor-room {
      border: 1px solid var(--line);
      border-radius: 10px;
      min-height: 54px;
      padding: 7px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      font-size: 12px;
    }
    .floor-room strong {
      font-size: 15px;
    }
    .floor-room.occupied { background: #fee2e2; border-color: #fca5a5; }
    .floor-room.clean { background: #dcfce7; border-color: #86efac; }
    .floor-room.dirty { background: #fef3c7; border-color: #fcd34d; }
    .floor-room.blocked { background: #e5e7eb; border-color: #9ca3af; }
    .event-card-head {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: flex-start;
    }
    .voucher-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-top: 10px;
    }
    .voucher-row input[type="file"] {
      max-width: 260px;
    }
    .quote-catalog-modal {
      width: min(900px, 100%);
    }
    .quote-catalog-modal .quote-menu-editor {
      margin-top: 0;
    }
    .quote-section {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(132px, .65fr) minmax(126px, .55fr) minmax(140px, .7fr) auto;
      gap: 8px;
      align-items: end;
      margin-top: 10px;
      border-color: #d7b36a;
      background: #fffdf9;
    }
    .quote-section textarea {
      grid-column: 1 / -1;
      min-height: 72px;
    }
    .quote-total {
      font-size: 28px;
      font-weight: 800;
      margin-top: 8px;
      color: #8f1236;
    }
    .quote-subtotal-line {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 6px 0;
      border-bottom: 1px solid #ead7b2;
      color: #775c4e;
      font-weight: 700;
    }
    .quote-item {
      border-color: #ead7b2;
      background: #fffdf9;
    }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 20;
      background: rgba(15, 23, 42, .52);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .modal {
      width: min(980px, 100%);
      max-height: min(760px, 92vh);
      overflow: auto;
      background: #ffffff;
      border-radius: 8px;
      box-shadow: 0 24px 70px rgba(15, 23, 42, .28);
      border: 1px solid var(--line);
    }
    .modal-head {
      position: sticky;
      top: 0;
      z-index: 1;
      background: #ffffff;
      border-bottom: 1px solid var(--line);
      padding: 14px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .modal-body {
      padding: 16px;
    }
    .help-content {
      white-space: pre-line;
      color: var(--muted);
      line-height: 1.45;
      font-size: 15px;
    }
    .confirm-modal {
      width: min(460px, 100%);
    }
    .reservation-edit-modal {
      width: min(760px, 100%);
    }
    .confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }
    .modal-kpis {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .modal-kpi {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      background: #f8fafc;
    }
    .modal-kpi strong {
      display: block;
      font-size: 20px;
      margin-top: 4px;
    }
    .day-reservation-list {
      display: grid;
      gap: 10px;
    }
    .day-reservation-item {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      display: grid;
      gap: 10px;
    }
    .day-reservation-head,
    .day-reservation-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }
    .day-reservation-details {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }
    .day-reservation-details div {
      min-width: 0;
    }
    .day-reservation-details strong,
    .day-reservation-details span {
      display: block;
      overflow-wrap: anywhere;
    }
    .reservation-edit-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .reservation-edit-grid label {
      display: grid;
      gap: 5px;
      font-weight: 700;
      font-size: 13px;
    }
    .reservation-edit-grid .wide {
      grid-column: span 2;
    }
    body.modal-open {
      overflow: hidden;
    }
    @media (max-width: 800px) {
      .grid { grid-template-columns: 1fr; }
      .bot-status-grid { grid-template-columns: 1fr; }
      .day-reservation-details,
      .reservation-edit-grid {
        grid-template-columns: 1fr;
      }
      .reservation-edit-grid .wide {
        grid-column: auto;
      }
      .bot-status {
        grid-template-columns: 1fr;
      }
      .qr-box {
        justify-items: start;
      }
      table { font-size: 13px; }
      header, main { padding-left: 14px; padding-right: 14px; }
      header { position: static; }
      h1 { font-size: 20px; }
      .toolbar {
        align-items: stretch;
        flex-direction: column;
      }
      .toolbar > div {
        width: 100%;
      }
      .rack-controls {
        display: grid;
        grid-template-columns: 1fr;
      }
      .occupancy-list {
        grid-template-columns: 1fr;
      }
      .quote-layout,
      .quote-section,
      .quote-menu-row,
      .arrival-item,
      .note-row {
        grid-template-columns: 1fr;
      }
      .rack-dashboard {
        grid-template-columns: 1fr;
      }
      .date-controls {
        grid-template-columns: 1fr;
      }
      .calendar-grid {
        gap: 4px;
      }
      .day {
        min-height: 76px;
        padding: 5px;
      }
      .weekday,
      .day-meta {
        font-size: 11px;
      }
      input,
      select,
      button {
        width: 100%;
        min-width: 0;
      }
      .day-view {
        width: auto;
      }
      .day-summary-card,
      .modal-head {
        grid-template-columns: 1fr;
        align-items: stretch;
      }
      .modal-kpis {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      textarea {
        min-height: 280px;
      }
      th, td {
        padding: 9px 6px;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>Hotel Villa Margaritas - Dashboard del bot</h1>
    <div class="muted">Reservas, ocupacion por fecha y cancelacion de folios</div>
  </header>
  <main>
    <nav class="view-tabs">
      <button id="tab-today" onclick="showView('today')">Hoy</button>
      <button id="tab-main" class="active" onclick="showView('main')">Principal</button>
      <button id="tab-calendar" onclick="showView('calendar')">Calendario</button>
      <button id="tab-reservations" onclick="showView('reservations')">Reservas</button>
      <button id="tab-quotes" onclick="showView('quotes')">Cotizaciones</button>
      <button id="tab-events" onclick="showView('events')">Eventos</button>
      <button id="tab-rack" onclick="showView('rack')">Rack</button>
      <button id="tab-reports" onclick="showView('reports')">Reportes</button>
    </nav>

    <section class="panel global-search-panel">
      <div class="toolbar">
        <div>
          <strong>Buscador global</strong><button class="help-button" onclick="openHelp('search')" title="Ayuda">?</button>
          <div class="muted">Busca huespedes, telefonos, folios, eventos, cotizaciones, habitaciones o bloqueos.</div>
        </div>
        <div class="search-controls">
          <input id="globalSearchInput" placeholder="Ej. Juan, 444, 101, boda, COT..." onkeydown="handleGlobalSearchKey(event)">
          <button class="primary" onclick="runGlobalSearch()">Buscar</button>
        </div>
      </div>
      <div id="globalSearchResults" class="search-results hidden"></div>
    </section>

    <div id="view-today" class="view-panel hidden">
      <section class="panel">
        <div class="toolbar">
          <div>
            <strong>Vista de hoy</strong><button class="help-button" onclick="openHelp('today')" title="Ayuda">?</button>
            <div class="muted">Resumen rapido para recepcion: llegadas, ocupacion, eventos, pagos y bloqueos activos.</div>
          </div>
          <button class="primary" onclick="loadDashboard()">Actualizar</button>
        </div>
        <div id="todayView"></div>
      </section>
    </div>

    <div id="view-main" class="view-panel">
    <section class="grid">
      <div class="panel">
        <div class="muted">Reservas activas</div>
        <div id="activeCount" class="metric">0</div>
      </div>
      <div class="panel">
        <div class="muted">Reservas en calendario</div>
        <div id="groupReservationCount" class="metric">0</div>
      </div>
      <div class="panel">
        <div class="muted">Reservas hoy</div>
        <div id="todayReservationCount" class="metric">0</div>
        <div id="todayReservationRooms" class="muted">0/69 habitaciones</div>
      </div>
      <div class="panel">
        <div class="muted">Reservas canceladas</div>
        <div id="canceledCount" class="metric">0</div>
      </div>
      <div class="panel">
        <div class="muted">Limites</div>
        <div id="limits" class="limit-list">-</div>
      </div>
    </section>

    <section class="panel">
      <div class="toolbar">
        <div>
          <strong>Estado de WhatsApp</strong><button class="help-button" onclick="openHelp('whatsapp')" title="Ayuda">?</button>
          <div class="muted">Cada bot usa su propio numero, sesion y QR.</div>
        </div>
      </div>
      <div id="botStatusList" class="bot-status-grid"></div>
    </section>

    <section class="panel">
      <div class="toolbar">
        <div>
          <strong>Alertas de sobreventa</strong><button class="help-button" onclick="openHelp('overbooking')" title="Ayuda">?</button>
          <div class="muted">Fechas donde las reservas superan el limite por tipo.</div>
        </div>
      </div>
      <div id="overbookingAlerts"></div>
    </section>

    <section class="panel">
      <div class="toolbar">
        <div>
          <strong>Llegadas de hoy</strong><button class="help-button" onclick="openHelp('arrivals')" title="Ayuda">?</button>
          <div class="muted">Reservas cuya entrada es hoy.</div>
        </div>
      </div>
      <div id="todayArrivals"></div>
    </section>

    <section class="panel">
      <div class="toolbar">
        <div>
          <strong>Rack global</strong><button class="help-button" onclick="openHelp('rackGlobal')" title="Ayuda">?</button>
          <div id="rackGlobalUpdated" class="muted">Sin rack CSV guardado.</div>
        </div>
      </div>
      <div id="rackDashboard"></div>
    </section>

    <section class="panel">
      <div class="toolbar">
        <div>
          <strong>Proximas reservas por fecha</strong><button class="help-button" onclick="openHelp('upcoming')" title="Ayuda">?</button>
          <div id="updatedAt" class="muted"></div>
        </div>
        <button class="primary" onclick="loadDashboard()">Actualizar</button>
      </div>
      <div id="occupancy"></div>
    </section>
    </div>

    <div id="view-calendar" class="view-panel hidden">
    <section class="panel">
      <div class="toolbar">
        <div>
          <strong>Calendario de reservas</strong><button class="help-button" onclick="openHelp('calendar')" title="Ayuda">?</button>
          <div class="muted">Cada dia muestra reservas del bot, manuales y de Excel sobre 69 habitaciones. Da clic en un dia para ver el desglose.</div>
        </div>
        <button class="primary" onclick="closeToday()">Cerrar hoy</button>
      </div>
      <div class="date-controls">
        <label>
          Desde
          <input id="closeStart" type="date" onchange="syncSelectionFromInputs()">
        </label>
        <label>
          Hasta
          <input id="closeEnd" type="date" onchange="syncSelectionFromInputs()">
        </label>
        <button class="primary" onclick="closeRange()">Cerrar rango</button>
        <button onclick="openRange()">Abrir rango</button>
      </div>
      <div id="selectionSummary" class="selection-summary"></div>
      <div class="calendar-head">
        <button onclick="changeCalendarMonth(-1)">Anterior</button>
        <div id="calendarTitle" class="calendar-title"></div>
        <button onclick="changeCalendarMonth(1)">Siguiente</button>
      </div>
      <div id="calendar" class="calendar-grid"></div>
      <div id="groupReservationDetail" style="margin-top:14px"></div>
    </section>
    </div>

    <div id="view-reservations" class="view-panel hidden">
    <section class="panel">
      <div class="toolbar">
        <div>
          <strong>Agregar reservas</strong><button class="help-button" onclick="openHelp('reservations')" title="Ayuda">?</button>
          <div class="muted">Captura manual o importa un CSV que puedas editar en Excel.</div>
        </div>
        <button onclick="downloadReservationsCsv()">Descargar CSV</button>
      </div>
      <div class="date-controls">
        <label>
          Nombre
          <input id="manualNombre" placeholder="Nombre del huesped">
        </label>
        <label>
          Telefono
          <input id="manualTelefono" placeholder="10 digitos">
        </label>
        <label>
          Entrada
          <input id="manualFecha" type="date">
        </label>
        <label>
          Salida
          <input id="manualFechaSalida" type="date">
        </label>
        <label>
          Habs
          <input id="manualHabitaciones" type="number" min="1" value="1" oninput="refreshManualRate()">
        </label>
        <label>
          Adultos
          <input id="manualAdultos" type="number" min="0" value="2" oninput="refreshManualRate()">
        </label>
        <label>
          Menores
          <input id="manualNinos" type="number" min="0" value="0">
        </label>
        <label>
          Tipo
          <select id="manualTipo" onchange="refreshManualRate()">
            <option value="">Sin tipo</option>
            <option value="Doble">Doble</option>
            <option value="King">King</option>
            <option value="Suite King">Suite King</option>
            <option value="Doble Suite">Doble Suite</option>
          </select>
        </label>
        <label>
          Hora
          <input id="manualHora" placeholder="3 pm">
        </label>
        <label>
          Tarifa
          <select id="manualTarifa" onchange="rememberManualRateChoice()">
            ${hotelRateOptionsHtml("$700")}
          </select>
        </label>
        <label>
          Nota
          <input id="manualNota" placeholder="Ej. llega tarde, anticipo, peticion especial">
        </label>
        <button class="primary" onclick="saveManualReservation()">Guardar reserva</button>
      </div>
      <div class="file-actions" style="margin-top:12px">
        <label class="file-dropzone" data-file-zone="csvFile" tabindex="0">
          <input id="csvFile" class="file-input" type="file" accept=".csv,text/csv">
          <span class="file-badge">CSV</span>
          <span class="file-copy">
            <strong>Reservas CSV</strong>
            <span id="csvFileName">Arrastra, pega o elige archivo</span>
          </span>
        </label>
        <button class="primary" onclick="importReservationsCsv()">Importar CSV</button>
        <button onclick="downloadTemplateCsv()">Plantilla CSV</button>
      </div>
      <div id="manualReservationStatus" class="muted" style="margin-top:10px"></div>
    </section>

    <section class="panel">
      <div class="toolbar">
        <div>
          <strong>Reservas registradas</strong><button class="help-button" onclick="openHelp('reservationList')" title="Ayuda">?</button>
          <div class="muted">Cancelar un folio libera inventario.</div>
        </div>
        <div>
          <input id="folioInput" placeholder="Folio a cancelar">
          <button class="danger" onclick="cancelFolio()">Cancelar folio</button>
        </div>
      </div>
      <div id="reservations"></div>
    </section>
    </div>

    <div id="view-quotes" class="view-panel hidden">
    <section class="panel quote-workspace">
      <div class="toolbar">
        <div>
          <strong>Cotizaciones para eventos y grupos</strong><button class="help-button" onclick="openHelp('quotes')" title="Ayuda">?</button>
          <div class="muted">Diseña una cotizacion visual con apartados por dia, menu, salon u hospedaje.</div>
        </div>
      </div>
      <div class="quote-hero-panel">
        <div>
          <strong>Formato Villa Margaritas</strong>
          <div class="muted">Paleta dorada/cafe, foto automatica segun el tipo y documento listo para imprimir o guardar PDF.</div>
        </div>
        <span>Cotizacion</span>
      </div>
      <div class="quote-layout">
        <div>
          <div class="quote-fieldset-title">Datos del cliente <button class="help-button" onclick="openHelp('quoteClient')" title="Ayuda">?</button></div>
          <div class="date-controls">
            <label>
              Cliente
              <input id="quoteClient" placeholder="Nombre del cliente o empresa">
            </label>
            <label>
              Contacto
              <input id="quoteContact" placeholder="Telefono o correo">
            </label>
            <label>
              Evento
              <input id="quoteEventName" placeholder="Boda, grupo, capacitacion">
            </label>
            <label>
              Fecha evento
              <input id="quoteEventDate" type="date">
            </label>
            <label>
              Salon
              <select id="quoteHall">
                <option value="">Sin salon</option>
              </select>
            </label>
            <label>
              Vigencia
              <input id="quoteValidUntil" type="date">
            </label>
          </div>
          <div class="quote-fieldset-title">Presentacion del documento <button class="help-button" onclick="openHelp('quoteDocument')" title="Ayuda">?</button></div>
          <div class="quote-template-toggle">
            <label class="quote-template-option">
              <input type="radio" name="quoteTemplate" value="visual" checked>
              <strong>Visual hotel</strong>
              <div class="muted">Mas comercial, con foto grande y estilo folleto.</div>
            </label>
            <label class="quote-template-option">
              <input type="radio" name="quoteTemplate" value="formal">
              <strong>Formal</strong>
              <div class="muted">Sobria, tipo factura/carta sin ser documento fiscal.</div>
            </label>
          </div>
          <div class="date-controls">
            <label>
              Titulo visible
              <input id="quoteHeadline" placeholder="Cotizacion para 40 personas">
            </label>
            <label>
              Fechas / estancia
              <input id="quoteStayDates" placeholder="28 al 30 de mayo">
            </label>
            <label>
              Personas
              <input id="quotePeople" type="number" min="0" placeholder="40">
            </label>
            <label>
              Servicio % alimentos
              <input id="quoteServiceCharge" type="number" min="0" value="0" oninput="renderQuoteTotals()">
            </label>
            <label>
              Check-in
              <input id="quoteCheckIn" placeholder="3:00 PM">
            </label>
            <label>
              Check-out
              <input id="quoteCheckOut" placeholder="12:00 PM">
            </label>
          </div>
          <label>
            Notas generales
            <textarea id="quoteNotes" placeholder="Condiciones, horarios, politicas o comentarios para la cotizacion."></textarea>
          </label>
          <div class="toolbar" style="margin-top:14px">
            <div>
              <strong>Apartados</strong><button class="help-button" onclick="openHelp('quoteSections')" title="Ayuda">?</button>
              <div class="muted">Cada apartado puede ser un dia, menu, salon u hospedaje.</div>
            </div>
            <div class="quote-presets">
              <button onclick="addQuotePreset('habitaciones')">Hospedaje</button>
              <button onclick="addQuotePreset('salon')">Salon</button>
              <button onclick="addQuotePreset('alimentos')">Menu/persona</button>
              <button onclick="addQuoteSection()">Otro</button>
            </div>
          </div>
          <div class="quote-menu-picker">
            <label>
              Menu rapido
              <select id="quoteMenuSelect" onchange="renderQuoteMenuPreview()"></select>
            </label>
            <button onclick="addSelectedMenuItem()">Agregar menu</button>
            <div class="quote-menu-modifiers">
              <label><input id="quoteAddWater" type="checkbox" onchange="renderQuoteMenuPreview()"> Agua +$30</label>
              <label><input id="quoteAddCoffee" type="checkbox" onchange="renderQuoteMenuPreview()"> Cafe +$30</label>
            </div>
            <button onclick="openQuoteMenuModal()">Editar catalogo</button>
            <div id="quoteMenuPreview" class="quote-menu-preview"></div>
          </div>
          <div id="quoteSections"></div>
        </div>
        <div class="panel quote-save-card" style="margin-bottom:0">
          <div class="muted">Total cotizacion</div>
          <div id="quoteSubtotalLine" class="quote-subtotal-line"><span>Subtotal</span><strong>$0</strong></div>
          <div id="quoteServiceLine" class="quote-subtotal-line"><span>Servicio alimentos</span><strong>$0</strong></div>
          <div id="quoteTotal" class="quote-total">$0</div>
          <div id="quoteStatus" class="muted"></div>
          <button class="primary" onclick="saveQuotation()">Guardar cotizacion</button>
          <hr>
          <strong>Ultimas cotizaciones</strong>
          <div id="quoteList" class="quote-list" style="margin-top:10px"></div>
        </div>
      </div>
    </section>
    </div>

    <div id="view-events" class="view-panel hidden">
    <section class="panel event-board">
        <div class="toolbar">
          <div>
            <strong>Calendario de salones</strong><button class="help-button" onclick="openHelp('events')" title="Ayuda">?</button>
            <div class="muted">Margaritas, Tulipanes y Girasoles. El color indica el estado del evento y la barra lo pagado.</div>
          </div>
          <label>
            Mes
            <input id="eventMonth" type="month" onchange="renderEventCalendar()">
          </label>
        </div>
        <div id="eventAlerts" class="event-list"></div>
        <div id="eventCalendar" class="event-calendar"></div>
        <div class="quote-fieldset-title">Apartar evento desde cero <button class="help-button" onclick="openHelp('manualEvent')" title="Ayuda">?</button></div>
        <div class="date-controls">
          <label>
            Cliente
            <input id="eventClient" placeholder="Cliente">
          </label>
          <label>
            Contacto
            <input id="eventContact" placeholder="Telefono o correo">
          </label>
          <label>
            Evento
            <input id="eventName" placeholder="Nombre del evento">
          </label>
          <label>
            Fecha
            <input id="eventDate" type="date" onchange="renderEventAvailability('manual')">
          </label>
          <label>
            Salon
            <select id="eventHall" onchange="renderEventAvailability('manual')"></select>
          </label>
          <label>
            Estado
            <select id="eventStatus">
              <option value="cotizacion">En cotizacion</option>
              <option value="apartado">Apartado</option>
              <option value="pago_completo">Pago completo</option>
            </select>
          </label>
          <label>
            Total
            <input id="eventTotal" type="number" min="0" step="0.01" placeholder="0">
          </label>
          <label>
            Pagado
            <input id="eventPaid" type="number" min="0" step="0.01" placeholder="0">
          </label>
        </div>
        <label>
          Notas
          <textarea id="eventNotes" placeholder="Notas internas del evento, pagos, condiciones o pendientes."></textarea>
        </label>
        <div id="eventAvailability" class="muted" style="margin:8px 0"></div>
        <div class="toolbar">
          <button class="primary" onclick="saveManualEvent()">Guardar evento</button>
          <div id="eventStatusText" class="muted"></div>
        </div>
        <div id="eventList" class="event-list"></div>
    </section>
    </div>

    <div id="view-rack" class="view-panel hidden">
    <section class="panel">
      <div class="toolbar">
        <div>
          <strong>Lector de rack</strong><button class="help-button" onclick="openHelp('rack')" title="Ayuda">?</button>
          <div class="muted">Importa el CSV del sistema para leer ocupadas, disponibles y bloqueadas. La foto queda como respaldo.</div>
        </div>
      </div>
      <div class="rack-controls">
        <label class="file-dropzone" data-file-zone="rackCsv" tabindex="0">
          <input id="rackCsv" class="file-input" type="file" accept=".csv,text/csv">
          <span class="file-badge">CSV</span>
          <span class="file-copy">
            <strong>Rack CSV</strong>
            <span id="rackCsvName">Arrastra, pega o elige archivo</span>
          </span>
        </label>
        <button id="analyzeRackCsvButton" class="primary" onclick="analyzeRackCsvFile()">Analizar CSV</button>
        <label class="file-dropzone" data-file-zone="rackImage" tabindex="0">
          <input id="rackImage" class="file-input" type="file" accept="image/*">
          <span class="file-badge">IMG</span>
          <span class="file-copy">
            <strong>Foto rack</strong>
            <span id="rackImageName">Arrastra, pega o elige imagen</span>
          </span>
        </label>
        <button id="analyzeRackButton" onclick="analyzeRack()">Analizar foto</button>
      </div>
      <div style="margin-top:12px">
        <textarea id="rackResult" readonly placeholder="Aqui aparecera el resultado del rack."></textarea>
      </div>
      <div id="rackFloorMap"></div>
      <div id="rackRoomGrid"></div>
    </section>
    <section class="panel">
      <div class="toolbar">
        <div>
          <strong>Bloqueos de habitacion</strong><button class="help-button" onclick="openHelp('roomBlocks')" title="Ayuda">?</button>
          <div class="muted">Aparta cuartos para mantenimiento, limpieza profunda, fallas o cualquier motivo operativo.</div>
        </div>
      </div>
      <div class="date-controls">
        <label>
          Habitacion
          <input id="blockRoom" list="roomEventRoomOptions" placeholder="Ej. 101">
        </label>
        <label>
          Desde
          <input id="blockStart" type="date">
        </label>
        <label>
          Hasta
          <input id="blockEnd" type="date">
        </label>
        <label>
          Motivo
          <input id="blockReason" placeholder="Ej. clima, pintura, fuera de servicio">
        </label>
        <label>
          Estado
          <select id="blockStatus">
            <option value="activo">Activo</option>
            <option value="terminado">Terminado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </label>
        <button class="primary" onclick="saveRoomBlock()">Guardar bloqueo</button>
      </div>
      <label>
        Notas del bloqueo
        <input id="blockNotes" placeholder="Detalle interno, proveedor, pendiente o seguimiento">
      </label>
      <div id="roomBlockStatus" class="muted" style="margin-top:8px"></div>
      <div id="roomBlocksList" style="margin-top:12px"></div>
    </section>
    </div>

    <div id="view-reports" class="view-panel hidden">
    <section class="panel">
      <div class="toolbar">
        <div>
          <strong>Reportes operativos</strong><button class="help-button" onclick="openHelp('reports')" title="Ayuda">?</button>
          <div class="muted">Ocupacion, rotacion de habitaciones, mantenimiento y notas historicas.</div>
        </div>
        <button class="primary" onclick="loadReports()">Actualizar reportes</button>
      </div>
      <div class="report-toolbar">
        <label>
          Mes
          <input id="reportMonth" type="month" onchange="loadReports()">
        </label>
        <button onclick="downloadReportCsv('all')">CSV completo</button>
        <button onclick="downloadReportCsv('occupancy')">CSV ocupacion</button>
        <button onclick="downloadReportCsv('rotation')">CSV rotacion</button>
        <button onclick="downloadReportCsv('events')">CSV eventos</button>
        <div id="reportMode" class="muted"></div>
      </div>
      <div id="reportKpis" class="report-kpis"></div>
      <div class="report-grid">
        <div class="report-card wide">
          <h3>Ocupacion diaria del mes</h3>
          <div class="muted">Habitaciones ocupadas por fecha.</div>
          <div id="dailyOccupancyReport"></div>
        </div>
        <div class="report-card wide">
          <h3>Rotacion por habitacion</h3>
          <div class="muted">Noches ocupadas por cuarto y ultimos mantenimientos.</div>
          <div id="roomRotationReport"></div>
        </div>
        <div class="report-card">
          <h3>Mantenimiento / limpieza pendiente</h3>
          <div class="muted">Prioriza cuartos usados recientemente o con servicios vencidos.</div>
          <div id="serviceDueReport"></div>
        </div>
        <div class="report-card">
          <h3>Reservas por fuente</h3>
          <div class="muted">Manual, Excel, bot.</div>
          <div id="sourceReport"></div>
        </div>
        <div class="report-card wide">
          <h3>Reporte de eventos</h3>
          <div class="muted">Eventos por salon, estados, pagos y saldos pendientes.</div>
          <div id="eventReport"></div>
        </div>
        <div class="report-card wide">
          <h3>Registrar nota o mantenimiento de habitacion</h3>
          <div class="room-event-form">
            <label>
              Habitacion
              <input id="roomEventRoom" list="roomEventRoomOptions" placeholder="Ej. 101">
              <datalist id="roomEventRoomOptions">
                ${HOTEL_ROOM_NUMBERS.map(room => `<option value="${room}"></option>`).join("")}
              </datalist>
            </label>
            <label>
              Tipo
              <select id="roomEventType"></select>
            </label>
            <label>
              Fecha
              <input id="roomEventDate" type="date">
            </label>
            <label>
              Costo
              <input id="roomEventCost" type="number" min="0" placeholder="Opcional">
            </label>
            <label class="wide">
              Titulo
              <input id="roomEventTitle" placeholder="Ej. Limpieza profunda, cambio de filtro">
            </label>
            <label class="wide">
              Notas
              <input id="roomEventNotes" placeholder="Detalle del trabajo o pendiente">
            </label>
            <button class="primary" onclick="saveRoomEvent()">Guardar evento</button>
            <div id="roomEventStatus" class="muted"></div>
          </div>
          <div id="roomEventsReport" style="margin-top:14px"></div>
        </div>
      </div>
    </section>
    </div>
  </main>
  <div id="helpModalBackdrop" class="modal-backdrop hidden" onclick="closeHelp()">
    <div class="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="helpModalTitle" onclick="event.stopPropagation()">
      <div class="modal-head">
        <div>
          <strong id="helpModalTitle">Ayuda</strong>
          <div class="muted">Guia rapida de uso</div>
        </div>
        <button onclick="closeHelp()">Cerrar</button>
      </div>
      <div id="helpModalBody" class="modal-body help-content"></div>
    </div>
  </div>
  <div id="searchDetailModalBackdrop" class="modal-backdrop hidden" onclick="closeSearchDetailModal()">
    <div class="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="searchDetailTitle" onclick="event.stopPropagation()">
      <div class="modal-head">
        <div>
          <strong id="searchDetailTitle">Detalle</strong>
          <div id="searchDetailSubtitle" class="muted"></div>
        </div>
        <button onclick="closeSearchDetailModal()">Cerrar</button>
      </div>
      <div id="searchDetailBody" class="modal-body"></div>
    </div>
  </div>
  <div id="dayModalBackdrop" class="modal-backdrop hidden" onclick="closeDayModal()">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="dayModalTitle" onclick="event.stopPropagation()">
      <div class="modal-head">
        <div>
          <strong id="dayModalTitle">Reservas del dia</strong>
          <div id="dayModalSubtitle" class="muted"></div>
        </div>
        <button onclick="closeDayModal()">Cerrar</button>
      </div>
      <div id="dayModalBody" class="modal-body"></div>
    </div>
  </div>
  <div id="reservationEditBackdrop" class="modal-backdrop hidden" onclick="closeReservationEdit()">
    <div class="modal reservation-edit-modal" role="dialog" aria-modal="true" aria-labelledby="reservationEditTitle" onclick="event.stopPropagation()">
      <div class="modal-head">
        <div>
          <strong id="reservationEditTitle">Editar reserva</strong>
          <div id="reservationEditSubtitle" class="muted"></div>
        </div>
        <button onclick="closeReservationEdit()">Cerrar</button>
      </div>
      <div class="modal-body">
        <div class="reservation-edit-grid">
          <label class="wide">Cliente<input id="editReservationName" autocomplete="off"></label>
          <label>Telefono<input id="editReservationPhone" inputmode="tel"></label>
          <label>Entrada<input id="editReservationStart" type="date"></label>
          <label>Salida<input id="editReservationEnd" type="date"></label>
          <label>Habitaciones<input id="editReservationRooms" type="number" min="1" oninput="refreshEditRate()"></label>
          <label>Adultos<input id="editReservationAdults" type="number" min="0" oninput="refreshEditRate()"></label>
          <label>Menores<input id="editReservationChildren" type="number" min="0"></label>
          <label>Tipo<input id="editReservationType" oninput="refreshEditRate()"></label>
          <label>Hora<input id="editReservationTime"></label>
          <label>Tarifa<select id="editReservationRate" onchange="rememberEditRateChoice()"></select></label>
          <label class="wide">Nota interna<textarea id="editReservationNote" rows="3"></textarea></label>
        </div>
        <div class="confirm-actions">
          <button onclick="closeReservationEdit()">Cancelar</button>
          <button class="primary" onclick="saveReservationEdit()">Guardar cambios</button>
        </div>
      </div>
    </div>
  </div>
  <div id="reservationArrivalBackdrop" class="modal-backdrop hidden" onclick="closeReservationArrival()">
    <div class="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="reservationArrivalTitle" onclick="event.stopPropagation()">
      <div class="modal-head">
        <div>
          <strong id="reservationArrivalTitle">Registrar llegada</strong>
          <div id="reservationArrivalSubtitle" class="muted"></div>
        </div>
        <button onclick="closeReservationArrival()">Cerrar</button>
      </div>
      <div class="modal-body">
        <div id="reservationArrivalDetails" class="day-reservation-details"></div>
        <label style="display:block; margin-top:16px">Habitacion asignada (opcional)
          <input id="reservationArrivalRoom" list="reservationArrivalRoomOptions" inputmode="numeric" placeholder="Ej. 101">
          <datalist id="reservationArrivalRoomOptions">
            ${HOTEL_ROOM_NUMBERS.map(room => `<option value="${room}"></option>`).join("")}
          </datalist>
        </label>
        <div id="reservationArrivalHelp" class="muted" style="margin-top:8px"></div>
        <div class="confirm-actions">
          <button onclick="closeReservationArrival()">Cancelar</button>
          <button class="primary" onclick="saveReservationArrival()">Registrar llegada</button>
        </div>
      </div>
    </div>
  </div>
  <div id="groupSendConfirmBackdrop" class="modal-backdrop hidden" onclick="closeGroupSendConfirm()">
    <div class="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="groupSendConfirmTitle" onclick="event.stopPropagation()">
      <div class="modal-head">
        <div>
          <strong id="groupSendConfirmTitle">Enviar reserva al grupo</strong>
          <div id="groupSendConfirmText" class="muted"></div>
        </div>
      </div>
      <div class="modal-body">
        <div class="confirm-actions">
          <button onclick="closeGroupSendConfirm()">No</button>
          <button class="primary" onclick="sendPendingReservationsToGroup()">Si, enviar al grupo</button>
        </div>
      </div>
    </div>
  </div>
  <div id="confirmDeleteBackdrop" class="modal-backdrop hidden" onclick="closeDeleteConfirm()">
    <div class="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirmDeleteTitle" onclick="event.stopPropagation()">
      <div class="modal-head">
        <div>
          <strong id="confirmDeleteTitle">Eliminar reserva</strong>
          <div class="muted">Esta accion libera el inventario del calendario.</div>
        </div>
      </div>
      <div class="modal-body">
        <div id="confirmDeleteText"></div>
        <div class="confirm-actions">
          <button onclick="closeDeleteConfirm()">Cancelar</button>
          <button class="danger" onclick="deleteSelectedReservation()">Eliminar</button>
        </div>
      </div>
    </div>
  </div>
  <div id="confirmRackBackdrop" class="modal-backdrop hidden" onclick="closeRackConfirm()">
    <div class="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirmRackTitle" onclick="event.stopPropagation()">
      <div class="modal-head">
        <div>
          <strong id="confirmRackTitle">Marcar habitacion ocupada</strong>
          <div class="muted">Actualiza el ultimo rack guardado.</div>
        </div>
      </div>
      <div class="modal-body">
        <div id="confirmRackText"></div>
        <div class="confirm-actions">
          <button onclick="closeRackConfirm()">Cancelar</button>
          <button class="primary" onclick="confirmRackRoomOccupied()">Marcar ocupada</button>
        </div>
      </div>
    </div>
  </div>
  <div id="quoteMenuModalBackdrop" class="modal-backdrop hidden" onclick="closeQuoteMenuModal()">
    <div class="modal quote-catalog-modal" role="dialog" aria-modal="true" aria-labelledby="quoteMenuModalTitle" onclick="event.stopPropagation()">
      <div class="modal-head">
        <div>
          <strong id="quoteMenuModalTitle">Catalogo de platillos</strong>
          <div class="muted">Edita precios y descripciones para el menu rapido de cotizaciones.</div>
        </div>
        <button onclick="closeQuoteMenuModal()">Cerrar</button>
      </div>
      <div class="modal-body">
        <div class="quote-menu-editor">
          <div class="quote-menu-editor-head">
            <div>
              <strong>Platillos disponibles</strong>
              <div class="muted">Agrega alimentos, coffee break o paquetes con precio por persona.</div>
            </div>
            <div class="quote-presets">
              <button onclick="addQuoteMenuEditorRow()">Agregar</button>
              <button class="primary" onclick="saveQuoteMenuCatalog()">Guardar catalogo</button>
            </div>
          </div>
          <div id="quoteMenuEditor"></div>
          <div id="quoteMenuStatus" class="quote-menu-status"></div>
        </div>
      </div>
    </div>
  </div>
  <div id="quoteEventModalBackdrop" class="modal-backdrop hidden" onclick="closeQuoteEventModal()">
    <div class="modal reservation-edit-modal" role="dialog" aria-modal="true" aria-labelledby="quoteEventModalTitle" onclick="event.stopPropagation()">
      <div class="modal-head">
        <div>
          <strong id="quoteEventModalTitle">Apartar salon desde cotizacion</strong>
          <div id="quoteEventModalSubtitle" class="muted"></div>
        </div>
        <button onclick="closeQuoteEventModal()">Cerrar</button>
      </div>
      <div class="modal-body">
        <div class="reservation-edit-grid">
          <label>Fecha evento<input id="quoteEventModalDate" type="date" onchange="renderEventAvailability('quote')"></label>
          <label>Salon<select id="quoteEventModalHall" onchange="renderEventAvailability('quote')"></select></label>
          <label>Estado
            <select id="quoteEventModalStatus">
              <option value="cotizacion">En cotizacion</option>
              <option value="apartado" selected>Apartado</option>
              <option value="pago_completo">Pago completo</option>
            </select>
          </label>
          <label>Total<input id="quoteEventModalTotal" type="number" min="0" step="0.01"></label>
          <label>Pagado<input id="quoteEventModalPaid" type="number" min="0" step="0.01" value="0"></label>
          <label class="wide">Notas<textarea id="quoteEventModalNotes" rows="3" placeholder="Notas internas del evento o pago"></textarea></label>
        </div>
        <div id="quoteEventAvailability" class="muted" style="margin-top:10px"></div>
        <div id="quoteEventModalStatusText" class="muted" style="margin-top:10px"></div>
        <div class="confirm-actions">
          <button onclick="closeQuoteEventModal()">Cancelar</button>
          <button class="primary" onclick="saveQuoteEventFromModal()">Apartar salon</button>
        </div>
      </div>
    </div>
  </div>
  <div id="eventDetailModalBackdrop" class="modal-backdrop hidden" onclick="closeEventDetailModal()">
    <div class="modal reservation-edit-modal" role="dialog" aria-modal="true" aria-labelledby="eventDetailTitle" onclick="event.stopPropagation()">
      <div class="modal-head">
        <div>
          <strong id="eventDetailTitle">Evento</strong>
          <div id="eventDetailSubtitle" class="muted"></div>
        </div>
        <button onclick="closeEventDetailModal()">Cerrar</button>
      </div>
      <div id="eventDetailBody" class="modal-body"></div>
    </div>
  </div>
  <script>
    let dashboardData = null;
    let calendarDate = new Date();
    let selectedStart = "";
    let selectedEnd = "";
    let pendingDeleteReservation = null;
    let pendingEditReservation = null;
    let pendingArrivalReservation = null;
    let pendingGroupReservations = [];
    let pendingRackRoom = null;
    let activeModalIsoDate = "";
    let reportsData = null;
    let quoteSectionsData = [
      {
        title: 'Hospedaje',
        category: 'habitaciones',
        quantity: 1,
        unitPrice: 700,
        includes: 'Recepcion 24 horas\\nEstacionamiento\\nInternet\\nTelevision por cable\\nAgua fria y caliente'
      }
    ];
    let quoteMenuItems = [];
    let eventHalls = [];
    let eventBookings = [];
    let roomBlocks = [];
    let pendingQuoteEvent = null;
    let pendingEventDetailId = null;
    let manualRateLocked = false;
    let editRateLocked = false;
    const hotelRateOptions = ${JSON.stringify(HOTEL_RATE_OPTIONS)};
    const hotelAutoRateValues = new Set(['', '$600', '600', '$650', '650', '$700', '700', '$800', '800', '$900', '900', '$1,000', '$1000', '1,000', '1000']);

    function renderHotelRateOptions(selectedValue) {
      const selected = String(selectedValue || '').trim();
      const options = hotelRateOptions.map(option =>
        '<option value="' + escapeHtml(option.value) + '"' + (option.value === selected ? ' selected' : '') + '>' + escapeHtml(option.label) + '</option>'
      );

      if (selected && !hotelRateOptions.some(option => option.value === selected)) {
        options.unshift('<option value="' + escapeHtml(selected) + '" selected>' + escapeHtml(selected) + ' (tarifa guardada)</option>');
      }

      return '<option value="">Sin tarifa</option>' + options.join('');
    }

    function normalizeClientRoomType(value) {
      const clean = String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '');

      if (clean.includes('suite') && clean.includes('king')) return 'Suite King';
      if (clean.includes('suite')) return 'Doble Suite';
      if (clean.includes('king')) return 'King';
      if (clean.includes('doble') || clean.includes('matrimonial') || clean.includes('2 camas')) return 'Doble';
      return String(value || '').trim();
    }

    function clientAdultsPerRoom(adults, rooms) {
      return Math.ceil(Math.max(Number(adults || 0), 0) / Math.max(Number(rooms || 1), 1));
    }

    function clientRateBase(value) {
      const text = String(value || '').trim().replace(/,/g, '');

      if (text === '$600' || text === '600') return 600;
      if (text === '$650' || text === '650') return 650;
      if (text === '$750' || text === '750' || text === '$850' || text === '850') return 650;
      return null;
    }

    function clientIsMananeraRate(value) {
      const text = String(value || '').trim().replace(/,/g, '');
      return text === '$900' || text === '900' || text === '$1000' || text === '1000';
    }

    function clientMoneyText(amount) {
      return '$' + Number(amount || 0).toLocaleString('en-US');
    }

    function calculateClientAutoRate(tipo, adultos, habitaciones) {
      const type = normalizeClientRoomType(tipo);
      const selectedBase = clientRateBase(arguments.length > 3 ? arguments[3] : '');

      if (type === 'King') return selectedBase ? clientMoneyText(selectedBase) : '$700';
      if (type === 'Suite King' || type === 'Doble Suite') return selectedBase ? clientMoneyText(selectedBase) : '$800';
      if (type === 'Doble') {
        return clientMoneyText(selectedBase || 700);
      }

      return '';
    }

    function calculateClientExtraAdults(tipo, adultos, habitaciones) {
      if (normalizeClientRoomType(tipo) !== 'Doble') {
        return { extraAdults: 0, extraAmount: 0 };
      }

      const perRoom = clientAdultsPerRoom(adultos, habitaciones);
      const extraAdults = Math.max(Math.min(perRoom, 4) - 2, 0);
      return {
        extraAdults,
        extraAmount: extraAdults * 100
      };
    }

    function validateClientOccupancy(tipo, adultos, habitaciones) {
      const type = normalizeClientRoomType(tipo);
      const perRoom = clientAdultsPerRoom(adultos, habitaciones);
      const max = type === 'King'
        ? 2
        : (type === 'Doble' || type === 'Suite King' || type === 'Doble Suite' ? 4 : 0);

      return !max || perRoom <= max;
    }

    function shouldAutoUpdateRate(value, locked) {
      if (clientIsMananeraRate(value)) {
        return false;
      }

      return !locked || hotelAutoRateValues.has(String(value || '').trim());
    }

    function rememberManualRateChoice() {
      manualRateLocked = clientIsMananeraRate(manualTarifa.value) || !hotelAutoRateValues.has(String(manualTarifa.value || '').trim());
    }

    function rememberEditRateChoice() {
      editRateLocked = clientIsMananeraRate(editReservationRate.value) || !hotelAutoRateValues.has(String(editReservationRate.value || '').trim());
    }

    function refreshManualRate() {
      const rate = calculateClientAutoRate(manualTipo.value, manualAdultos.value, manualHabitaciones.value, manualTarifa.value);

      if (rate && shouldAutoUpdateRate(manualTarifa.value, manualRateLocked)) {
        manualTarifa.value = rate;
        manualRateLocked = false;
      }

      if (!validateClientOccupancy(manualTipo.value, manualAdultos.value, manualHabitaciones.value)) {
        manualReservationStatus.textContent = 'La ocupacion excede el maximo para este tipo. Niños no cuentan para extra.';
        return;
      }

      const extra = calculateClientExtraAdults(manualTipo.value, manualAdultos.value, manualHabitaciones.value);
      manualReservationStatus.textContent = extra.extraAmount
        ? 'Extra adulto(s): ' + extra.extraAdults + ' / +$' + extra.extraAmount + '. Se agregara al mensaje y guardado; la tarifa base no cambia.'
        : '';
    }

    function refreshEditRate() {
      const rate = calculateClientAutoRate(editReservationType.value, editReservationAdults.value, editReservationRooms.value, editReservationRate.value);

      if (rate && shouldAutoUpdateRate(editReservationRate.value, editRateLocked)) {
        editReservationRate.value = rate;
        editRateLocked = false;
      }
    }

    const helpTopics = {
      today: {
        title: 'Vista de hoy',
        body: 'Es el tablero rapido para recepcion. Junta llegadas, ocupacion, eventos del dia, pagos pendientes y habitaciones bloqueadas.\\n\\nUsalo al iniciar turno para saber que se espera hoy sin navegar por todos los tabs.'
      },
      search: {
        title: 'Buscador global',
        body: 'Busca en reservas, historial de huespedes, eventos, cotizaciones y bloqueos.\\n\\nPuedes escribir nombre, telefono, folio, habitacion, salon o clave de cotizacion. Si hay historial en MySQL, tambien muestra estancias anteriores del huesped.'
      },
      whatsapp: {
        title: 'Estado de WhatsApp',
        body: 'Aqui ves si cada bot esta conectado o esperando QR.\\n\\nBot principal: atiende reservas y mensajes normales.\\nBot nocturno: se usa fuera de horario si esta configurado.\\n\\nSi aparece QR, escanealo desde WhatsApp para volver a conectar esa sesion. Si dice conectado, no tienes que hacer nada.'
      },
      overbooking: {
        title: 'Alertas de sobreventa',
        body: 'Te avisa cuando una fecha supera el limite por tipo de habitacion.\\n\\nEjemplo: si hay mas Dobles reservadas que el limite disponible, aparece aqui.\\n\\nUsalo antes de aceptar grupos grandes o importar Excel para detectar fechas peligrosas.'
      },
      arrivals: {
        title: 'Llegadas de hoy',
        body: 'Muestra reservas cuya entrada es hoy.\\n\\nDesde cada reserva puedes registrar llegada y, si quieres, asignar habitacion. Al asignarla, el rack marca esa habitacion como ocupada.\\n\\nNo manda aviso al grupo por llegada; solo actualiza el sistema.'
      },
      rackGlobal: {
        title: 'Rack global',
        body: 'Resume el ultimo rack guardado: ocupadas, vacias limpias, vacias sucias y bloqueadas.\\n\\nLos colores por tipo ayudan a ubicar rapido King, Dobles y Suites.\\n\\nSi el rack no coincide con recepcion, importa el CSV actualizado en el tab Rack.'
      },
      upcoming: {
        title: 'Proximas reservas por fecha',
        body: 'Lista las fechas con reservas proximas y su ocupacion.\\n\\nDa una vista rapida sin abrir todo el calendario. Sirve para revisar fines de semana, grupos o dias con carga alta.'
      },
      calendar: {
        title: 'Calendario de reservas',
        body: 'Cada dia muestra cuantas habitaciones estan reservadas de las 69.\\n\\nDa clic en Ver para abrir el detalle del dia: huespedes, tipo, hora, telefono, tarifa, notas, llegada y habitacion asignada.\\n\\nManual/Excel y Bot se separan para saber de donde vino cada reserva.'
      },
      reservations: {
        title: 'Agregar reservas',
        body: 'Captura manual: llena huesped, telefono, entrada/salida, habitaciones, personas, tipo, hora, tarifa y nota.\\n\\nImportar CSV: pega o sube un archivo con reservas; el sistema las convierte al calendario.\\n\\nDespues de agregar, puedes decidir si mandar la reserva al grupo. Si tiene nota, tambien se incluye.'
      },
      reservationList: {
        title: 'Reservas registradas',
        body: 'Aqui aparecen las reservas del bot tradicional.\\n\\nPuedes guardar notas internas, cancelar folios o registrar llegada.\\n\\nLas notas son internas del dashboard y ayudan a recepcion: anticipo, llegada tarde, peticiones, etc.'
      },
      quotes: {
        title: 'Cotizaciones',
        body: 'Sirve para crear documentos de cotizacion listos para imprimir o guardar como PDF.\\n\\n1. Llena cliente/contacto/evento.\\n2. Elige fecha y salon si aplica.\\n3. Agrega apartados: salon, menu, hospedaje u otros.\\n4. Guarda y abre el PDF.\\n\\nSi la cotizacion se confirma, usa Apartar salon para mandarla al tab Eventos.'
      },
      quoteClient: {
        title: 'Datos del cliente en cotizacion',
        body: 'Cliente y contacto identifican a quien se le entrega la cotizacion.\\n\\nFecha evento y Salon son importantes si despues quieres apartar el salon desde esa cotizacion.\\n\\nVigencia indica hasta cuando respetas precios o disponibilidad.'
      },
      quoteDocument: {
        title: 'Presentacion del documento',
        body: 'Visual hotel: formato mas comercial, con estilo de folleto.\\n\\nFormal: mas sobrio, tipo carta/cotizacion.\\n\\nFechas/estancia se imprime como texto visible para el cliente. Personas ayuda a calcular menus por persona.'
      },
      quoteSections: {
        title: 'Apartados de cotizacion',
        body: 'Cada apartado suma al total.\\n\\nHospedaje: habitaciones o noches.\\nSalon: renta o paquete del salon.\\nMenu/persona: alimentos; si activas servicio %, se calcula sobre alimentos.\\nOtro: cargos especiales, extras o descuentos positivos/negativos si los manejas como linea.'
      },
      events: {
        title: 'Eventos y salones',
        body: 'Calendario operativo de Margaritas, Tulipanes y Girasoles.\\n\\nEstados:\\n- En cotizacion: aun no confirmado.\\n- Apartado: fecha/salon reservado con anticipo o confirmacion.\\n- Pago completo: liquidado.\\n\\nLa barra muestra porcentaje pagado contra el total. Los comprobantes quedan guardados en el evento.'
      },
      manualEvent: {
        title: 'Apartar evento desde cero',
        body: 'Usalo cuando el evento no viene de una cotizacion guardada.\\n\\nLlena cliente, fecha, salon, estado, total y pagado.\\n\\nDespues puedes subir imagenes de vouchers o comprobantes. Si ya existe una cotizacion, es mejor apartar desde la cotizacion para que quede vinculada.'
      },
      rack: {
        title: 'Rack',
        body: 'Importa el CSV del sistema para actualizar ocupadas, vacias y bloqueadas.\\n\\nTambien puedes analizar una foto del rack, pero el CSV es mas confiable.\\n\\nCuando registras llegada con habitacion, el sistema puede marcar esa habitacion como ocupada en el ultimo rack.'
      },
      roomBlocks: {
        title: 'Bloqueos de habitacion',
        body: 'Sirve para sacar una habitacion de operacion por mantenimiento, limpieza profunda, clima, pintura o cualquier pendiente.\\n\\nEl bloqueo queda con rango de fechas y notas para que recepcion y mantenimiento sepan por que no debe asignarse.'
      },
      reports: {
        title: 'Reportes',
        body: 'Reportes operativos para administracion.\\n\\nOcupacion diaria: cuartos ocupados por fecha.\\nRotacion: dias ocupados por habitacion en el mes.\\nMantenimiento/notas: limpieza profunda, climas, pintura o pendientes por habitacion.\\n\\nSirve para decidir que habitaciones rotar y cuales requieren mantenimiento.'
      }
    };

    function openHelp(topic) {
      const help = helpTopics[topic] || {
        title: 'Ayuda',
        body: 'Sin ayuda registrada para esta seccion.'
      };
      helpModalTitle.textContent = help.title;
      helpModalBody.textContent = help.body;
      helpModalBackdrop.classList.remove('hidden');
    }

    function closeHelp() {
      helpModalBackdrop.classList.add('hidden');
    }

    async function loadBotStatus() {
      try {
        const response = await fetch('/api/bot-status');
        const status = await response.json();
        renderBotStatuses(status.instances || [status]);
      } catch (error) {
        botStatusList.innerHTML = '<div class="muted">No se pudo leer el estado de WhatsApp: ' + escapeHtml(error.message || '') + '</div>';
      }
    }

    function renderBotStatuses(instances) {
      const labels = {
        open: 'Conectado',
        qr: 'Esperando escaneo de QR',
        close: 'Desconectado',
        unknown: 'Sin estado'
      };

      botStatusList.innerHTML = instances.map(instance => {
        const connection = instance.connection || 'unknown';
        const availability = instance.availability === 'inactive'
          ? 'Fuera de horario'
          : 'Activo';
        const qr = instance.qrDataUrl
          ? '<div class="qr-box"><img src="' + instance.qrDataUrl + '" alt="QR de ' + escapeHtml(instance.label || instance.id || 'WhatsApp') + '"><div class="muted">Escanea este codigo desde WhatsApp.</div></div>'
          : '';

        return '<div class="bot-status-card">' +
          '<div class="bot-status">' +
            '<div>' +
              '<strong>' + escapeHtml(instance.label || instance.id || 'Bot') + '</strong>' +
              '<div class="status-row"><span class="status-dot ' + escapeHtml(connection) + '"></span><span>' + escapeHtml(labels[connection] || connection) + '</span><span class="pill">' + escapeHtml(availability) + '</span></div>' +
              '<div class="muted">' + escapeHtml(instance.schedule || instance.detail || '') + '</div>' +
              '<div class="muted">' + (instance.updatedAt ? 'Actualizado: ' + escapeHtml(new Date(instance.updatedAt).toLocaleString()) : '') + '</div>' +
            '</div>' +
            qr +
          '</div>' +
        '</div>';
      }).join('');
    }

    async function loadDashboard() {
      const response = await fetch('/api/summary');
      const data = await response.json();
      dashboardData = data;

      if (!closeStart.value) {
        closeStart.value = data.today;
        closeEnd.value = data.today;
        selectedStart = data.today;
        selectedEnd = data.today;
        calendarDate = isoToDate(data.today);
      }

      activeCount.textContent = data.totals.active;
      groupReservationCount.textContent = data.totals.groupReservations;
      todayReservationCount.textContent = data.todayReservations?.reservations || 0;
      todayReservationRooms.textContent =
        (data.todayReservations?.occupied || 0) +
        '/' +
        (data.totalRooms || 69) +
        ' habitaciones';
      canceledCount.textContent = data.totals.canceled;
      limits.innerHTML = Object.entries(data.limits)
        .map(([type, limit]) => '<span><b>' + escapeHtml(type) + '</b><b>' + limit + '</b></span>')
        .join('');
      updatedAt.textContent = 'Actualizado: ' + new Date(data.generatedAt).toLocaleString();
      if (!reportMonth.value) {
        reportMonth.value = String(data.today || '').slice(0, 7);
      }
      if (!roomEventDate.value) {
        roomEventDate.value = data.today;
      }

      renderRackDashboard(data.rackStatus);
      renderRackRoomGrid(data.rackStatus);
      overbookingAlerts.innerHTML = renderOverbookingAlerts(data.overbookingAlerts || []);
      todayArrivals.innerHTML = renderTodayArrivals(data.todayArrivals || []);
      quoteMenuItems = Array.isArray(data.quotationMenu) ? data.quotationMenu : [];
      eventHalls = Array.isArray(data.eventHalls) ? data.eventHalls : [];
      eventBookings = Array.isArray(data.eventBookings) ? data.eventBookings : [];
      roomBlocks = Array.isArray(data.roomBlocks) ? data.roomBlocks : [];
      if (!blockStart.value) {
        blockStart.value = data.today;
        blockEnd.value = data.today;
      }
      renderQuoteMenuOptions();
      renderQuoteMenuEditor();
      renderQuoteSections();
      renderQuotationList(data.quotations || []);
      renderHallSelects();
      renderEventAlerts();
      renderEventCalendar();
      renderEventList();
      renderTodayView();
      renderRoomBlocks();
      occupancy.innerHTML = renderOccupancy(data.occupancy);
      reservations.innerHTML = renderReservations(data.reservations);
      updateSelectionSummary();
      renderCalendar();
      renderGroupReservationDetail(closeStart.value || data.today);
    }

    function renderTodayView() {
      if (!dashboardData) {
        todayView.innerHTML = '<div class="muted">Cargando vista de hoy...</div>';
        return;
      }

      const todayIso = dashboardData.today;
      const todayDisplay = isoToDisplay(todayIso);
      const arrivals = dashboardData.todayArrivals || [];
      const todayEvents = eventBookings.filter(event => event.eventDate === todayIso);
      const activeBlocks = roomBlocks.filter(block =>
        block.status === 'activo' &&
        block.startDate <= todayIso &&
        block.endDate >= todayIso
      );
      const paymentAlerts = eventBookings
        .filter(event =>
          event.status !== 'pago_completo' &&
          Number(event.totalAmount || 0) > Number(event.paidAmount || 0)
        )
        .sort((a, b) => String(a.eventDate || '').localeCompare(String(b.eventDate || '')))
        .slice(0, 6);

      todayView.innerHTML =
        '<div class="report-kpis">' +
          renderReportKpi('Fecha', todayDisplay) +
          renderReportKpi('Llegadas', arrivals.length) +
          renderReportKpi('Ocupacion calendario', (dashboardData.todayReservations?.occupied || 0) + '/' + (dashboardData.totalRooms || 69)) +
          renderReportKpi('Eventos hoy', todayEvents.length) +
        '</div>' +
        '<div class="today-grid">' +
          renderTodayCard('Llegadas de hoy', arrivals.length ? arrivals.slice(0, 8).map(renderArrivalMiniItem).join('') : '<div class="muted">Sin llegadas registradas para hoy.</div>') +
          renderTodayCard('Eventos de hoy', todayEvents.length ? todayEvents.map(renderEventMiniItem).join('') : '<div class="muted">Sin eventos hoy.</div>') +
          renderTodayCard('Pagos pendientes', paymentAlerts.length ? paymentAlerts.map(renderPaymentMiniItem).join('') : '<div class="muted">Sin saldos pendientes importantes.</div>') +
          renderTodayCard('Bloqueos activos', activeBlocks.length ? activeBlocks.map(renderBlockMiniItem).join('') : '<div class="muted">Sin habitaciones bloqueadas hoy.</div>') +
        '</div>';
    }

    function renderTodayCard(title, body) {
      return '<div class="today-card"><h3>' + escapeHtml(title) + '</h3><div class="mini-list">' + body + '</div></div>';
    }

    function renderArrivalMiniItem(reservation) {
      return '<div class="mini-item">' +
        '<strong>' + escapeHtml(reservation.nombre || reservation.name || 'Reserva') + '</strong>' +
        '<div class="muted">' + escapeHtml(reservation.habitaciones || 1) + ' hab · ' + escapeHtml(reservation.tipo || '-') + ' · ' + escapeHtml(reservation.hora || '-') + '</div>' +
        '<div>' + escapeHtml(reservation.telefono || '') + '</div>' +
      '</div>';
    }

    function renderEventMiniItem(event) {
      return '<div class="mini-item">' +
        '<strong>' + escapeHtml(event.eventName || event.client || 'Evento') + '</strong>' +
        '<div class="muted">' + escapeHtml(event.hallName || '-') + ' · ' + escapeHtml(event.status || '-') + '</div>' +
        '<div>' + formatMoney(event.paidAmount || 0) + ' / ' + formatMoney(event.totalAmount || 0) + '</div>' +
      '</div>';
    }

    function renderPaymentMiniItem(event) {
      const pending = Math.max(Number(event.totalAmount || 0) - Number(event.paidAmount || 0), 0);
      return '<div class="mini-item">' +
        '<strong>' + escapeHtml(event.eventName || event.client || 'Evento') + '</strong>' +
        '<div class="muted">' + escapeHtml(isoToDisplay(event.eventDate || '') || '-') + ' · ' + escapeHtml(event.hallName || '-') + '</div>' +
        '<div>Pendiente: <strong>' + formatMoney(pending) + '</strong></div>' +
      '</div>';
    }

    function renderBlockMiniItem(block) {
      return '<div class="mini-item">' +
        '<strong>Hab ' + escapeHtml(block.roomNumber || '-') + '</strong>' +
        '<div class="muted">' + escapeHtml(isoToDisplay(block.startDate || '') || '-') + ' al ' + escapeHtml(isoToDisplay(block.endDate || '') || '-') + '</div>' +
        '<div>' + escapeHtml(block.reason || '-') + '</div>' +
      '</div>';
    }

    function showView(name) {
      ['today', 'main', 'calendar', 'reservations', 'quotes', 'events', 'rack', 'reports'].forEach(view => {
        const panel = document.getElementById('view-' + view);
        const tab = document.getElementById('tab-' + view);

        if (panel) {
          panel.classList.toggle('hidden', view !== name);
        }

        if (tab) {
          tab.classList.toggle('active', view === name);
        }
      });

      if (name === 'reports') {
        loadReports();
      }
    }

    function handleGlobalSearchKey(event) {
      if (event.key === 'Enter') {
        runGlobalSearch();
      }
    }

    async function runGlobalSearch() {
      const query = globalSearchInput.value.trim();

      if (query.length < 2) {
        globalSearchResults.classList.remove('hidden');
        globalSearchResults.innerHTML = '<div class="muted">Escribe al menos 2 caracteres para buscar.</div>';
        return;
      }

      globalSearchResults.classList.remove('hidden');
      globalSearchResults.innerHTML = '<div class="muted">Buscando...</div>';

      const response = await fetch('/api/search?q=' + encodeURIComponent(query));
      const data = await response.json();

      if (!data.ok) {
        globalSearchResults.innerHTML = '<div class="muted">' + escapeHtml(data.error || 'No se pudo buscar') + '</div>';
        return;
      }

      renderGlobalSearchResults(data.results || {});
    }

    function renderGlobalSearchResults(results) {
      const sections = [
        ['Reservas', results.reservations || [], renderSearchReservation],
        ['Historial huespedes', results.guests || [], renderSearchGuest],
        ['Eventos', results.events || [], renderSearchEvent],
        ['Cotizaciones', results.quotations || [], renderSearchQuote],
        ['Bloqueos', results.blocks || [], renderSearchBlock]
      ];
      const total = sections.reduce((sum, [, rows]) => sum + rows.length, 0);

      if (!total) {
        globalSearchResults.innerHTML = '<div class="muted">Sin resultados para "' + escapeHtml(results.query || '') + '".</div>';
        return;
      }

      globalSearchResults.innerHTML =
        '<div class="search-grid">' +
          sections
            .filter(([, rows]) => rows.length)
            .map(([title, rows, renderer]) =>
              '<div class="search-card"><h3>' + escapeHtml(title) + '</h3><div class="mini-list">' +
              rows.map(renderer).join('') +
              '</div></div>'
            )
            .join('') +
        '</div>';
    }

    function renderSearchReservation(reservation) {
      const dates = Array.isArray(reservation.dates)
        ? reservation.dates.join(', ')
        : (reservation.fecha || reservation.startDate || '-');
      const isoDate = Array.isArray(reservation.dates) && reservation.dates[0]
        ? displayToIsoClient(reservation.dates[0])
        : displayToIsoClient(reservation.fecha || reservation.startDate || '');
      return '<button class="mini-item search-result-button" onclick="openSearchReservation(\\'' + escapeJs(isoDate) + '\\', \\'' + escapeJs(reservation.sourceKey || '') + '\\')">' +
        '<strong>' + escapeHtml(reservation.nombre || reservation.guestName || 'Reserva') + '</strong>' +
        '<div class="muted">' + escapeHtml(dates) + ' · ' + escapeHtml(reservation.tipo || reservation.roomType || '-') + ' · ' + escapeHtml(reservation.source || reservation.origen || '') + '</div>' +
        '<div>' + escapeHtml(reservation.telefono || reservation.phone || '') + '</div>' +
      '</button>';
    }

    function renderSearchGuest(row) {
      return '<button class="mini-item search-result-button" onclick="openSearchGuest(\\'' + escapeJs(row.reservationId || '') + '\\')">' +
        '<strong>' + escapeHtml(row.guestName || 'Huesped') + '</strong>' +
        '<div class="muted">' + escapeHtml(row.dates || row.startDate || '-') + ' · ' + escapeHtml(row.source || '-') + ' · ' + escapeHtml(row.status || '-') + '</div>' +
        '<div>Hab: ' + escapeHtml(row.assignedRoom || '-') + ' · Tipo: ' + escapeHtml(row.roomType || '-') + '</div>' +
        '<div class="muted">' + escapeHtml(row.phone || '') + (row.note ? ' · Nota: ' + escapeHtml(row.note) : '') + '</div>' +
      '</button>';
    }

    function renderSearchEvent(event) {
      return '<button class="mini-item search-result-button" onclick="openSearchEvent(\\'' + escapeJs(event.id || '') + '\\')">' +
        '<strong>' + escapeHtml(event.eventName || event.client || 'Evento') + '</strong>' +
        '<div class="muted">' + escapeHtml(isoToDisplay(event.eventDate || '') || event.eventDate || '-') + ' · ' + escapeHtml(event.hallName || '-') + ' · ' + escapeHtml(event.status || '-') + '</div>' +
        '<div>' + escapeHtml(event.client || '') + '</div>' +
      '</button>';
    }

    function renderSearchQuote(quote) {
      return '<button class="mini-item search-result-button" onclick="openSearchQuote(\\'' + escapeJs(quote.id || '') + '\\')">' +
        '<strong>' + escapeHtml(quote.id || 'Cotizacion') + '</strong>' +
        '<div class="muted">' + escapeHtml(quote.client || '-') + ' · ' + escapeHtml(quote.eventName || '-') + '</div>' +
        '<div>' + escapeHtml(quote.eventDate || '') + ' · ' + escapeHtml(quote.hallName || quote.hall || 'Sin salon') + '</div>' +
      '</button>';
    }

    function renderSearchBlock(block) {
      return '<button class="mini-item search-result-button" onclick="openSearchBlock(\\'' + escapeJs(block.id || '') + '\\')">' +
        '<strong>Hab ' + escapeHtml(block.roomNumber || '-') + '</strong>' +
        '<div class="muted">' + escapeHtml(isoToDisplay(block.startDate || '') || '-') + ' al ' + escapeHtml(isoToDisplay(block.endDate || '') || '-') + ' · ' + escapeHtml(block.status || '-') + '</div>' +
        '<div>' + escapeHtml(block.reason || '-') + '</div>' +
      '</button>';
    }

    function closeGlobalSearchResults() {
      globalSearchResults.classList.add('hidden');
    }

    function openSearchReservation(isoDate, sourceKey) {
      closeGlobalSearchResults();

      if (isoDate) {
        activeModalIsoDate = isoDate;
      }

      if (sourceKey) {
        openReservationArrivalByKey(sourceKey);
        return;
      }

      const reservation = (dashboardData?.groupReservations || []).find(row =>
        row.sourceKey === sourceKey ||
        (isoDate && (row.dates || [row.fecha]).map(displayToIsoClient).includes(isoDate))
      );
      openSearchDetailModal(
        'Reserva',
        reservation?.nombre || 'Reserva encontrada',
        renderSearchReservationDetail(reservation || {})
      );
    }

    function openSearchGuest(reservationId) {
      closeGlobalSearchResults();
      fetch('/api/guest-history?q=' + encodeURIComponent(globalSearchInput.value.trim()))
        .then(response => response.json())
        .then(data => {
          const row = (data.history || []).find(item => String(item.reservationId) === String(reservationId)) || (data.history || [])[0];
          openSearchDetailModal(
            'Historial de huesped',
            row?.guestName || 'Huesped',
            renderGuestHistoryDetail(row || {})
          );
        })
        .catch(error =>
          openSearchDetailModal('Historial de huesped', 'No se pudo cargar', '<div class="muted">' + escapeHtml(error.message || '') + '</div>')
        );
    }

    function openSearchEvent(eventId) {
      closeGlobalSearchResults();
      openEventDetail(eventId);
    }

    function openSearchQuote(quotationId) {
      closeGlobalSearchResults();
      const quote = (dashboardData?.quotations || []).find(row => row.id === quotationId);

      if (!quote) {
        openSearchDetailModal('Cotizacion', quotationId || 'Cotizacion', '<div class="muted">No se encontro la cotizacion en memoria. Actualiza el dashboard.</div>');
        return;
      }

      openSearchDetailModal(
        'Cotizacion ' + (quote.id || ''),
        quote.client || quote.eventName || 'Sin cliente',
        renderQuoteDetail(quote)
      );
    }

    function openSearchBlock(blockId) {
      closeGlobalSearchResults();
      const block = roomBlocks.find(item => String(item.id) === String(blockId));
      openSearchDetailModal(
        'Bloqueo de habitacion',
        block ? 'Habitacion ' + block.roomNumber : 'Bloqueo',
        renderBlockDetail(block || {})
      );
    }

    function openSearchDetailModal(title, subtitle, bodyHtml) {
      searchDetailTitle.textContent = title;
      searchDetailSubtitle.textContent = subtitle || '';
      searchDetailBody.innerHTML = bodyHtml || '<div class="muted">Sin detalle.</div>';
      searchDetailModalBackdrop.classList.remove('hidden');
      document.body.classList.add('modal-open');
    }

    function closeSearchDetailModal() {
      searchDetailModalBackdrop.classList.add('hidden');
      document.body.classList.remove('modal-open');
    }

    function renderSearchReservationDetail(reservation) {
      return '<div class="event-detail-grid">' +
        renderDetailBox('Huesped', reservation.nombre || reservation.guestName || '-') +
        renderDetailBox('Telefono', reservation.telefono || reservation.phone || '-') +
        renderDetailBox('Fechas', (reservation.dates || [reservation.fecha || reservation.startDate]).filter(Boolean).join(', ') || '-') +
        renderDetailBox('Habitaciones', reservation.habitaciones || reservation.roomsCount || '-') +
        renderDetailBox('Tipo / hora', (reservation.tipo || reservation.roomType || '-') + ' / ' + (reservation.hora || reservation.arrivalTime || '-')) +
        renderDetailBox('Tarifa', getReservationPricingText(reservation)) +
      '</div>' +
      '<div class="event-detail-box"><span>Nota</span><div>' + escapeHtml(reservation.note || reservation.nota || 'Sin nota') + '</div></div>';
    }

    function renderGuestHistoryDetail(row) {
      return '<div class="event-detail-grid">' +
        renderDetailBox('Huesped', row.guestName || '-') +
        renderDetailBox('Telefono', row.phone || '-') +
        renderDetailBox('Fechas', row.dates || row.startDate || '-') +
        renderDetailBox('Fuente / estado', (row.source || '-') + ' / ' + (row.status || '-')) +
        renderDetailBox('Habitacion', row.assignedRoom || '-') +
        renderDetailBox('Tipo', row.roomType || '-') +
        renderDetailBox('Tarifa', row.rate || '-') +
        renderDetailBox('Folio', row.folio || '-') +
      '</div>' +
      '<div class="event-detail-box"><span>Nota</span><div>' + escapeHtml(row.note || 'Sin nota') + '</div></div>';
    }

    function renderQuoteDetail(quote) {
      return '<div class="event-detail-grid">' +
        renderDetailBox('Cliente', quote.client || '-') +
        renderDetailBox('Contacto', quote.contact || '-') +
        renderDetailBox('Evento', quote.eventName || quote.headline || '-') +
        renderDetailBox('Fecha', quote.eventDate || '-') +
        renderDetailBox('Salon', quote.hallName || quote.hallCode || 'Sin salon') +
        renderDetailBox('Total', formatMoney(quote.total || 0)) +
      '</div>' +
      '<div class="confirm-actions"><button onclick="openQuotationPdf(\\'' + escapeJs(quote.id || '') + '\\')">Abrir PDF</button><button class="primary" onclick="closeSearchDetailModal(); openQuoteEventModal(\\'' + escapeJs(quote.id || '') + '\\')">Apartar salon</button></div>';
    }

    function renderBlockDetail(block) {
      return '<div class="event-detail-grid">' +
        renderDetailBox('Habitacion', block.roomNumber || '-') +
        renderDetailBox('Fechas', (isoToDisplay(block.startDate || '') || '-') + ' al ' + (isoToDisplay(block.endDate || '') || '-')) +
        renderDetailBox('Estado', block.status || '-') +
        renderDetailBox('Motivo', block.reason || '-') +
      '</div>' +
      '<div class="event-detail-box"><span>Notas</span><div>' + escapeHtml(block.notes || 'Sin notas') + '</div></div>';
    }

    function renderDetailBox(label, value) {
      return '<div class="event-detail-box"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
    }

    function getReservationPricingText(reservation) {
      const parts = [
        reservation.tarifa || reservation.rate || '-'
      ];

      if (reservation.mananera) {
        parts.push('Mañanera');
      }

      if (Number(reservation.extraAmount || 0) > 0) {
        parts.push('Extra adulto(s): ' + Number(reservation.extraAdults || 0) + ' / +$' + Number(reservation.extraAmount || 0).toLocaleString('es-MX'));
      }

      return parts.join(' · ');
    }

    function openQuotationPdf(quotationId) {
      if (!quotationId) {
        return;
      }
      window.open('/api/quotations/' + encodeURIComponent(quotationId) + '/print', '_blank');
    }

    function displayToIsoClient(value) {
      const text = String(value || '').trim();
      const iso = text.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
      if (iso) {
        return iso[1] + '-' + iso[2] + '-' + iso[3];
      }
      const display = text.match(/^(\\d{2})\\/(\\d{2})\\/(\\d{4})$/);
      if (!display) {
        return '';
      }
      return display[3] + '-' + display[2] + '-' + display[1];
    }

    async function loadReports() {
      const month = reportMonth.value || String(dashboardData?.today || '').slice(0, 7);
      const response = await fetch('/api/reports?month=' + encodeURIComponent(month));
      const data = await response.json();

      if (!data.ok) {
        reportMode.textContent = data.error || 'No se pudieron cargar reportes.';
        return;
      }

      reportsData = data.reports;
      renderReports(reportsData);
    }

    function renderReports(report) {
      const daily = report.dailyOccupancy || [];
      const totalOccupied = daily.reduce((total, row) => total + Number(row.occupiedRooms || 0), 0);
      const avgOccupancy = daily.length
        ? Math.round(daily.reduce((total, row) => total + Number(row.occupancyPercent || 0), 0) / daily.length)
        : 0;
      const topRoom = (report.roomRotation || [])[0];
      const dueCount = (report.serviceDue || []).filter(row =>
        Number(row.daysSinceDeepClean || 0) >= 30 || Number(row.daysSinceAcMaintenance || 0) >= 90
      ).length;

      reportMode.textContent = report.mode === 'mysql'
        ? 'Datos desde MySQL normalizado.'
        : 'Modo parcial: activa MySQL para historial exacto por habitacion y mantenimiento.';
      reportKpis.innerHTML =
        renderReportKpi('Dias con ocupacion', daily.length) +
        renderReportKpi('Room nights mes', totalOccupied) +
        renderReportKpi('Ocupacion promedio', avgOccupancy + '%') +
        renderReportKpi('Cuartos por revisar', dueCount);

      dailyOccupancyReport.innerHTML = renderDailyOccupancyTable(daily);
      roomRotationReport.innerHTML = renderRoomRotationTable(report.roomRotation || []);
      serviceDueReport.innerHTML = renderServiceDueTable(report.serviceDue || []);
      sourceReport.innerHTML = renderSourceReport(report.reservationsBySource || []);
      eventReport.innerHTML = renderEventReport(report.eventSummary || [], report.events || []);
      roomEventsReport.innerHTML = renderRoomEventsTable(report.roomEvents || []);
      renderRoomEventOptions(report);
    }

    function renderReportKpi(label, value) {
      return '<div class="report-kpi"><span class="muted">' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
    }

    function renderDailyOccupancyTable(rows) {
      if (!rows.length) {
        return '<div class="muted">Sin ocupacion para este mes.</div>';
      }

      return '<table class="report-table"><thead><tr><th>Fecha</th><th>Ocupadas</th><th>%</th></tr></thead><tbody>' +
        rows.map(row =>
          '<tr><td>' + escapeHtml(row.date) + '</td><td>' + escapeHtml(row.occupiedRooms || 0) + '</td><td>' + escapeHtml(row.occupancyPercent || 0) + '%</td></tr>'
        ).join('') +
      '</tbody></table>';
    }

    function renderRoomRotationTable(rows) {
      if (!rows.length) {
        return '<div class="muted">Sin habitaciones asignadas en este mes. El historico exacto se llena cuando se registra llegada con habitacion.</div>';
      }

      return '<table class="report-table"><thead><tr><th>Hab</th><th>Tipo</th><th>Noches</th><th>Ultima ocupacion</th><th>Limpieza profunda</th><th>Clima</th><th>Mantenimiento</th></tr></thead><tbody>' +
        rows.map(row =>
          '<tr>' +
            '<td><strong>' + escapeHtml(row.roomNumber || '-') + '</strong></td>' +
            '<td>' + escapeHtml(row.roomType || '-') + '</td>' +
            '<td>' + escapeHtml(row.occupiedNights || 0) + '</td>' +
            '<td>' + escapeHtml(row.lastOccupiedDate || '-') + '</td>' +
            '<td>' + escapeHtml(row.lastDeepCleanDate || '-') + '</td>' +
            '<td>' + escapeHtml(row.lastAcMaintenanceDate || '-') + '</td>' +
            '<td>' + escapeHtml(row.lastMaintenanceDate || '-') + '</td>' +
          '</tr>'
        ).join('') +
      '</tbody></table>';
    }

    function renderServiceDueTable(rows) {
      if (!rows.length) {
        return '<div class="muted">Sin datos de habitaciones.</div>';
      }

      return '<table class="report-table"><thead><tr><th>Hab</th><th>30 dias</th><th>Clima</th><th>Uso 30d</th></tr></thead><tbody>' +
        rows.slice(0, 18).map(row => {
          const deep = row.daysSinceDeepClean === null || row.daysSinceDeepClean === undefined
            ? '-'
            : row.daysSinceDeepClean + ' dias';
          const ac = row.daysSinceAcMaintenance === null || row.daysSinceAcMaintenance === undefined
            ? '-'
            : row.daysSinceAcMaintenance + ' dias';
          return '<tr>' +
            '<td><strong>' + escapeHtml(row.roomNumber || '-') + '</strong><br><span class="muted">' + escapeHtml(row.roomType || '') + '</span></td>' +
            '<td>' + escapeHtml(deep) + '<br><span class="muted">' + escapeHtml(row.lastDeepCleanDate || 'Sin fecha') + '</span></td>' +
            '<td>' + escapeHtml(ac) + '<br><span class="muted">' + escapeHtml(row.lastAcMaintenanceDate || 'Sin fecha') + '</span></td>' +
            '<td>' + escapeHtml(row.occupiedNightsLast30Days || 0) + '</td>' +
          '</tr>';
        }).join('') +
      '</tbody></table>';
    }

    function renderSourceReport(rows) {
      if (!rows.length) {
        return '<div class="muted">Sin datos de fuentes.</div>';
      }

      return '<table class="report-table"><thead><tr><th>Fuente</th><th>Reservas</th><th>Habs</th><th>Huespedes</th></tr></thead><tbody>' +
        rows.map(row =>
          '<tr><td>' + escapeHtml(row.source || '-') + '</td><td>' + escapeHtml(row.reservationsCount || 0) + '</td><td>' + escapeHtml(row.roomsReserved || 0) + '</td><td>' + escapeHtml(Number(row.adultsCount || 0) + Number(row.childrenCount || 0)) + '</td></tr>'
        ).join('') +
      '</tbody></table>';
    }

    function renderRoomEventsTable(rows) {
      if (!rows.length) {
        return '<div class="muted">Sin eventos registrados en este mes.</div>';
      }

      return '<table class="report-table"><thead><tr><th>Fecha</th><th>Hab</th><th>Tipo</th><th>Detalle</th></tr></thead><tbody>' +
        rows.map(row =>
          '<tr>' +
            '<td>' + escapeHtml(row.eventDate || '-') + '</td>' +
            '<td><strong>' + escapeHtml(row.roomNumber || '-') + '</strong></td>' +
            '<td>' + escapeHtml(row.eventType || row.eventCode || '-') + '</td>' +
            '<td><strong>' + escapeHtml(row.title || '-') + '</strong><br><span class="muted">' + escapeHtml(row.notes || '') + '</span></td>' +
          '</tr>'
        ).join('') +
      '</tbody></table>';
    }

    function renderEventReport(summaryRows, eventRows) {
      const summary =
        summaryRows.length
          ? '<table class="report-table"><thead><tr><th>Salon</th><th>Eventos</th><th>Cotiz.</th><th>Apart.</th><th>Pagados</th><th>Total</th><th>Pagado</th><th>Pendiente</th></tr></thead><tbody>' +
            summaryRows.map(row =>
              '<tr>' +
                '<td><strong>' + escapeHtml(row.hallName || '-') + '</strong></td>' +
                '<td>' + escapeHtml(row.eventsCount || 0) + '</td>' +
                '<td>' + escapeHtml(row.quotationCount || 0) + '</td>' +
                '<td>' + escapeHtml(row.bookedCount || 0) + '</td>' +
                '<td>' + escapeHtml(row.paidCount || 0) + '</td>' +
                '<td>' + formatMoney(row.totalAmount || 0) + '</td>' +
                '<td>' + formatMoney(row.paidAmount || 0) + '</td>' +
                '<td>' + formatMoney(row.pendingAmount || 0) + '</td>' +
              '</tr>'
            ).join('') +
            '</tbody></table>'
          : '<div class="muted">Sin eventos para este mes.</div>';

      const details =
        eventRows.length
          ? '<table class="report-table"><thead><tr><th>Fecha</th><th>Salon</th><th>Evento</th><th>Estado</th><th>Saldo</th></tr></thead><tbody>' +
            eventRows.map(row =>
              '<tr>' +
                '<td>' + escapeHtml(row.date || '-') + '</td>' +
                '<td>' + escapeHtml(row.hallName || '-') + '</td>' +
                '<td><strong>' + escapeHtml(row.eventName || row.client || '-') + '</strong><br><span class="muted">' + escapeHtml(row.client || '') + '</span></td>' +
                '<td>' + escapeHtml(eventStatusLabel(row.status)) + '</td>' +
                '<td>' + formatMoney(row.pendingAmount || 0) + '</td>' +
              '</tr>'
            ).join('') +
            '</tbody></table>'
          : '';

      return summary + details;
    }

    function renderRoomEventOptions(report) {
      roomEventRoomOptions.innerHTML = (report.rooms || [])
        .map(room => '<option value="' + escapeHtml(room.roomNumber || '') + '"></option>')
        .join('');
      const previousType = roomEventType.value;
      roomEventType.innerHTML = (report.roomEventTypes || [])
        .map(type => '<option value="' + escapeHtml(type.code || '') + '">' + escapeHtml(type.name || type.code || '') + '</option>')
        .join('');
      if (previousType) {
        roomEventType.value = previousType;
      }
    }

    async function saveRoomEvent() {
      roomEventStatus.textContent = 'Guardando...';
      const response = await fetch('/api/rooms/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          roomNumber: roomEventRoom.value,
          eventCode: roomEventType.value,
          eventDate: roomEventDate.value,
          title: roomEventTitle.value,
          notes: roomEventNotes.value,
          cost: roomEventCost.value
        })
      });
      const data = await response.json();

      if (!data.ok) {
        roomEventStatus.textContent = data.error || 'No se pudo guardar. Requiere MySQL activo.';
        return;
      }

      roomEventTitle.value = '';
      roomEventNotes.value = '';
      roomEventCost.value = '';
      roomEventStatus.textContent = 'Evento guardado.';
      await loadReports();
    }

    function renderRoomBlocks() {
      if (!roomBlocksList) {
        return;
      }

      if (!roomBlocks.length) {
        roomBlocksList.innerHTML = '<div class="muted">Sin bloqueos recientes.</div>';
        return;
      }

      roomBlocksList.innerHTML =
        '<table class="report-table"><thead><tr><th>Hab</th><th>Fechas</th><th>Motivo</th><th>Estado</th></tr></thead><tbody>' +
        roomBlocks.map(block =>
          '<tr>' +
            '<td><strong>' + escapeHtml(block.roomNumber || '-') + '</strong></td>' +
            '<td>' + escapeHtml(isoToDisplay(block.startDate || '') || '-') + ' al ' + escapeHtml(isoToDisplay(block.endDate || '') || '-') + '</td>' +
            '<td><strong>' + escapeHtml(block.reason || '-') + '</strong><br><span class="muted">' + escapeHtml(block.notes || '') + '</span></td>' +
            '<td><span class="pill">' + escapeHtml(block.status || '-') + '</span></td>' +
          '</tr>'
        ).join('') +
        '</tbody></table>';
    }

    async function saveRoomBlock() {
      roomBlockStatus.textContent = 'Guardando bloqueo...';
      const response = await fetch('/api/room-blocks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          roomNumber: blockRoom.value,
          startDate: blockStart.value,
          endDate: blockEnd.value,
          reason: blockReason.value,
          notes: blockNotes.value,
          status: blockStatus.value
        })
      });
      const data = await response.json();

      if (!data.ok) {
        roomBlockStatus.textContent = data.error || 'No se pudo guardar el bloqueo.';
        return;
      }

      blockReason.value = '';
      blockNotes.value = '';
      roomBlockStatus.textContent = 'Bloqueo guardado.';
      await loadDashboard();
    }

    function downloadReportCsv(type) {
      const month = reportMonth.value || String(dashboardData?.today || '').slice(0, 7);
      window.location.href = '/api/reports/export-csv?month=' + encodeURIComponent(month) + '&type=' + encodeURIComponent(type || 'all');
    }

    function renderOverbookingAlerts(alerts) {
      if (!alerts.length) {
        return '<div class="muted">Sin sobreventas detectadas.</div>';
      }

      return '<div class="alert-list">' +
        alerts.map(alert =>
          '<div class="alert-item">' +
            '<strong>' + escapeHtml(alert.date) + ' / ' + escapeHtml(alert.type) + '</strong>' +
            '<div class="muted">' + alert.used + '/' + alert.limit + ' habitaciones. Exceso: ' + alert.excess + '.</div>' +
          '</div>'
        ).join('') +
      '</div>';
    }

    function renderTodayArrivals(rows) {
      if (!rows.length) {
        return '<div class="muted">Sin llegadas registradas para hoy.</div>';
      }

      return '<div class="arrival-list">' +
        rows.map(row => {
          const arrival = getReservationArrivalState(row);
          return '<div class="arrival-item ' + arrival.className + '">' +
            '<div>' +
              '<strong>' + escapeHtml(row.nombre || 'Sin nombre') + '</strong>' +
              '<div class="muted">' +
                escapeHtml(row.habitaciones || 1) + ' hab(s)' +
                (row.tipo ? ' / ' + escapeHtml(row.tipo) : '') +
                (row.hora ? ' / ' + escapeHtml(getReservationTimeDisplay(row.hora)) : '') +
              '</div>' +
              (row.note ? '<div class="muted">Nota: ' + escapeHtml(row.note) + '</div>' : '') +
            '</div>' +
            '<span class="pill ' + arrival.className + '">' + arrival.label + '</span>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    function getReservationArrivalState(reservation) {
      if (reservation.arrivalAt) {
        return { className: 'arrived', label: 'Llegó' };
      }

      const dates = reservation.dates || [reservation.fecha];
      const reservationDate = dates[0] || reservation.fecha;
      const today = dashboardData ? isoToDisplay(dashboardData.today) : dateToDisplay(new Date());

      const toDate = value => {
        const [day, month, year] = String(value || '').split('/').map(Number);
        return new Date(year, month - 1, day).getTime();
      };

      if (toDate(reservationDate) < toDate(today)) {
        return { className: 'delayed', label: 'Retrasada' };
      }

      if (toDate(reservationDate) !== toDate(today) || !reservation.hora) {
        return { className: 'pending', label: 'Pendiente' };
      }

      const arrivalTime = parseReservationArrivalTime(reservation.hora);

      if (!arrivalTime) {
        return { className: 'pending', label: 'Pendiente' };
      }

      const [day, month, year] = reservationDate.split('/').map(Number);
      const expected = new Date(year, month - 1, day, arrivalTime.hours, arrivalTime.minutes);

      return new Date() > expected
        ? { className: 'delayed', label: 'Retrasada' }
        : { className: 'pending', label: 'Pendiente' };
    }

    function parseReservationArrivalTime(value) {
      const original = String(value || '').trim();

      if (!original) {
        return null;
      }

      const normalized = original
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\ba\.?\s*m\.?\b/g, 'am')
        .replace(/\bp\.?\s*m\.?\b/g, 'pm')
        .replace(/\bhrs?\b|\bhoras?\b/g, '')
        .replace(/\s+/g, ' ');

      const match =
        normalized.match(/(?:llegada|ingresa|entrada|a las|alas)\D{0,24}(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)
        ||
        normalized.match(/\b(\d{1,2})(?::(\d{2}))\s*(am|pm)?\b/)
        ||
        normalized.match(/\b(\d{1,2})\s*(am|pm)\b/);

      if (!match) {
        return null;
      }

      let hours = Number(match[1]);
      const minutesText = /^\d+$/.test(match[2] || '') ? match[2] : '0';
      const minutes = Number(minutesText);
      const meridiem = match[3] || (/^(am|pm)$/.test(match[2] || '') ? match[2] : '');

      if (minutes > 59 || hours > 23) {
        return null;
      }

      if (meridiem) {
        if (hours < 1 || hours > 12) {
          return null;
        }
        if (meridiem === 'pm' && hours < 12) hours += 12;
        if (meridiem === 'am' && hours === 12) hours = 0;
      }

      return {
        hours,
        minutes,
        display:
          String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0')
      };
    }

    function getReservationTimeDisplay(value) {
      const parsed = parseReservationArrivalTime(value);

      if (!value) {
        return '-';
      }

      return parsed
        ? value + ' (sistema ' + parsed.display + ')'
        : value + ' (hora no detectada)';
    }

    function renderQuoteSections() {
      quoteSections.innerHTML = quoteSectionsData.map((section, index) =>
        '<div class="quote-section">' +
          '<label>Titulo<input value="' + escapeHtml(section.title || '') + '" oninput="updateQuoteSection(' + index + ', \\'title\\', this.value)"></label>' +
          '<label>Tipo<select onchange="updateQuoteSection(' + index + ', \\'category\\', this.value)">' +
            '<option value="habitaciones"' + (section.category === 'habitaciones' ? ' selected' : '') + '>Habitaciones</option>' +
            '<option value="salon"' + (section.category === 'salon' ? ' selected' : '') + '>Salon</option>' +
            '<option value="alimentos"' + (section.category === 'alimentos' ? ' selected' : '') + '>Alimentos/Menu</option>' +
            '<option value="otro"' + (section.category === 'otro' ? ' selected' : '') + '>Otro</option>' +
          '</select></label>' +
          '<label>' + escapeHtml(getQuoteQuantityLabel(section.category)) + '<input type="number" min="0" value="' + escapeHtml(section.quantity || 0) + '" oninput="updateQuoteSection(' + index + ', \\'quantity\\', this.value)"></label>' +
          '<label>' + escapeHtml(getQuotePriceLabel(section.category)) + '<input type="number" min="0" value="' + escapeHtml(section.unitPrice || 0) + '" oninput="updateQuoteSection(' + index + ', \\'unitPrice\\', this.value)"></label>' +
          '<button class="danger" onclick="removeQuoteSection(' + index + ')">Quitar</button>' +
          '<textarea placeholder="Que incluye este apartado" oninput="updateQuoteSection(' + index + ', \\'includes\\', this.value)">' + escapeHtml(section.includes || '') + '</textarea>' +
        '</div>'
      ).join('');
      renderQuoteTotals();
    }

    function getQuoteQuantityLabel(category) {
      if (category === 'habitaciones') {
        return 'Habitaciones';
      }

      if (category === 'alimentos') {
        return 'Personas';
      }

      return 'Cantidad';
    }

    function getQuotePriceLabel(category) {
      if (category === 'habitaciones') {
        return 'Precio por habitacion';
      }

      if (category === 'alimentos') {
        return 'Precio por persona';
      }

      return 'Precio unitario';
    }

    function renderQuoteMenuOptions() {
      if (!quoteMenuSelect) {
        return;
      }

      const previousValue = quoteMenuSelect.value;
      quoteMenuSelect.innerHTML = quoteMenuItems.map((item, index) =>
        '<option value="' + index + '">' + escapeHtml(item.title) + ' - ' + formatMoney(item.price) + ' p/p</option>'
      ).join('');
      if (previousValue && quoteMenuSelect.options[Number(previousValue)]) {
        quoteMenuSelect.value = previousValue;
      }
      renderQuoteMenuPreview();
    }

    function renderQuoteMenuEditor() {
      if (!quoteMenuEditor) {
        return;
      }

      quoteMenuEditor.innerHTML = quoteMenuItems.map((item, index) =>
        '<div class="quote-menu-row">' +
          '<input value="' + escapeHtml(item.title || '') + '" placeholder="Platillo" oninput="updateQuoteMenuItem(' + index + ', \\'title\\', this.value)">' +
          '<input type="number" min="0" value="' + escapeHtml(item.price || 0) + '" oninput="updateQuoteMenuItem(' + index + ', \\'price\\', this.value)">' +
          '<input value="' + escapeHtml(item.description || '') + '" placeholder="Descripcion" oninput="updateQuoteMenuItem(' + index + ', \\'description\\', this.value)">' +
          '<button class="danger compact" onclick="removeQuoteMenuItem(' + index + ')">Quitar</button>' +
        '</div>'
      ).join('');
    }

    function updateQuoteMenuItem(index, field, value) {
      quoteMenuItems[index][field] = field === 'price'
        ? Number(value || 0)
        : value;
      renderQuoteMenuOptions();
    }

    function addQuoteMenuEditorRow() {
      quoteMenuItems.push({
        title: 'Nuevo platillo',
        price: 0,
        description: ''
      });
      renderQuoteMenuEditor();
      renderQuoteMenuOptions();
    }

    function removeQuoteMenuItem(index) {
      quoteMenuItems.splice(index, 1);

      if (!quoteMenuItems.length) {
        addQuoteMenuEditorRow();
        return;
      }

      renderQuoteMenuEditor();
      renderQuoteMenuOptions();
    }

    async function saveQuoteMenuCatalog() {
      quoteMenuStatus.textContent = 'Guardando catalogo...';
      const response = await fetch('/api/quotation-menu', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: quoteMenuItems
        })
      });
      const data = await response.json();

      if (!data.ok) {
        quoteMenuStatus.textContent = data.error || 'No se pudo guardar el catalogo.';
        return;
      }

      quoteMenuItems = data.menu;
      quoteMenuStatus.textContent = 'Catalogo guardado.';
      renderQuoteMenuEditor();
      renderQuoteMenuOptions();
    }

    function openQuoteMenuModal() {
      renderQuoteMenuEditor();
      quoteMenuModalBackdrop.classList.remove('hidden');
      document.body.classList.add('modal-open');
    }

    function closeQuoteMenuModal() {
      quoteMenuModalBackdrop.classList.add('hidden');

      if (
        dayModalBackdrop.classList.contains('hidden') &&
        confirmDeleteBackdrop.classList.contains('hidden') &&
        confirmRackBackdrop.classList.contains('hidden')
      ) {
        document.body.classList.remove('modal-open');
      }
    }

    function getMenuModifierPrice() {
      return (quoteAddWater?.checked ? 30 : 0) + (quoteAddCoffee?.checked ? 30 : 0);
    }

    function getMenuModifierText() {
      const modifiers = [];

      if (quoteAddWater?.checked) {
        modifiers.push('Agua +$30');
      }

      if (quoteAddCoffee?.checked) {
        modifiers.push('Cafe +$30');
      }

      return modifiers;
    }

    function renderQuoteMenuPreview() {
      if (!quoteMenuSelect || !quoteMenuPreview) {
        return;
      }

      const item = quoteMenuItems[Number(quoteMenuSelect.value || 0)];
      const totalPrice = item ? item.price + getMenuModifierPrice() : 0;
      const modifiers = getMenuModifierText();

      quoteMenuPreview.textContent = item
        ? item.description + (modifiers.length ? ' / ' + modifiers.join(' / ') : '') + ' / ' + formatMoney(totalPrice) + ' por persona'
        : '';
    }

    function addSelectedMenuItem() {
      const item = quoteMenuItems[Number(quoteMenuSelect.value || 0)];

      if (!item) {
        return;
      }

      const modifiers = getMenuModifierText();

      quoteSectionsData.push({
        title: item.title,
        category: 'alimentos',
        quantity: Number(quotePeople.value || 1),
        unitPrice: item.price + getMenuModifierPrice(),
        includes: item.description + (modifiers.length ? '\\n' + modifiers.join('\\n') : '')
      });
      renderQuoteSections();
    }

    function addQuoteSection() {
      quoteSectionsData.push({
        title: 'Nuevo apartado',
        category: 'otro',
        quantity: 1,
        unitPrice: 0,
        includes: ''
      });
      renderQuoteSections();
    }

    function addQuotePreset(type) {
      const presets = {
        habitaciones: {
          title: 'Habitacion doble',
          category: 'habitaciones',
          quantity: Number(quotePeople.value || 1),
          unitPrice: 700,
          includes: 'Habitacion\\nIVA incluido\\nRecepcion 24 horas\\nEstacionamiento\\nInternet'
        },
        salon: {
          title: 'Salon para evento',
          category: 'salon',
          quantity: 1,
          unitPrice: 0,
          includes: 'Uso de salon\\nMontaje basico\\nMesas y sillas'
        },
        alimentos: {
          title: 'Coffee Break',
          category: 'alimentos',
          quantity: Number(quotePeople.value || 1),
          unitPrice: 180,
          includes: 'Coffee break por persona'
        }
      };

      quoteSectionsData.push(presets[type] || {
        title: 'Nuevo apartado',
        category: 'otro',
        quantity: 1,
        unitPrice: 0,
        includes: ''
      });
      renderQuoteSections();
    }

    function removeQuoteSection(index) {
      quoteSectionsData.splice(index, 1);

      if (!quoteSectionsData.length) {
        addQuoteSection();
        return;
      }

      renderQuoteSections();
    }

    function updateQuoteSection(index, field, value) {
      quoteSectionsData[index][field] =
        field === 'quantity' || field === 'unitPrice'
          ? Number(value || 0)
          : value;
      renderQuoteTotals();
    }

    function getQuoteSubtotal() {
      return quoteSectionsData.reduce((total, section) =>
        total + Number(section.quantity || 0) * Number(section.unitPrice || 0),
        0
      );
    }

    function getQuoteFoodSubtotal() {
      return quoteSectionsData.reduce((total, section) =>
        section.category === 'alimentos'
          ? total + Number(section.quantity || 0) * Number(section.unitPrice || 0)
          : total,
        0
      );
    }

    function getQuoteServiceCharge() {
      return getQuoteFoodSubtotal() * Number(quoteServiceCharge?.value || 0) / 100;
    }

    function getQuoteTotal() {
      return getQuoteSubtotal() + getQuoteServiceCharge();
    }

    function renderQuoteTotals() {
      const subtotal = getQuoteSubtotal();
      const foodSubtotal = getQuoteFoodSubtotal();
      const service = getQuoteServiceCharge();
      quoteSubtotalLine.innerHTML = '<span>Subtotal</span><strong>' + formatMoney(subtotal) + '</strong>';
      quoteServiceLine.innerHTML = '<span>Servicio ' + Number(quoteServiceCharge?.value || 0) + '% alimentos <small>(' + formatMoney(foodSubtotal) + ')</small></span><strong>' + formatMoney(service) + '</strong>';
      quoteTotal.textContent = formatMoney(subtotal + service);
    }

    function renderHallSelects() {
      const options = eventHalls.map(hall =>
        '<option value="' + escapeHtml(hall.code) + '">' + escapeHtml(hall.name) + '</option>'
      ).join('');

      if (quoteHall && quoteHall.options.length <= 1) {
        quoteHall.innerHTML = '<option value="">Sin salon</option>' + options;
      }

      if (eventHall && !eventHall.options.length) {
        eventHall.innerHTML = options;
      }

      if (quoteEventModalHall && !quoteEventModalHall.options.length) {
        quoteEventModalHall.innerHTML = options;
      }

      if (eventMonth && !eventMonth.value) {
        eventMonth.value = new Date().toISOString().slice(0, 7);
      }
    }

    function eventStatusLabel(status) {
      return {
        cotizacion: 'En cotizacion',
        apartado: 'Apartado',
        pago_completo: 'Pago completo'
      }[status] || status || 'En cotizacion';
    }

    function eventPercent(event) {
      if (event.paymentPercent !== undefined && event.paymentPercent !== null) {
        return Math.max(0, Math.min(100, Number(event.paymentPercent || 0)));
      }
      return event.totalAmount
        ? Math.max(0, Math.min(100, Number(event.paidAmount || 0) / Number(event.totalAmount || 1) * 100))
        : 0;
    }

    function findEventConflict(eventDateValue, hallCode, excludeId) {
      if (!eventDateValue || !hallCode) {
        return null;
      }

      return eventBookings.find(event =>
        String(event.id) !== String(excludeId || '')
        &&
        event.eventDate === eventDateValue
        &&
        event.hallCode === hallCode
        &&
        ['apartado', 'pago_completo'].includes(event.status)
      ) || null;
    }

    function renderEventAvailability(scope, excludeId) {
      const isQuote =
        scope === 'quote';
      const target =
        isQuote ? quoteEventAvailability : eventAvailability;
      const dateValue =
        isQuote ? quoteEventModalDate.value : eventDate.value;
      const hallCode =
        isQuote ? quoteEventModalHall.value : eventHall.value;
      const conflict =
        findEventConflict(dateValue, hallCode, excludeId);

      if (!target) {
        return null;
      }

      if (!dateValue || !hallCode) {
        target.textContent = '';
        target.className = 'muted';
        return null;
      }

      if (conflict) {
        target.textContent = 'No disponible: ya existe ' + (conflict.eventName || conflict.client || 'otro evento') + ' en ese salon y fecha.';
        target.className = 'availability-bad';
        return conflict;
      }

      target.textContent = 'Disponible: no hay otro evento apartado/pagado en ese salon y fecha.';
      target.className = 'availability-ok';
      return null;
    }

    function renderEventAlerts() {
      if (!eventAlerts) {
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const next30 = new Date();
      next30.setDate(next30.getDate() + 30);
      const next30Iso = next30.toISOString().slice(0, 10);
      const alerts = eventBookings
        .filter(event =>
          event.eventDate >= today
          &&
          event.eventDate <= next30Iso
          &&
          ['apartado', 'pago_completo'].includes(event.status)
          &&
          Number(event.totalAmount || 0) > Number(event.paidAmount || 0)
        )
        .sort((left, right) => String(left.eventDate).localeCompare(String(right.eventDate)))
        .slice(0, 6);

      eventAlerts.innerHTML = alerts.length
        ? alerts.map(event =>
          '<div class="event-alert ' + (event.eventDate <= today ? 'danger' : '') + '">' +
            '<strong>Pago pendiente: ' + escapeHtml(event.eventDate || '') + ' · ' + escapeHtml(event.hallName || '') + '</strong>' +
            '<div>' + escapeHtml(event.eventName || event.client || 'Evento') + ' · Saldo ' + formatMoney(Math.max(Number(event.totalAmount || 0) - Number(event.paidAmount || 0), 0)) + '</div>' +
          '</div>'
        ).join('')
        : '<div class="muted">Sin alertas de pagos pendientes en los proximos 30 dias.</div>';
    }

    function renderEventCalendar() {
      if (!eventCalendar) {
        return;
      }

      const month = eventMonth?.value || new Date().toISOString().slice(0, 7);
      const start = new Date(month + '-01T00:00:00');
      const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
      const firstWeekday = start.getDay();
      const todayIso = new Date().toISOString().slice(0, 10);
      const cells = [];

      for (let index = 0; index < firstWeekday; index++) {
        cells.push('<div class="event-day empty"></div>');
      }

      for (let day = 1; day <= days; day++) {
        const iso = month + '-' + String(day).padStart(2, '0');
        const events = eventBookings.filter(event => event.eventDate === iso);
        cells.push(
          '<div class="event-day ' + (iso === todayIso ? 'today' : '') + '">' +
            '<div class="event-date-label">' + day + '</div>' +
            (events.length
              ? events.map(event =>
                '<div class="event-pill ' + escapeHtml(event.status || 'cotizacion') + '" onclick="openEventDetail(\\'' + escapeHtml(event.id) + '\\')">' +
                  '<strong>' + escapeHtml(event.hallName || event.hallCode || '') + '</strong>' +
                  '<div>' + escapeHtml(event.eventName || event.client || 'Evento') + '</div>' +
                  '<div class="muted">' + eventStatusLabel(event.status) + ' · ' + Math.round(eventPercent(event)) + '%</div>' +
                  '<div class="payment-bar"><span style="width:' + eventPercent(event) + '%"></span></div>' +
                '</div>'
              ).join('')
              : '<div class="muted">Libre</div>') +
          '</div>'
        );
      }

      eventCalendar.innerHTML = cells.join('');
    }

    function renderEventList() {
      if (!eventList) {
        return;
      }

      if (!eventBookings.length) {
        eventList.innerHTML = '<div class="muted">Sin eventos registrados.</div>';
        return;
      }

      eventList.innerHTML = eventBookings.slice(0, 20).map(event =>
        '<div class="event-card" onclick="openEventDetail(\\'' + escapeHtml(event.id) + '\\')">' +
          '<div class="event-card-head">' +
            '<div>' +
              '<strong>' + escapeHtml(event.eventDate || '') + ' · ' + escapeHtml(event.hallName || event.hallCode || '') + '</strong>' +
              '<div>' + escapeHtml(event.eventName || event.client || 'Evento') + '</div>' +
              '<div class="muted">' + escapeHtml(event.client || '') + ' · ' + eventStatusLabel(event.status) + '</div>' +
            '</div>' +
            '<div style="min-width:160px">' +
              '<div class="muted">' + formatMoney(event.paidAmount || 0) + ' / ' + formatMoney(event.totalAmount || 0) + '</div>' +
              '<div class="payment-bar"><span style="width:' + eventPercent(event) + '%"></span></div>' +
            '</div>' +
          '</div>' +
          '<div class="summary-chips" style="margin-top:8px">' +
            (event.vouchers || []).map(voucher =>
              '<a class="chip" target="_blank" href="' + escapeHtml(voucher.url || '#') + '">Comprobante ' + escapeHtml(voucher.id || '') + '</a>'
            ).join('') +
          '</div>' +
          '<div class="voucher-row">' +
            '<input id="voucherFile_' + escapeHtml(event.id) + '" type="file" accept="image/*,application/pdf" multiple onclick="event.stopPropagation()">' +
            '<input id="voucherAmount_' + escapeHtml(event.id) + '" type="number" min="0" step="0.01" placeholder="Monto" onclick="event.stopPropagation()">' +
            '<input id="voucherNotes_' + escapeHtml(event.id) + '" placeholder="Nota del comprobante" onclick="event.stopPropagation()">' +
            '<button onclick="event.stopPropagation(); uploadEventVoucher(\\'' + escapeHtml(event.id) + '\\')">Subir comprobante(s)</button>' +
          '</div>' +
        '</div>'
      ).join('');
    }

    function openEventDetail(eventId) {
      const event = eventBookings.find(item => String(item.id) === String(eventId));
      if (!event) {
        return;
      }

      const percent = eventPercent(event);
      pendingEventDetailId = event.id;
      eventDetailTitle.textContent = event.eventName || event.client || 'Evento';
      eventDetailSubtitle.textContent = (event.eventDate || '-') + ' · ' + (event.hallName || event.hallCode || '-') + ' · ' + eventStatusLabel(event.status);
      eventDetailBody.innerHTML =
        '<div class="event-detail-grid">' +
          '<div class="event-detail-box"><span>Cliente</span><strong>' + escapeHtml(event.client || '-') + '</strong></div>' +
          '<div class="event-detail-box"><span>Contacto</span><strong>' + escapeHtml(event.contact || '-') + '</strong></div>' +
          '<div class="event-detail-box"><span>Fecha</span><strong>' + escapeHtml(event.eventDate || '-') + '</strong></div>' +
          '<div class="event-detail-box"><span>Salon</span><strong>' + escapeHtml(event.hallName || event.hallCode || '-') + '</strong></div>' +
          '<div class="event-detail-box"><span>Estado</span><strong>' + escapeHtml(eventStatusLabel(event.status)) + '</strong></div>' +
          '<div class="event-detail-box"><span>Cotizacion</span><strong>' + escapeHtml(event.quotationId || '-') + '</strong></div>' +
          '<div class="event-detail-box"><span>Total</span><strong>' + formatMoney(event.totalAmount || 0) + '</strong></div>' +
          '<div class="event-detail-box"><span>Pagado</span><strong>' + formatMoney(event.paidAmount || 0) + ' (' + Math.round(percent) + '%)</strong><div class="payment-bar"><span style="width:' + percent + '%"></span></div></div>' +
        '</div>' +
        '<div class="event-detail-box"><span>Notas</span><div>' + escapeHtml(event.notes || 'Sin notas') + '</div></div>' +
        '<h3 style="margin:16px 0 8px">Editar evento</h3>' +
        '<div class="reservation-edit-grid">' +
          '<label>Cliente<input id="eventEditClient" value="' + escapeHtml(event.client || '') + '"></label>' +
          '<label>Contacto<input id="eventEditContact" value="' + escapeHtml(event.contact || '') + '"></label>' +
          '<label>Evento<input id="eventEditName" value="' + escapeHtml(event.eventName || '') + '"></label>' +
          '<label>Fecha<input id="eventEditDate" type="date" value="' + escapeHtml(event.eventDate || '') + '" onchange="renderEventEditAvailability()"></label>' +
          '<label>Salon<select id="eventEditHall" onchange="renderEventEditAvailability()">' + eventHalls.map(hall => '<option value="' + escapeHtml(hall.code) + '"' + (hall.code === event.hallCode ? ' selected' : '') + '>' + escapeHtml(hall.name) + '</option>').join('') + '</select></label>' +
          '<label>Estado<select id="eventEditStatus" onchange="renderEventEditAvailability()">' +
            '<option value="cotizacion"' + (event.status === 'cotizacion' ? ' selected' : '') + '>En cotizacion</option>' +
            '<option value="apartado"' + (event.status === 'apartado' ? ' selected' : '') + '>Apartado</option>' +
            '<option value="pago_completo"' + (event.status === 'pago_completo' ? ' selected' : '') + '>Pago completo</option>' +
          '</select></label>' +
          '<label>Total<input id="eventEditTotal" type="number" min="0" step="0.01" value="' + escapeHtml(event.totalAmount || 0) + '"></label>' +
          '<label>Pagado<input id="eventEditPaid" type="number" min="0" step="0.01" value="' + escapeHtml(event.paidAmount || 0) + '"></label>' +
          '<label class="wide">Notas<textarea id="eventEditNotes" rows="3">' + escapeHtml(event.notes || '') + '</textarea></label>' +
        '</div>' +
        '<div id="eventEditAvailability" class="muted" style="margin-top:10px"></div>' +
        '<div id="eventEditStatusText" class="muted" style="margin-top:10px"></div>' +
        '<div class="confirm-actions"><button class="primary" onclick="saveEventDetailEdit()">Guardar cambios</button></div>' +
        '<h3 style="margin:16px 0 8px">Comprobantes</h3>' +
        ((event.vouchers || []).length
          ? '<div class="voucher-list">' + (event.vouchers || []).map(voucher =>
            '<div class="voucher-item">' +
              '<div><strong>' + escapeHtml(voucher.fileName || ('Comprobante ' + voucher.id)) + '</strong><div class="muted">' + formatMoney(voucher.amount || 0) + ' · ' + escapeHtml(voucher.notes || '') + '</div></div>' +
              '<a class="chip" target="_blank" href="' + escapeHtml(voucher.url || '#') + '">Ver</a>' +
            '</div>'
          ).join('') + '</div>'
          : '<div class="muted">Sin comprobantes guardados.</div>');

      eventDetailModalBackdrop.classList.remove('hidden');
      document.body.classList.add('modal-open');
      renderEventEditAvailability();
    }

    function renderEventEditAvailability() {
      const target = document.getElementById('eventEditAvailability');
      if (!target) {
        return null;
      }
      const conflict = findEventConflict(
        eventEditDate.value,
        eventEditHall.value,
        pendingEventDetailId
      );
      if (
        ['apartado', 'pago_completo'].includes(eventEditStatus.value)
        &&
        conflict
      ) {
        target.textContent = 'No disponible: ya existe ' + (conflict.eventName || conflict.client || 'otro evento') + ' en ese salon y fecha.';
        target.className = 'availability-bad';
        return conflict;
      }
      target.textContent = 'Disponible para este estado/fecha/salon.';
      target.className = 'availability-ok';
      return null;
    }

    async function saveEventDetailEdit() {
      const event = eventBookings.find(item => String(item.id) === String(pendingEventDetailId));
      if (!event) {
        return;
      }
      const statusText = document.getElementById('eventEditStatusText');
      if (
        ['apartado', 'pago_completo'].includes(eventEditStatus.value)
        &&
        renderEventEditAvailability()
      ) {
        statusText.textContent = 'No se puede guardar: salon no disponible.';
        return;
      }
      statusText.textContent = 'Guardando cambios...';
      try {
        await saveEventPayload({
          id: event.id,
          quotationId: event.quotationId,
          client: eventEditClient.value.trim(),
          contact: eventEditContact.value.trim(),
          eventName: eventEditName.value.trim(),
          eventDate: eventEditDate.value,
          hallCode: eventEditHall.value,
          status: eventEditStatus.value,
          totalAmount: Number(eventEditTotal.value || 0),
          paidAmount: Number(eventEditPaid.value || 0),
          notes: eventEditNotes.value.trim()
        });
        closeEventDetailModal();
      } catch (error) {
        statusText.textContent = error.message || 'No se pudo guardar.';
      }
    }

    function closeEventDetailModal() {
      eventDetailModalBackdrop.classList.add('hidden');
      pendingEventDetailId = null;

      if (
        dayModalBackdrop.classList.contains('hidden') &&
        quoteMenuModalBackdrop.classList.contains('hidden') &&
        quoteEventModalBackdrop.classList.contains('hidden') &&
        helpModalBackdrop.classList.contains('hidden')
      ) {
        document.body.classList.remove('modal-open');
      }
    }

    async function saveEventPayload(payload) {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || 'No se pudo guardar el evento.');
      }
      await loadDashboard();
      showView('events');
      return data.event;
    }

    async function saveManualEvent() {
      try {
        eventStatusText.textContent = 'Guardando evento...';
        if (
          ['apartado', 'pago_completo'].includes(eventStatus.value)
          &&
          renderEventAvailability('manual')
        ) {
          eventStatusText.textContent = 'No se puede guardar: el salon no esta disponible.';
          return;
        }
        await saveEventPayload({
          client: eventClient.value.trim(),
          contact: eventContact.value.trim(),
          eventName: eventName.value.trim(),
          eventDate: eventDate.value,
          hallCode: eventHall.value,
          status: eventStatus.value,
          totalAmount: Number(eventTotal.value || 0),
          paidAmount: Number(eventPaid.value || 0),
          notes: eventNotes.value.trim()
        });
        eventStatusText.textContent = 'Evento guardado.';
        eventClient.value = '';
        eventContact.value = '';
        eventName.value = '';
        eventDate.value = '';
        eventTotal.value = '';
        eventPaid.value = '';
        eventNotes.value = '';
      } catch (error) {
        eventStatusText.textContent = error.message || 'No se pudo guardar.';
      }
    }

    function createEventFromQuotation(quotationId) {
      const quote = (dashboardData?.quotations || []).find(row => row.id === quotationId);
      if (!quote) {
        alert('No encontre la cotizacion.');
        return;
      }

      pendingQuoteEvent = quote;
      renderHallSelects();
      quoteEventModalTitle.textContent = 'Apartar salon: ' + quote.id;
      quoteEventModalSubtitle.textContent = (quote.client || 'Sin cliente') + ' · ' + (quote.eventName || quote.headline || 'Sin evento');
      quoteEventModalDate.value = quote.eventDate || quoteEventDate.value || '';
      quoteEventModalHall.value = quote.hallCode || quoteHall.value || '';
      quoteEventModalStatus.value = quote.eventDate || quote.hallCode ? 'apartado' : 'cotizacion';
      quoteEventModalTotal.value = Number(quote.total || 0);
      quoteEventModalPaid.value = 0;
      quoteEventModalNotes.value = quote.notes || '';
      quoteEventModalStatusText.textContent = '';
      renderEventAvailability('quote');
      quoteEventModalBackdrop.classList.remove('hidden');
      document.body.classList.add('modal-open');
    }

    function closeQuoteEventModal() {
      quoteEventModalBackdrop.classList.add('hidden');
      pendingQuoteEvent = null;

      if (
        dayModalBackdrop.classList.contains('hidden') &&
        quoteMenuModalBackdrop.classList.contains('hidden') &&
        helpModalBackdrop.classList.contains('hidden')
      ) {
        document.body.classList.remove('modal-open');
      }
    }

    async function saveQuoteEventFromModal() {
      const quote = pendingQuoteEvent;
      if (!quote) {
        closeQuoteEventModal();
        return;
      }

      if (!quoteEventModalDate.value || !quoteEventModalHall.value) {
        quoteEventModalStatusText.textContent = 'Selecciona salon y fecha para apartar.';
        return;
      }

      if (
        ['apartado', 'pago_completo'].includes(quoteEventModalStatus.value)
        &&
        renderEventAvailability('quote')
      ) {
        quoteEventModalStatusText.textContent = 'No se puede apartar: el salon no esta disponible.';
        return;
      }

      quoteEventModalStatusText.textContent = 'Guardando evento...';
      try {
        await saveEventPayload({
          quotationId: quote.id,
          client: quote.client,
          contact: quote.contact,
          eventName: quote.eventName || quote.headline,
          eventDate: quoteEventModalDate.value,
          hallCode: quoteEventModalHall.value,
          status: quoteEventModalStatus.value,
          totalAmount: Number(quoteEventModalTotal.value || quote.total || 0),
          paidAmount: Number(quoteEventModalPaid.value || 0),
          notes: quoteEventModalNotes.value.trim()
        });
        closeQuoteEventModal();
      } catch (error) {
        quoteEventModalStatusText.textContent = error.message || 'No se pudo apartar.';
      }
    }

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    async function uploadEventVoucher(eventId) {
      const fileInput = document.getElementById('voucherFile_' + eventId);
      const amountInput = document.getElementById('voucherAmount_' + eventId);
      const notesInput = document.getElementById('voucherNotes_' + eventId);
      const files = Array.from(fileInput?.files || []);
      if (!files.length) {
        alert('Selecciona una o varias imagenes/comprobantes.');
        return;
      }

      for (const file of files) {
        const dataUrl = await readFileAsDataUrl(file);
        const response = await fetch('/api/events/vouchers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            eventId,
            fileName: file.name,
            dataUrl,
            amount: Number(amountInput?.value || 0),
            notes: notesInput?.value || ''
          })
        });
        const data = await response.json();
        if (!data.ok) {
          alert(data.error || 'No se pudo subir el comprobante ' + file.name + '.');
          return;
        }
      }

      await loadDashboard();
      showView('events');
    }

    function renderQuotationList(rows) {
      if (!rows.length) {
        quoteList.innerHTML = '<div class="muted">Sin cotizaciones guardadas.</div>';
        return;
      }

      quoteList.innerHTML = rows.slice(0, 8).map(row =>
        '<div class="quote-item">' +
          '<strong>' + escapeHtml(row.id) + '</strong>' +
          '<div>' + escapeHtml(row.client || '') + '</div>' +
          '<div class="muted">' + escapeHtml(row.headline || row.eventName || 'Sin evento') + ' / ' + formatMoney(row.total || 0) + '</div>' +
          '<div class="muted">' + escapeHtml(row.eventDate || 'Sin fecha') + ' · ' + escapeHtml(row.hallName || row.hallCode || 'Sin salon') + '</div>' +
          '<div class="muted">Formato: ' + escapeHtml(row.template === 'formal' ? 'Formal' : 'Visual hotel') + '</div>' +
          '<div class="summary-chips">' +
            '<button class="compact" onclick="window.open(\\'/api/quotations/' + encodeURIComponent(row.id) + '/print\\', \\'_blank\\')">Abrir PDF</button>' +
            '<button class="compact" onclick="createEventFromQuotation(\\'' + escapeHtml(row.id) + '\\')">Apartar salon</button>' +
          '</div>' +
        '</div>'
      ).join('');
    }

    async function saveQuotation() {
      const payload = {
        client: quoteClient.value.trim(),
        contact: quoteContact.value.trim(),
        eventName: quoteEventName.value.trim(),
        eventDate: quoteEventDate.value,
        hallCode: quoteHall.value,
        template: document.querySelector('input[name="quoteTemplate"]:checked')?.value || 'visual',
        headline: quoteHeadline.value.trim(),
        stayDates: quoteStayDates.value.trim(),
        people: Number(quotePeople.value || 0),
        checkIn: quoteCheckIn.value.trim(),
        checkOut: quoteCheckOut.value.trim(),
        validUntil: quoteValidUntil.value,
        notes: quoteNotes.value.trim(),
        serviceChargePercent: Number(quoteServiceCharge.value || 0),
        sections: quoteSectionsData
      };

      if (!payload.client) {
        alert('Escribe el cliente de la cotizacion.');
        return;
      }

      quoteStatus.textContent = 'Guardando cotizacion...';
      const response = await fetch('/api/quotations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (!data.ok) {
        quoteStatus.textContent = data.error || 'No se pudo guardar.';
        return;
      }

      quoteStatus.innerHTML =
        'Guardada: ' + escapeHtml(data.quotation.id) +
        ' <button class="compact" onclick="window.open(\\'/api/quotations/' + encodeURIComponent(data.quotation.id) + '/print\\', \\'_blank\\')">Abrir PDF</button>';
      quoteClient.value = '';
      quoteContact.value = '';
      quoteEventName.value = '';
      quoteEventDate.value = '';
      quoteHall.value = '';
      quoteHeadline.value = '';
      quoteStayDates.value = '';
      quotePeople.value = '';
      quoteCheckIn.value = '';
      quoteCheckOut.value = '';
      quoteServiceCharge.value = '0';
      quoteValidUntil.value = '';
      quoteNotes.value = '';
      document.querySelector('input[name="quoteTemplate"][value="visual"]').checked = true;
      quoteSectionsData = [
        {
          title: 'Hospedaje',
          category: 'habitaciones',
          quantity: 1,
          unitPrice: 700,
          includes: 'Recepcion 24 horas\\nEstacionamiento\\nInternet\\nTelevision por cable\\nAgua fria y caliente'
        }
      ];
      await loadDashboard();
      showView('quotes');
    }

    function formatMoney(value) {
      return Number(value || 0).toLocaleString('es-MX', {
        style: 'currency',
        currency: 'MXN'
      });
    }

    function renderRackDashboard(status) {
      if (!status || !status.counts) {
        rackGlobalUpdated.textContent = 'Sin rack CSV guardado.';
        rackDashboard.innerHTML =
          '<div class="muted">Importa un CSV del rack para ver el estado global aqui.</div>';
        return;
      }

      const counts = status.counts;
      rackGlobalUpdated.textContent =
        'Rack CSV: ' + (status.reportDate || '-') + ' ' + (status.reportTime || '') +
        ' / Guardado: ' + new Date(status.uploadedAt).toLocaleString() +
        (status.fileName ? ' / Archivo: ' + status.fileName : '');

      rackDashboard.innerHTML =
        '<div class="rack-dashboard">' +
          '<div class="rack-meta-card">' +
            '<strong>' + escapeHtml(counts.total || 0) + ' habitaciones</strong>' +
            '<div class="muted">Ultimo rack analizado</div>' +
            '<div class="rack-type-line">' +
              'K ' + getRackTypeTotal(counts, 'King') +
              ' / SK ' + getRackTypeTotal(counts, 'Suite King') +
              ' / DS ' + getRackTypeTotal(counts, 'Doble Suite') +
              ' / D ' + getRackTypeTotal(counts, 'Doble') +
            '</div>' +
          '</div>' +
          renderRackPie(counts) +
          renderRackKpi('Ocupadas', counts.occupied) +
          renderRackKpi('Bloqueadas', counts.blocked) +
          renderRackKpi('VL limpias', counts.availableClean) +
          renderRackKpi('VS sucias', counts.availableDirty) +
        '</div>';
    }

    function renderRackPie(counts) {
      const total = Number(counts?.total || 0);
      const occupied = Number(counts?.occupied?.total || 0);
      const blocked = Number(counts?.blocked?.total || 0);
      const available = Number(counts?.availableClean?.total || 0) + Number(counts?.availableDirty?.total || 0);
      const occupiedDegrees = total ? Math.round((occupied / total) * 360) : 0;
      const availableDegrees = total ? Math.round((available / total) * 360) : 0;

      return '<div class="rack-pie-card">' +
        '<div class="rack-pie" style="--occupied:' + occupiedDegrees + 'deg; --available:' + availableDegrees + 'deg">' +
          '<span>' + escapeHtml(total || 0) + '</span>' +
        '</div>' +
        '<div>' +
          '<strong>Distribucion</strong>' +
          '<div class="rack-pie-legend">' +
            '<div><span><i class="rack-pie-occupied"></i>OC ocupadas</span><strong>' + occupied + '</strong></div>' +
            '<div><span><i class="rack-pie-available"></i>Vacias</span><strong>' + available + '</strong></div>' +
            '<div><span><i class="rack-pie-blocked"></i>Bloqueadas</span><strong>' + blocked + '</strong></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    function renderRackKpi(label, data) {
      const row = data || {};
      return '<div class="rack-kpi-card">' +
        '<span class="muted">' + escapeHtml(label) + '</span>' +
        '<strong>' + escapeHtml(row.total || 0) + '</strong>' +
        '<div class="rack-type-line">' +
          'K ' + (row.King || 0) +
          ' / SK ' + (row['Suite King'] || 0) +
          ' / DS ' + (row['Doble Suite'] || 0) +
          ' / D ' + (row.Doble || 0) +
        '</div>' +
      '</div>';
    }

    function getRackTypeTotal(counts, type) {
      return ['occupied', 'blocked', 'availableClean', 'availableDirty']
        .reduce((total, key) => total + Number(counts?.[key]?.[type] || 0), 0);
    }

    function renderRackRoomGrid(status) {
      if (!status || !Array.isArray(status.rooms)) {
        rackFloorMap.innerHTML = '';
        rackRoomGrid.innerHTML =
          '<div class="muted" style="margin-top:12px">Importa un CSV del rack para ver habitaciones con botones.</div>';
        return;
      }

      renderRackFloorMap(status.rooms);
      const availableCounts = getAvailableRoomColorCounts(status.rooms);
      rackRoomGrid.innerHTML =
        '<div class="rack-type-legend">' +
          '<span class="king">Vacias King: ' + availableCounts.king + '</span>' +
          '<span class="double">Vacias Dobles: ' + availableCounts.double + '</span>' +
          '<span class="suite">Vacias Suites: ' + availableCounts.suite + '</span>' +
        '</div>' +
        '<div class="rack-room-grid">' +
        status.rooms.map(room => {
          const category = getRackRoomCategory(room.status);
          const typeClass = getRackRoomTypeClass(room, category);
          return '<button class="rack-room ' + category + ' ' + typeClass + '" onclick="setRackRoomOccupied(\\'' + escapeHtml(room.room) + '\\')">' +
            '<strong>' + escapeHtml(room.room) + '</strong>' +
            '<span>' + escapeHtml(room.type || '-') + '</span>' +
            '<span>' + escapeHtml(room.status || '-') + '</span>' +
          '</button>';
        }).join('') +
        '</div>';
    }

    function renderRackFloorMap(rooms) {
      const byFloor = rooms.reduce((acc, room) => {
        const floor = String(room.room || '').slice(0, 1) || '-';
        if (!acc[floor]) {
          acc[floor] = [];
        }
        acc[floor].push(room);
        return acc;
      }, {});

      rackFloorMap.innerHTML =
        '<div class="floor-map">' +
          Object.keys(byFloor).sort().map(floor =>
            '<div class="floor-card">' +
              '<strong>Piso ' + escapeHtml(floor) + '</strong>' +
              '<div class="floor-rooms">' +
                byFloor[floor].sort((left, right) => String(left.room).localeCompare(String(right.room))).map(room => {
                  const category = getRackRoomCategory(room.status);
                  const className = category === 'available'
                    ? (room.status === 'VS' ? 'dirty' : 'clean')
                    : category;
                  return '<button class="floor-room ' + className + '" onclick="setRackRoomOccupied(\\'' + escapeHtml(room.room) + '\\')">' +
                    '<strong>' + escapeHtml(room.room || '-') + '</strong>' +
                    '<span>' + escapeHtml(room.type || '-') + '</span>' +
                    '<span>' + escapeHtml(room.status || '-') + '</span>' +
                  '</button>';
                }).join('') +
              '</div>' +
            '</div>'
          ).join('') +
        '</div>';
    }

    function getRackRoomCategory(status) {
      if (['OC', 'OS', 'OL', 'OR', 'OSE', 'ND'].includes(status)) {
        return 'occupied';
      }

      if (['VL', 'VS'].includes(status)) {
        return 'available';
      }

      return 'blocked';
    }

    function getRackRoomTypeClass(room, category) {
      if (category !== 'available') return '';

      const type = String(room.type || '').toLowerCase();
      if (type.includes('suite')) return 'available-type-suite';
      if (type.includes('king')) return 'available-type-king';
      return 'available-type-double';
    }

    function getAvailableRoomColorCounts(rooms) {
      return rooms.reduce((counts, room) => {
        if (getRackRoomCategory(room.status) !== 'available') {
          return counts;
        }

        const type = String(room.type || '').toLowerCase();

        if (type.includes('suite')) {
          counts.suite++;
        } else if (type.includes('king')) {
          counts.king++;
        } else {
          counts.double++;
        }

        return counts;
      }, {
        king: 0,
        double: 0,
        suite: 0
      });
    }

    function setRackRoomOccupied(room) {
      const status = dashboardData?.rackStatus;
      const rackRoom = status?.rooms?.find(item => item.room === room);

      pendingRackRoom = room;
      confirmRackText.innerHTML =
        '<strong>Habitacion ' + escapeHtml(room) + '</strong>' +
        '<div class="muted">' +
          escapeHtml(rackRoom?.type || '-') +
          ' / Estado actual: ' + escapeHtml(rackRoom?.status || '-') +
        '</div>';
      confirmRackBackdrop.classList.remove('hidden');
      document.body.classList.add('modal-open');
    }

    function closeRackConfirm() {
      confirmRackBackdrop.classList.add('hidden');
      pendingRackRoom = null;
      document.body.classList.remove('modal-open');
    }

    async function confirmRackRoomOccupied() {
      if (!pendingRackRoom) {
        return;
      }

      const room = pendingRackRoom;
      const response = await fetch('/api/rack/room-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          room,
          status: 'OC'
        })
      });
      const data = await response.json();

      if (!data.ok) {
        alert(data.error || 'No se pudo actualizar la habitacion.');
        return;
      }

      closeRackConfirm();
      await loadDashboard();
      showView('rack');
    }

    function renderOccupancy(rows) {
      const today = isoToDisplay(dashboardData.today);
      const upcoming = rows
        .filter(row => compareDisplayDates(row.date, today) >= 0)
        .slice(0, 5);

      if (!upcoming.length) {
        return '<div class="muted">Sin reservas proximas registradas.</div>';
      }

      const roomTypes = Object.keys(dashboardData.limits);
      return '<div class="occupancy-list">' +
        upcoming.map(row => {
          const totalUsed = getTotalUsed(row);
          const totalRooms = dashboardData.totalRooms || 69;
          const pct = totalRooms ? Math.min(Math.round((totalUsed / totalRooms) * 100), 100) : 0;

          return '<div class="occupancy-card">' +
            '<div class="occupancy-top">' +
              '<div class="occupancy-date">' +
                '<strong>' + escapeHtml(row.date) + '</strong>' +
                '<div class="muted">' + totalUsed + '/' + totalRooms + ' habitaciones</div>' +
              '</div>' +
              '<div class="occupancy-ring" style="--pct:' + pct + '"><span>' + pct + '%</span></div>' +
            '</div>' +
            '<div class="occupancy-types">' +
              roomTypes.map(type => {
              const used = row.counts?.[type] || 0;
              const limit = row.limits[type] || 0;
              return '<div class="occupancy-type">' +
                '<span>' + escapeHtml(shortRoomLabel(type)) + '</span>' +
                '<strong>' + used + '/' + limit + '</strong>' +
              '</div>';
            }).join('') +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    function renderReservations(rows) {
      if (!rows.length) {
        return '<div class="muted">Sin reservas registradas.</div>';
      }

      return '<div class="table-wrap"><table><thead><tr><th>Folio</th><th>Cliente</th><th>Habitacion</th><th>Fechas</th><th>Nota</th><th>Estado</th><th></th></tr></thead><tbody>' +
        rows.map(row => '<tr>' +
          '<td>#' + escapeHtml(row.folio || '') + '</td>' +
          '<td>' + escapeHtml(row.nombre || 'Sin nombre') + '<br><span class="muted">' + escapeHtml(row.telefono || '') + '</span></td>' +
          '<td>' + escapeHtml(row.habitacion || '') + '<br><span class="muted">' + escapeHtml(row.habitaciones || 1) + ' hab(s)</span>' + (row.servicioEspecial ? '<br><span class="muted">' + escapeHtml(row.servicioEspecial) + '</span>' : '') + '</td>' +
          '<td>' + escapeHtml((row.dates || [row.fecha]).join(', ')) + '<br><span class="muted">' + (row.noches || 1) + ' noche(s)</span></td>' +
          '<td>' + renderNoteEditor(row) + '</td>' +
          '<td><span class="pill ' + escapeHtml(row.status || '') + '">' + escapeHtml(row.status || 'activa') + '</span></td>' +
          '<td><button class="compact" onclick="openReservationArrivalByKey(\\'' + escapeJs(row.sourceKey || (row.folio ? 'folio:' + row.folio : '')) + '\\')">' + (row.arrivalAt ? 'Ver llegada' : 'Registrar llegada') + '</button></td>' +
        '</tr>').join('') +
      '</tbody></table></div>';
    }

    function renderNoteEditor(row) {
      const key = row.sourceKey || (row.folio ? 'folio:' + row.folio : '');

      if (!key) {
        return '<span class="muted">Sin llave</span>';
      }

      return '<div class="note-row">' +
        '<input value="' + escapeHtml(row.note || '') + '" placeholder="Nota interna">' +
        '<button class="compact" onclick="saveReservationNote(\\'' + escapeJs(key) + '\\', this)">Guardar</button>' +
      '</div>';
    }

    async function saveReservationNote(key, trigger) {
      const input = trigger?.closest('.note-row')?.querySelector('input');

      if (!input) {
        return;
      }

      const response = await fetch('/api/reservations/note', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reservationKey: key,
          note: input.value
        })
      });
      const data = await response.json();

      if (!data.ok) {
        alert(data.error || 'No se pudo guardar la nota.');
        return;
      }

      await loadDashboard();
    }

    async function cancelFolio() {
      const folio = folioInput.value.trim().replace(/^#/, '');

      if (!folio) {
        alert('Escribe un folio.');
        return;
      }

      const response = await fetch('/api/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ folio })
      });
      const data = await response.json();

      if (!data.ok) {
        alert(data.error || 'No se pudo cancelar.');
        return;
      }

      folioInput.value = '';
      await loadDashboard();
    }

    async function saveManualReservation() {
      refreshManualRate();
      const payload = {
        nombre: manualNombre.value.trim(),
        telefono: manualTelefono.value.trim(),
        fecha: manualFecha.value,
        fechaSalida: manualFechaSalida.value || manualFecha.value,
        habitaciones: Number(manualHabitaciones.value || 1),
        adultos: Number(manualAdultos.value || 0),
        ninos: Number(manualNinos.value || 0),
        tipo: manualTipo.value,
        hora: manualHora.value.trim(),
        tarifa: manualTarifa.value.trim(),
        note: manualNota.value.trim()
      };

      if (!payload.nombre || !payload.fecha) {
        alert('Nombre y fecha de entrada son requeridos.');
        return;
      }

      manualReservationStatus.textContent = 'Guardando reserva...';

      const response = await fetch('/api/reservations/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (!data.ok) {
        manualReservationStatus.textContent = data.error || 'No se pudo guardar.';
        return;
      }

      manualNombre.value = '';
      manualTelefono.value = '';
      manualHabitaciones.value = '1';
      manualAdultos.value = '2';
      manualNinos.value = '0';
      manualHora.value = '';
      manualTarifa.value = '$700';
      manualRateLocked = false;
      manualNota.value = '';
      manualReservationStatus.textContent = 'Reserva guardada: #' + data.reservation.folio;
      await loadDashboard();
      openGroupSendConfirm([data.reservation], 'capturada');
    }

    async function importReservationsCsv() {
      const file = csvFile.files[0];

      if (!file) {
        alert('Selecciona un archivo CSV.');
        return;
      }

      manualReservationStatus.textContent = 'Importando CSV...';
      const csv = await file.text();

      const response = await fetch('/api/reservations/import-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ csv })
      });
      const data = await response.json();

      if (!data.ok) {
        manualReservationStatus.textContent = data.error || 'No se pudo importar.';
        return;
      }

      csvFile.value = '';
      updateFileZone(csvFile);
      manualReservationStatus.textContent =
        'Importadas: ' + data.imported + (data.errors.length ? ' / Errores: ' + data.errors.join(' | ') : '');
      await loadDashboard();
      openGroupSendConfirm(data.reservations || [], 'importadas');
    }

    function openGroupSendConfirm(reservations, source) {
      pendingGroupReservations = Array.isArray(reservations)
        ? reservations.filter(reservation => reservation?.nombre && reservation?.fecha)
        : [];

      if (!pendingGroupReservations.length) {
        return;
      }

      const count = pendingGroupReservations.length;
      groupSendConfirmTitle.textContent = count === 1
        ? 'Enviar reserva al grupo'
        : 'Enviar reservas al grupo';
      groupSendConfirmText.textContent = count === 1
        ? 'La reserva ' + source + ' se enviara al grupo de reservas.'
        : count + ' reservas ' + source + ' se enviaran al grupo de reservas.';
      groupSendConfirmBackdrop.classList.remove('hidden');
      document.body.classList.add('modal-open');
    }

    function closeGroupSendConfirm() {
      groupSendConfirmBackdrop.classList.add('hidden');
      pendingGroupReservations = [];
      document.body.classList.remove('modal-open');
    }

    async function sendPendingReservationsToGroup() {
      if (!pendingGroupReservations.length) {
        closeGroupSendConfirm();
        return;
      }

      const response = await fetch('/api/reservations/send-to-group', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reservations: pendingGroupReservations
        })
      });
      const data = await response.json();

      if (!data.ok) {
        alert(data.error || 'No se pudo preparar el envio al grupo.');
        return;
      }

      manualReservationStatus.textContent = data.count === 1
        ? 'Reserva encolada para enviar al grupo.'
        : data.count + ' reservas encoladas para enviar al grupo.';
      closeGroupSendConfirm();
    }

    function downloadReservationsCsv() {
      window.location.href = '/api/reservations/export-csv';
    }

    function downloadDayReservationsCsv(isoDate) {
      window.location.href = '/api/reservations/export-csv?date=' + encodeURIComponent(isoDate);
    }

    function downloadTemplateCsv() {
      const csv =
        'nombre,telefono,fecha,fechaSalida,habitaciones,adultos,ninos,tipo,hora,tarifa\\n' +
        'Juan Perez,9931234567,25/12/2026,25/12/2026,1,2,0,Doble,3 pm,$700\\n';
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'plantilla-reservas.csv';
      link.click();
      URL.revokeObjectURL(link.href);
    }

    async function closeToday() {
      if (!dashboardData) return;

      closeStart.value = dashboardData.today;
      closeEnd.value = dashboardData.today;
      await closeRange();
    }

    async function closeRange() {
      syncSelectionFromInputs();

      const start = closeStart.value;
      const end = closeEnd.value || start;

      if (!start) {
        alert('Selecciona la fecha inicial.');
        return;
      }

      const response = await fetch('/api/close-dates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          start,
          end
        })
      });
      const data = await response.json();

      if (!data.ok) {
        alert(data.error || 'No se pudo cerrar la fecha.');
        return;
      }

      await loadDashboard();
    }

    async function openRange() {
      syncSelectionFromInputs();

      const start = closeStart.value;
      const end = closeEnd.value || start;

      if (!start) {
        alert('Selecciona la fecha inicial.');
        return;
      }

      const response = await fetch('/api/open-dates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          start,
          end
        })
      });
      const data = await response.json();

      if (!data.ok) {
        alert(data.error || 'No se pudo abrir el rango.');
        return;
      }

      await loadDashboard();
    }

    function changeCalendarMonth(direction) {
      calendarDate = new Date(
        calendarDate.getFullYear(),
        calendarDate.getMonth() + direction,
        1
      );
      renderCalendar();
    }

    function syncSelectionFromInputs() {
      selectedStart = closeStart.value;
      selectedEnd = closeEnd.value || selectedStart;

      if (
        selectedStart
        &&
        selectedEnd
        &&
        selectedEnd < selectedStart
      ) {
        const previousStart = selectedStart;
        selectedStart = selectedEnd;
        selectedEnd = previousStart;
        closeStart.value = selectedStart;
        closeEnd.value = selectedEnd;
      }

      updateSelectionSummary();
      renderCalendar();
    }

    function renderCalendar() {
      if (!dashboardData) return;

      const year = calendarDate.getFullYear();
      const month = calendarDate.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const startOffset = firstDay.getDay();
      const closed = new Set(dashboardData.closedDates);
      const occupancyByDate = Object.fromEntries(
        dashboardData.occupancy.map(row => [
          row.date,
          row
        ])
      );
      const groupByDate = Object.fromEntries(
        dashboardData.groupReservationCalendar.map(row => [
          row.date,
          row
        ])
      );
      const todayDisplay = isoToDisplay(dashboardData.today);

      calendarTitle.textContent = firstDay.toLocaleDateString('es-MX', {
        month: 'long',
        year: 'numeric'
      });

      const weekdays = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
      const cells = weekdays.map(day => '<div class="weekday">' + day + '</div>');

      for (let index = 0; index < startOffset; index++) {
        cells.push('<div class="day empty"></div>');
      }

      for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(year, month, day);
        const display = dateToDisplay(date);
        const iso = dateToIso(date);
        const row = occupancyByDate[display] || { counts: {}, limits: dashboardData.limits };
        const groupRow = groupByDate[display] || { occupied: 0, total: dashboardData.totalRooms || 69 };
        const isClosed = closed.has(display);
        const isSelected = iso === closeStart.value || iso === closeEnd.value;
        const isInRange = isIsoWithinSelection(iso);
        const className = 'day'
          + (isClosed ? ' closed' : '')
          + (isInRange ? ' in-range' : '')
          + (isSelected ? ' selected' : '')
          + (display === todayDisplay ? ' today' : '');
        const meta = isClosed
          ? 'Cerrado'
          : groupRow.occupied + '/' + groupRow.total + ' reservas<br>' + renderInventoryMini(row);

        cells.push(
          '<div class="' + className + '" onclick="selectCalendarDate(\\'' + iso + '\\')">' +
            '<span class="day-top">' +
              '<span class="day-number">' + day + '</span>' +
              '<button class="day-view ' + (groupRow.occupied ? 'has-reservations' : '') + '" onclick="openDayModal(\\'' + iso + '\\'); event.stopPropagation();">Ver</button>' +
            '</span>' +
            '<span class="day-meta">' + meta + '</span>' +
          '</div>'
        );
      }

      calendar.innerHTML = cells.join('');
    }

    function renderInventoryMini(row) {
      const labels = {
        King: 'K',
        'Suite King': 'SK',
        'Doble Suite': 'DS',
        Doble: 'D'
      };

      return Object.keys(dashboardData.limits)
        .map(type => {
          const used = row.counts?.[type] || 0;
          const limit = row.limits?.[type] || dashboardData.limits[type] || 0;
          return (labels[type] || type) + ' ' + used + '/' + limit;
        })
        .join(' / ');
    }

    function shortRoomLabel(type) {
      const labels = {
        King: 'K',
        'Suite King': 'SK',
        'Doble Suite': 'DS',
        Doble: 'D'
      };

      return labels[type] || type;
    }

    function getTotalUsed(row) {
      return Object.values(row.counts || {})
        .reduce((total, value) => total + Number(value || 0), 0);
    }

    function compareDisplayDates(left, right) {
      return displayDateValue(left) - displayDateValue(right);
    }

    function displayDateValue(value) {
      const parts = String(value || '').split('/').map(Number);
      return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
    }

    function selectCalendarDate(isoDate) {
      if (
        !selectedStart
        ||
        (
          selectedStart
          &&
          selectedEnd
        )
      ) {
        selectedStart = isoDate;
        selectedEnd = "";
        closeStart.value = isoDate;
        closeEnd.value = isoDate;
      } else {
        selectedEnd = isoDate;

        if (selectedEnd < selectedStart) {
          const previousStart = selectedStart;
          selectedStart = selectedEnd;
          selectedEnd = previousStart;
        }

        closeStart.value = selectedStart;
        closeEnd.value = selectedEnd;
      }

      updateSelectionSummary();
      renderGroupReservationDetail(selectedStart);
      renderCalendar();
    }

    function renderGroupReservationDetail(isoDate) {
      if (!dashboardData || !isoDate) {
        groupReservationDetail.innerHTML = '';
        return;
      }

      const display = isoToDisplay(isoDate);
      const row = getCalendarRowForIso(isoDate);

      if (!row || !row.reservations.length) {
        groupReservationDetail.innerHTML =
          '<div class="day-summary-card">' +
            '<div><strong>' + display + '</strong><div class="muted">Sin reservas detectadas para este dia.</div></div>' +
            '<button onclick="openDayModal(\\'' + isoDate + '\\')">Ver dia</button>' +
          '</div>';
        return;
      }

      const totals = getDayTotals(row);
      groupReservationDetail.innerHTML =
        '<div class="day-summary-card">' +
          '<div>' +
            '<strong>' + display + ': ' + row.occupied + '/' + row.total + ' habitaciones</strong>' +
            '<div class="summary-chips">' +
              '<span class="chip">' + row.reservations.length + ' reserva(s)</span>' +
              '<span class="chip">' + totals.adultos + ' adulto(s)</span>' +
              '<span class="chip">' + totals.ninos + ' menor(es)</span>' +
              '<span class="chip">' + totals.manual + ' manual/excel</span>' +
            '</div>' +
          '</div>' +
          '<button class="primary" onclick="openDayModal(\\'' + isoDate + '\\')">Ver desglose</button>' +
        '</div>';
    }

    function getCalendarRowForIso(isoDate) {
      const display = isoToDisplay(isoDate);
      return dashboardData.groupReservationCalendar.find(item => item.date === display);
    }

    function filterClientReservationsByDisplayDate(reservations, displayDate) {
      const isoDate = displayToIsoClient(displayDate);

      return (reservations || []).filter(reservation => {
        const dates = Array.isArray(reservation.dates)
          ? reservation.dates
          : [reservation.fecha].filter(Boolean);

        return dates.some(date => {
          const text = String(date || '').trim();
          return text === displayDate ||
            text === isoDate ||
            displayToIsoClient(text) === isoDate ||
            isoToDisplay(text) === displayDate;
        });
      });
    }

    function getReservationsForIsoDate(isoDate) {
      return filterClientReservationsByDisplayDate(
        dashboardData?.groupReservations || [],
        isoToDisplay(isoDate)
      );
    }

    function getDayTotals(row) {
      return row.reservations.reduce((totals, item) => {
        totals.adultos += Number(item.adultos || 0);
        totals.ninos += Number(item.ninos || 0);
        if (item.source === 'manual' || item.source === 'excel') {
          totals.manual++;
        }
        if (item.source === 'bot') {
          totals.bot++;
        }
        return totals;
      }, {
        adultos: 0,
        ninos: 0,
        manual: 0,
        bot: 0
      });
    }

    function openDayModal(isoDate) {
      if (!dashboardData) return;

      activeModalIsoDate = isoDate;
      const display = isoToDisplay(isoDate);
      const calendarRow = getCalendarRowForIso(isoDate) || {
        date: display,
        occupied: 0,
        total: dashboardData.totalRooms || 69,
        reservations: []
      };
      const reservationsForDay =
        filterClientReservationsByDisplayDate(
          dashboardData.groupReservations || [],
          display
        );
      const row = {
        ...calendarRow,
        reservations:
          reservationsForDay,
        occupied:
          reservationsForDay.reduce((total, reservation) =>
            total + Number(reservation.habitaciones || 1),
            0
          ),
        total:
          calendarRow.total || dashboardData.totalRooms || 69
      };
      const totals = getDayTotals(row);

      dayModalTitle.textContent = 'Reservas para ' + display;
      dayModalSubtitle.textContent = row.occupied + '/' + row.total + ' habitaciones ocupadas en calendario';
      const dayDownloadButton =
        '<div class="toolbar" style="margin-bottom:12px"><button class="primary" onclick="downloadDayReservationsCsv(\\'' + isoDate + '\\')">Descargar CSV del dia</button><div class="muted">Exporta solo las reservas de ' + escapeHtml(display) + '.</div></div>';

      if (!row.reservations.length) {
        dayModalBody.innerHTML =
          dayDownloadButton +
          '<div class="modal-kpis">' +
            '<div class="modal-kpi"><span class="muted">Reservas</span><strong>0</strong></div>' +
            '<div class="modal-kpi"><span class="muted">Habitaciones</span><strong>0/' + row.total + '</strong></div>' +
            '<div class="modal-kpi"><span class="muted">Adultos</span><strong>0</strong></div>' +
            '<div class="modal-kpi"><span class="muted">Menores</span><strong>0</strong></div>' +
          '</div>' +
          '<div class="muted">No hay reservas detectadas para este dia.</div>';
      } else {
        dayModalBody.innerHTML =
          dayDownloadButton +
          '<div class="modal-kpis">' +
            '<div class="modal-kpi"><span class="muted">Reservas</span><strong>' + row.reservations.length + '</strong></div>' +
            '<div class="modal-kpi"><span class="muted">Habitaciones</span><strong>' + row.occupied + '/' + row.total + '</strong></div>' +
            '<div class="modal-kpi"><span class="muted">Adultos</span><strong>' + totals.adultos + '</strong></div>' +
            '<div class="modal-kpi"><span class="muted">Menores</span><strong>' + totals.ninos + '</strong></div>' +
          '</div>' +
          '<div class="summary-chips" style="margin-bottom:12px">' +
            '<span class="chip">Bot ' + totals.bot + '</span>' +
            '<span class="chip">Manual/Excel ' + totals.manual + '</span>' +
          '</div>' +
          '<div class="day-reservation-list">' +
          row.reservations.map((item, index) => {
            const arrival = getReservationArrivalState(item);
            return '<article class="day-reservation-item ' + arrival.className + '">' +
              '<div class="day-reservation-head">' +
                '<div><strong>' + escapeHtml(item.nombre || 'Sin nombre') + '</strong><div class="muted">' + escapeHtml(item.timestamp || '') + '</div></div>' +
                '<div class="summary-chips"><span class="pill">' + escapeHtml(item.source || '-') + '</span><span class="pill ' + escapeHtml(item.status || '') + '">' + escapeHtml(item.status || 'activa') + '</span>' +
                  '<span class="pill ' + arrival.className + '">' + arrival.label + (item.arrivalAt && item.roomNumber ? ' ' + escapeHtml(item.roomNumber) : '') + '</span>' +
                '</div>' +
              '</div>' +
              '<div class="day-reservation-details">' +
                '<div><span class="muted">Habitaciones</span><strong>' + escapeHtml(item.habitaciones || 1) + '</strong></div>' +
                '<div><span class="muted">Huespedes</span><strong>' + escapeHtml((item.adultos || 0) + ' adulto(s), ' + (item.ninos || 0) + ' menor(es)') + '</strong></div>' +
                '<div><span class="muted">Tipo / hora sistema</span><strong>' + escapeHtml(item.tipo || '-') + ' / ' + escapeHtml(getReservationTimeDisplay(item.hora)) + '</strong></div>' +
                '<div><span class="muted">Telefono / tarifa</span><strong>' + escapeHtml(item.telefono || '-') + ' / ' + escapeHtml(getReservationPricingText(item)) + '</strong></div>' +
                '<div><span class="muted">Llegada / habitacion</span><strong>' + escapeHtml(item.arrivalAt ? new Date(item.arrivalAt).toLocaleString() : 'Pendiente') + ' / ' + escapeHtml(item.roomNumber || '-') + '</strong></div>' +
              '</div>' +
              '<div class="day-reservation-actions">' +
                renderNoteEditor(item) +
                '<div><button class="compact" onclick="openReservationArrival(' + index + ')">' + (item.arrivalAt ? 'Ver llegada' : 'Registrar llegada') + '</button> <button class="compact" onclick="openReservationEdit(' + index + ')">Editar</button> <button class="danger compact" onclick="confirmDeleteReservation(' + index + ')">Eliminar</button></div>' +
              '</div>' +
            '</article>';
          }).join('') +
          '</div>';
      }

      dayModalBackdrop.classList.remove('hidden');
      document.body.classList.add('modal-open');
    }

    function closeDayModal() {
      dayModalBackdrop.classList.add('hidden');
      reservationEditBackdrop.classList.add('hidden');
      reservationArrivalBackdrop.classList.add('hidden');
      confirmDeleteBackdrop.classList.add('hidden');
      pendingDeleteReservation = null;
      pendingEditReservation = null;
      pendingArrivalReservation = null;
      document.body.classList.remove('modal-open');
    }

    function displayToIso(value) {
      const parts = String(value || '').split('/').map(Number);

      if (parts.length !== 3 || parts.some(part => !part)) {
        return '';
      }

      return String(parts[2]).padStart(4, '0') + '-' + String(parts[1]).padStart(2, '0') + '-' + String(parts[0]).padStart(2, '0');
    }

    function getEditReservationDates(startValue, endValue) {
      const start = isoToDate(startValue);
      const end = isoToDate(endValue || startValue);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
        return [];
      }

      const dates = [];
      const cursor = new Date(start);

      while (cursor <= end) {
        dates.push(dateToDisplay(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }

      return dates;
    }

    function openReservationEdit(index) {
      const reservation = getReservationsForIsoDate(activeModalIsoDate)[index];

      if (!reservation?.sourceKey) {
        alert('No se encontro la llave de esta reserva.');
        return;
      }

      pendingEditReservation = reservation;
      const dates = reservation.dates || [reservation.fecha];
      editReservationName.value = reservation.nombre || '';
      editReservationPhone.value = reservation.telefono || '';
      editReservationStart.value = displayToIso(dates[0] || reservation.fecha);
      editReservationEnd.value = displayToIso(dates[dates.length - 1] || reservation.fecha);
      editReservationRooms.value = reservation.habitaciones || 1;
      editReservationAdults.value = reservation.adultos || 0;
      editReservationChildren.value = reservation.ninos || 0;
      editReservationType.value = reservation.tipo || '';
      editReservationTime.value = reservation.hora || '';
      editReservationRate.innerHTML = renderHotelRateOptions(reservation.tarifa || '');
      editReservationRate.value = reservation.tarifa || '';
      editRateLocked = clientIsMananeraRate(editReservationRate.value) || !hotelAutoRateValues.has(String(editReservationRate.value || '').trim());
      editReservationNote.value = reservation.note || '';
      reservationEditSubtitle.textContent = reservation.source ? 'Fuente: ' + reservation.source : '';
      reservationEditBackdrop.classList.remove('hidden');
      document.body.classList.add('modal-open');
    }

    function closeReservationEdit() {
      reservationEditBackdrop.classList.add('hidden');
      pendingEditReservation = null;

      if (dayModalBackdrop.classList.contains('hidden')) {
        document.body.classList.remove('modal-open');
      }
    }

    function openReservationArrival(index) {
      const reservation = getReservationsForIsoDate(activeModalIsoDate)[index];

      openReservationArrivalFor(reservation);
    }

    function openReservationArrivalByKey(sourceKey) {
      const reservation = (dashboardData?.groupReservations || [])
        .find(item => item.sourceKey === sourceKey);

      openReservationArrivalFor(reservation);
    }

    function openReservationArrivalFor(reservation) {

      if (!reservation?.sourceKey) {
        alert('No se encontro la llave de esta reserva.');
        return;
      }

      pendingArrivalReservation = reservation;

      reservationArrivalTitle.textContent = reservation.arrivalAt
        ? 'Llegada registrada'
        : 'Registrar llegada';
      reservationArrivalSubtitle.textContent = reservation.nombre || 'Reserva sin nombre';
      reservationArrivalDetails.innerHTML =
        '<div><span class="muted">Fecha</span><strong>' + escapeHtml((reservation.dates || [reservation.fecha]).join(' al ')) + '</strong></div>' +
        '<div><span class="muted">Tipo</span><strong>' + escapeHtml(reservation.tipo || '-') + '</strong></div>' +
        '<div><span class="muted">Nota</span><strong>' + escapeHtml(reservation.note || 'Sin nota interna') + '</strong></div>';
      reservationArrivalRoom.value = reservation.roomNumber || '';
      reservationArrivalHelp.textContent =
        'Escribe o selecciona una habitacion. Al asignarla se guardara como ocupada; no se enviara aviso al grupo.';
      reservationArrivalBackdrop.classList.remove('hidden');
      document.body.classList.add('modal-open');
    }

    function closeReservationArrival() {
      reservationArrivalBackdrop.classList.add('hidden');
      pendingArrivalReservation = null;

      if (dayModalBackdrop.classList.contains('hidden')) {
        document.body.classList.remove('modal-open');
      }
    }

    async function saveReservationArrival() {
      if (!pendingArrivalReservation) {
        return;
      }

      const response = await fetch('/api/reservations/arrival', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sourceKey: pendingArrivalReservation.sourceKey,
          room: reservationArrivalRoom.value
        })
      });
      const data = await response.json();

      if (!data.ok) {
        alert(data.error || 'No se pudo registrar la llegada.');
        return;
      }

      closeReservationArrival();
      await loadDashboard();
      if (activeModalIsoDate && !dayModalBackdrop.classList.contains('hidden')) {
        openDayModal(activeModalIsoDate);
      }
    }

    async function saveReservationEdit() {
      if (!pendingEditReservation) {
        return;
      }

      refreshEditRate();

      const dates = getEditReservationDates(
        editReservationStart.value,
        editReservationEnd.value
      );

      if (!editReservationName.value.trim() || !dates.length) {
        alert('Cliente y fechas validas son requeridos.');
        return;
      }

      const response = await fetch('/api/reservations/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sourceKey: pendingEditReservation.sourceKey,
          nombre: editReservationName.value.trim(),
          telefono: editReservationPhone.value.trim(),
          dates,
          habitaciones: Number(editReservationRooms.value || 1),
          adultos: Number(editReservationAdults.value || 0),
          ninos: Number(editReservationChildren.value || 0),
          tipo: editReservationType.value.trim(),
          hora: editReservationTime.value.trim(),
          tarifa: editReservationRate.value.trim(),
          note: editReservationNote.value.trim()
        })
      });
      const data = await response.json();

      if (!data.ok) {
        alert(data.error || 'No se pudo actualizar la reserva.');
        return;
      }

      closeReservationEdit();
      await loadDashboard();
      openDayModal(activeModalIsoDate);
    }

    function confirmDeleteReservation(index) {
      const reservation = getReservationsForIsoDate(activeModalIsoDate)[index];

      if (!reservation) {
        return;
      }

      pendingDeleteReservation = reservation;
      confirmDeleteText.innerHTML =
        '<strong>' + escapeHtml(reservation.nombre || 'Sin nombre') + '</strong>' +
        '<div class="muted">' +
          escapeHtml((reservation.dates || [reservation.fecha]).join(', ')) +
          ' / ' + escapeHtml(reservation.habitaciones || 1) + ' hab(s)' +
          (reservation.tipo ? ' / ' + escapeHtml(reservation.tipo) : '') +
        '</div>';
      confirmDeleteBackdrop.classList.remove('hidden');
      document.body.classList.add('modal-open');
    }

    function closeDeleteConfirm() {
      confirmDeleteBackdrop.classList.add('hidden');
      pendingDeleteReservation = null;

      if (dayModalBackdrop.classList.contains('hidden')) {
        document.body.classList.remove('modal-open');
      }
    }

    async function deleteSelectedReservation() {
      if (!pendingDeleteReservation) {
        return;
      }

      const response = await fetch('/api/reservations/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sourceKey: pendingDeleteReservation.sourceKey,
          folio: pendingDeleteReservation.folio
        })
      });
      const data = await response.json();

      if (!data.ok) {
        alert(data.error || 'No se pudo eliminar la reserva.');
        return;
      }

      closeDeleteConfirm();
      await loadDashboard();

      if (activeModalIsoDate) {
        openDayModal(activeModalIsoDate);
      }
    }

    function isIsoWithinSelection(isoDate) {
      const start = closeStart.value;
      const end = closeEnd.value || start;

      if (!start) {
        return false;
      }

      return isoDate >= start && isoDate <= end;
    }

    function updateSelectionSummary() {
      const start = closeStart.value;
      const end = closeEnd.value || start;

      if (!start) {
        selectionSummary.textContent = 'Selecciona una fecha en el calendario.';
        return;
      }

      selectionSummary.textContent = start === end
        ? 'Seleccionado: ' + isoToDisplay(start)
        : 'Rango seleccionado: ' + isoToDisplay(start) + ' al ' + isoToDisplay(end);
    }

    async function analyzeRack() {
      const file = rackImage.files[0];

      if (!file) {
        alert('Selecciona una foto del rack.');
        return;
      }

      rackResult.value = 'Leyendo rack... puede tardar hasta 90 segundos.';
      analyzeRackButton.disabled = true;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);

      try {
        const dataUrl = await fileToCompressedDataUrl(file);
        const imageBase64 = dataUrl.split(',')[1];

        const response = await fetch('/api/rack/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          signal: controller.signal,
          body: JSON.stringify({
            imageBase64,
            mimeType: 'image/jpeg'
          })
        });

        const data = await response.json();

        rackResult.value = data.ok
          ? data.message + (data.ocrPreview ? '\\n\\n--- OCR detectado ---\\n' + data.ocrPreview : '')
          : data.error || 'No se pudo analizar el rack.';
      } catch (error) {
        rackResult.value = error.name === 'AbortError'
          ? 'La lectura tardo demasiado. Intenta con una foto mas derecha, bien iluminada y tomada de frente.'
          : 'No se pudo analizar el rack: ' + (error.message || 'error desconocido');
      } finally {
        clearTimeout(timeout);
        analyzeRackButton.disabled = false;
      }
    }

    async function analyzeRackCsvFile() {
      const file = rackCsv.files[0];

      if (!file) {
        alert('Selecciona el CSV exportado del rack.');
        return;
      }

      rackResult.value = 'Leyendo CSV del rack...';
      analyzeRackCsvButton.disabled = true;

      try {
        const csvText = await file.text();

        const response = await fetch('/api/rack/analyze-csv', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            csvText,
            fileName: file.name
          })
        });

        const data = await response.json();

        rackResult.value = data.ok
          ? data.message + (data.saved ? '\\n\\nGuardado como ultimo rack.' : '\\n\\nNo se guardo porque ya existe un rack mas reciente.')
          : data.error || 'No se pudo analizar el CSV.';

        if (data.ok) {
          await loadDashboard();
        }
      } catch (error) {
        rackResult.value = 'No se pudo analizar el CSV: ' + (error.message || 'error desconocido');
      } finally {
        analyzeRackCsvButton.disabled = false;
      }
    }

    let activeFileInputId = '';

    function setupFileDropzones() {
      document.querySelectorAll('[data-file-zone]').forEach(zone => {
        const input = document.getElementById(zone.dataset.fileZone);

        if (!input) {
          return;
        }

        zone.addEventListener('focusin', () => setActiveFileZone(zone));
        zone.addEventListener('mouseenter', () => setActiveFileZone(zone));
        zone.addEventListener('click', () => setActiveFileZone(zone));
        zone.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            input.click();
          }
        });

        input.addEventListener('change', () => updateFileZone(input));

        ['dragenter', 'dragover'].forEach(type => {
          zone.addEventListener(type, event => {
            event.preventDefault();
            setActiveFileZone(zone);
            zone.classList.add('dragging');
          });
        });

        ['dragleave', 'drop'].forEach(type => {
          zone.addEventListener(type, () => {
            zone.classList.remove('dragging');
          });
        });

        zone.addEventListener('drop', event => {
          event.preventDefault();
          setFileInputFiles(input, event.dataTransfer.files);
        });
      });

      document.addEventListener('paste', event => {
        const files = Array.from(event.clipboardData?.files || []);

        if (!files.length) {
          return;
        }

        const zone = findPasteTarget(files);

        if (!zone) {
          return;
        }

        const input = document.getElementById(zone.dataset.fileZone);

        if (input && setFileInputFiles(input, files)) {
          event.preventDefault();
          setActiveFileZone(zone);
        }
      });
    }

    function setActiveFileZone(zone) {
      activeFileInputId = zone.dataset.fileZone || activeFileInputId;
      document.querySelectorAll('[data-file-zone]').forEach(item => {
        item.classList.toggle('active', item === zone);
      });
    }

    function findPasteTarget(files) {
      const zones = Array.from(document.querySelectorAll('[data-file-zone]'));
      const activeZone = zones.find(zone => zone.dataset.fileZone === activeFileInputId);

      if (activeZone && files.some(file => fileMatchesInput(file, document.getElementById(activeZone.dataset.fileZone)))) {
        return activeZone;
      }

      return zones.find(zone => {
        const input = document.getElementById(zone.dataset.fileZone);
        const isVisible = zone.offsetParent !== null;
        return isVisible && files.some(file => fileMatchesInput(file, input));
      });
    }

    function setFileInputFiles(input, files) {
      const compatible = Array.from(files || [])
        .filter(file => fileMatchesInput(file, input));

      if (!compatible.length) {
        return false;
      }

      const transfer = new DataTransfer();
      transfer.items.add(compatible[0]);
      input.files = transfer.files;
      updateFileZone(input);
      return true;
    }

    function fileMatchesInput(file, input) {
      if (!file || !input) {
        return false;
      }

      const accept = String(input.getAttribute('accept') || '').split(',').map(item => item.trim()).filter(Boolean);

      if (!accept.length) {
        return true;
      }

      const name = String(file.name || '').toLowerCase();
      const type = String(file.type || '').toLowerCase();

      return accept.some(rule => {
        const normalized = rule.toLowerCase();

        if (normalized.endsWith('/*')) {
          return type.startsWith(normalized.slice(0, -1));
        }

        if (normalized.startsWith('.')) {
          return name.endsWith(normalized);
        }

        return type === normalized || (normalized === 'text/csv' && name.endsWith('.csv'));
      });
    }

    function updateFileZone(input) {
      const label = document.getElementById(input.id + 'Name');
      const file = input.files?.[0];

      if (!label) {
        return;
      }

      label.textContent = file ? file.name : label.id === 'rackImageName'
        ? 'Arrastra, pega o elige imagen'
        : 'Arrastra, pega o elige archivo';
    }

    function fileToCompressedDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const image = new Image();
          image.onload = () => {
            const maxSide = 1800;
            const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
            const width = Math.max(1, Math.round(image.width * ratio));
            const height = Math.max(1, Math.round(image.height * ratio));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.86));
          };
          image.onerror = reject;
          image.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    function isoToDate(value) {
      const parts = value.split('-').map(Number);
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    function isoToDisplay(value) {
      if (!/^\d{4}-\d{2}-\d{2}/.test(String(value || ''))) {
        return '';
      }
      return dateToDisplay(isoToDate(value));
    }

    function dateToIso(date) {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return date.getFullYear() + '-' + month + '-' + day;
    }

    function dateToDisplay(date) {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return day + '/' + month + '/' + date.getFullYear();
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function escapeJs(value) {
      return JSON.stringify(String(value))
        .slice(1, -1)
        .split("'")
        .join("\\\\'");
    }

    setupFileDropzones();
    loadBotStatus();
    loadDashboard();
    setInterval(loadBotStatus, 5000);
    document.addEventListener('click', event => {
      const searchPanel = document.querySelector('.global-search-panel');

      if (
        searchPanel &&
        !searchPanel.contains(event.target) &&
        !globalSearchResults.classList.contains('hidden')
      ) {
        closeGlobalSearchResults();
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (!globalSearchResults.classList.contains('hidden')) {
          closeGlobalSearchResults();
        } else if (!confirmRackBackdrop.classList.contains('hidden')) {
          closeRackConfirm();
        } else if (!searchDetailModalBackdrop.classList.contains('hidden')) {
          closeSearchDetailModal();
        } else if (!eventDetailModalBackdrop.classList.contains('hidden')) {
          closeEventDetailModal();
        } else if (!quoteEventModalBackdrop.classList.contains('hidden')) {
          closeQuoteEventModal();
        } else if (!quoteMenuModalBackdrop.classList.contains('hidden')) {
          closeQuoteMenuModal();
        } else if (!groupSendConfirmBackdrop.classList.contains('hidden')) {
          closeGroupSendConfirm();
        } else if (!reservationArrivalBackdrop.classList.contains('hidden')) {
          closeReservationArrival();
        } else if (!confirmDeleteBackdrop.classList.contains('hidden')) {
          closeDeleteConfirm();
        } else {
          closeDayModal();
        }
      }
    });
  </script>
</body>
</html>`;
}

const server =
  http.createServer(async (req, res) => {
    const url =
      new URL(req.url, `http://${req.headers.host}`);

    if (
      req.method === "GET"
      &&
      url.pathname === "/"
    ) {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      });
      res.end(pageHtml());
      return;
    }

    if (
      req.method === "GET"
      &&
      url.pathname.startsWith("/media/")
    ) {
      const mediaRoot =
        path.resolve(
          __dirname,
          "media"
        );
      const relative =
        decodeURIComponent(
          url.pathname.replace(/^\/media\//, "")
        );
      const filePath =
        path.resolve(
          mediaRoot,
          relative
        );

      if (
        !filePath.startsWith(mediaRoot)
        ||
        !fs.existsSync(filePath)
      ) {
        sendJson(res, 404, {
          ok: false,
          error: "Archivo no encontrado"
        });
        return;
      }

      const ext =
        path.extname(filePath).toLowerCase();
      const contentType =
        ext === ".png"
          ? "image/png"
          : "image/jpeg";

      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600"
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    if (
      req.method === "GET"
      &&
      url.pathname === "/api/summary"
    ) {
      sendJson(res, 200, getSummary());
      return;
    }

    if (
      req.method === "GET"
      &&
      url.pathname === "/api/reports"
    ) {
      try {
        sendJson(res, 200, {
          ok:
            true,
          reports:
            getReports({
              month:
                url.searchParams.get("month")
            })
        });
      } catch (error) {
        sendJson(res, 500, {
          ok:
            false,
          error:
            error.message || "No se pudieron generar reportes"
        });
      }

      return;
    }

    if (
      req.method === "GET"
      &&
      url.pathname === "/api/reports/export-csv"
    ) {
      try {
        const month =
          url.searchParams.get("month");
        const type =
          url.searchParams.get("type") || "all";
        const report =
          getReports({
            month
          });
        const fileMonth =
          report.month || normalizeReportMonth(month) || getMexicoTodayIso().slice(0, 7);

        res.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="reporte-${type}-${fileMonth}.csv"`,
          "Cache-Control": "no-store"
        });
        res.end(
          getReportCsv(
            type,
            report
          )
        );
      } catch (error) {
        sendJson(res, 500, {
          ok:
            false,
          error:
            error.message || "No se pudo exportar el reporte"
        });
      }

      return;
    }

    if (
      req.method === "GET"
      &&
      url.pathname === "/api/search"
    ) {
      try {
        sendJson(res, 200, {
          ok:
            true,
          results:
            getDashboardSearchService().getGlobalSearch(
              url.searchParams.get("q")
            )
        });
      } catch (error) {
        sendJson(res, 500, {
          ok:
            false,
          error:
            error.message || "No se pudo buscar"
        });
      }

      return;
    }

    if (
      req.method === "GET"
      &&
      url.pathname === "/api/guest-history"
    ) {
      try {
        sendJson(res, 200, {
          ok:
            true,
          history:
            getDashboardSearchService().getGuestHistory(
              url.searchParams.get("q")
            )
        });
      } catch (error) {
        sendJson(res, 500, {
          ok:
            false,
          error:
            error.message || "No se pudo cargar historial"
        });
      }

      return;
    }

    if (
      req.method === "GET"
      &&
      url.pathname === "/api/room-blocks"
    ) {
      try {
        sendJson(res, 200, {
          ok:
            true,
          blocks:
            readRoomBlocks()
        });
      } catch (error) {
        sendJson(res, 500, {
          ok:
            false,
          error:
            error.message || "No se pudieron cargar bloqueos"
        });
      }

      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/room-blocks"
    ) {
      try {
        const body =
          await readBody(req);

        sendJson(res, 200, {
          ok:
            true,
          block:
            saveRoomBlock(body)
        });
      } catch (error) {
        sendJson(res, 400, {
          ok:
            false,
          error:
            error.message || "No se pudo guardar el bloqueo"
        });
      }

      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/rooms/events"
    ) {
      try {
        const body =
          await readBody(req);

        sendJson(res, 200, {
          ok:
            true,
          event:
            saveRoomEvent(body)
        });
      } catch (error) {
        sendJson(res, 400, {
          ok:
            false,
          error:
            error.message || "No se pudo guardar el evento de habitacion"
        });
      }

      return;
    }

    const quotationPrintMatch =
      url.pathname.match(/^\/api\/quotations\/([^/]+)\/print$/);

    if (
      req.method === "GET"
      &&
      quotationPrintMatch
    ) {
      const quotation =
        getQuotation(
          decodeURIComponent(
            quotationPrintMatch[1]
          )
        );

      if (!quotation) {
        sendJson(res, 404, {
          ok: false,
          error: "Cotizacion no encontrada"
        });
        return;
      }

      const pdf =
        await quotationPdfBuffer(quotation);

      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${quotation.id}.pdf"`,
        "Cache-Control": "no-store"
      });
      res.end(pdf);
      return;
    }

    const eventVoucherMatch =
      url.pathname.match(/^\/api\/events\/vouchers\/(\d+)$/);

    if (
      req.method === "GET"
      &&
      eventVoucherMatch
    ) {
      const voucher =
        getEventVoucher(
          eventVoucherMatch[1]
        );

      if (
        !voucher
        ||
        !voucher.filePath
        ||
        !fs.existsSync(voucher.filePath)
      ) {
        sendJson(res, 404, {
          ok:
            false,
          error:
            "Comprobante no encontrado"
        });
        return;
      }

      res.writeHead(200, {
        "Content-Type":
          voucher.mimeType || "application/octet-stream",
        "Cache-Control":
          "private, max-age=3600"
      });
      res.end(
        fs.readFileSync(voucher.filePath)
      );
      return;
    }

    if (
      req.method === "GET"
      &&
      url.pathname === "/api/reservations/export-csv"
    ) {
      const summary =
        getSummary();
      const isoDate =
        String(url.searchParams.get("date") || "").trim();
      const displayDate =
        isoDate
          ? isoToDisplayDate(isoDate)
          : "";
      const reservations =
        displayDate
          ? filterReservationsByDisplayDate(
            summary.groupReservations,
            displayDate
          )
          : summary.groupReservations;
      const fileName =
        displayDate
          ? `reservas-${isoDate}.csv`
          : "reservas-calendario.csv";

      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store"
      });
      res.end(
        reservationsToCsv(reservations)
      );
      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/reservations/note"
    ) {
      try {
        const body =
          await readBody(req);

        const note =
          saveReservationNote({
            reservationKey:
              body.reservationKey,
            note:
              body.note
          });

        sendJson(res, 200, {
          ok:
            true,
          note
        });
      } catch (error) {
        sendJson(res, 400, {
          ok:
            false,
          error:
            error.message || "No se pudo guardar la nota"
        });
      }

      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/quotations"
    ) {
      try {
        const body =
          await readBody(req);

        const quotation =
          saveQuotation(body);

        sendJson(res, 200, {
          ok:
            true,
          quotation
        });
      } catch (error) {
        sendJson(res, 400, {
          ok:
            false,
          error:
            error.message || "No se pudo guardar la cotizacion"
        });
      }

      return;
    }

    if (
      req.method === "GET"
      &&
      url.pathname === "/api/bot-status"
    ) {
      try {
        sendJson(
          res,
          200,
          await getBotStatus()
        );
      } catch (error) {
        sendJson(res, 500, {
          connection: "unknown",
          qrDataUrl: null,
          detail:
            error.message || "No se pudo generar el QR"
        });
      }

      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/events"
    ) {
      try {
        const body =
          await readBody(req);
        const event =
          saveEventBooking(body);

        sendJson(res, 200, {
          ok:
            true,
          event
        });
      } catch (error) {
        sendJson(res, 400, {
          ok:
            false,
          error:
            error.message || "No se pudo guardar el evento"
        });
      }

      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/events/vouchers"
    ) {
      try {
        const body =
          await readBody(req);
        const voucher =
          saveEventVoucher(body);

        sendJson(res, 200, {
          ok:
            true,
          voucher
        });
      } catch (error) {
        sendJson(res, 400, {
          ok:
            false,
          error:
            error.message || "No se pudo guardar el comprobante"
        });
      }

      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/quotation-menu"
    ) {
      try {
        const body =
          await readBody(req);

        const menu =
          saveQuotationMenu(
            body.items
          );

        sendJson(res, 200, {
          ok:
            true,
          menu
        });
      } catch (error) {
        sendJson(res, 400, {
          ok:
            false,
          error:
            error.message || "No se pudo guardar el catalogo"
        });
      }

      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/reservations/manual"
    ) {
      try {
        const body =
          await readBody(req);

        const reservation =
          normalizeManualReservation(body);

        saveCalendarReservation(reservation);

        if (body.note) {
          saveReservationNote({
            reservationKey:
              getReservationNoteKey(reservation),
            note:
              body.note
          });
        }

        sendJson(res, 200, {
          ok:
            true,
          reservation
        });
      } catch (error) {
        sendJson(res, 400, {
          ok:
            false,
          error:
            error.message || "No se pudo guardar la reserva"
        });
      }

      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/reservations/update"
    ) {
      try {
        const body =
          await readBody(req);

        if (!body.sourceKey) {
          throw new Error("Reserva requerida");
        }

        const pricedBody =
          applyReservationPricing(body);

        const reservation =
          updateCalendarReservation(
            String(pricedBody.sourceKey),
            pricedBody
          );

        if (Object.prototype.hasOwnProperty.call(pricedBody, "note")) {
          saveReservationNote({
            reservationKey:
              getReservationNoteKey(reservation),
            note:
              pricedBody.note
          });
        }

        sendJson(res, 200, {
          ok: true,
          reservation
        });
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          error:
            error.message || "No se pudo actualizar la reserva"
        });
      }

      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/reservations/import-csv"
    ) {
      try {
        const body =
          await readBody(req);

        const result =
          importReservationsFromCsv(
            body.csv
          );

        sendJson(res, 200, {
          ok:
            true,
          imported:
            result.imported.length,
          reservations:
            result.imported,
          errors:
            result.errors
        });
      } catch (error) {
        sendJson(res, 400, {
          ok:
            false,
          error:
            error.message || "No se pudo importar el CSV"
        });
      }

      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/reservations/arrival"
    ) {
      try {
        const body =
          await readBody(req);
        const sourceKey =
          String(body.sourceKey || "").trim();
        const room =
          String(body.room || "").replace(/\D/g, "");
        const current =
          readCalendarReservations()
            .find(reservation =>
              reservation.sourceKey === sourceKey
            );

        if (!current) {
          throw new Error("Reserva no encontrada");
        }

        if (room) {
          if (!HOTEL_ROOM_NUMBERS.includes(room)) {
            throw new Error("Habitacion invalida. Usa 101-122, 201-222, 301-322 o 401-406 (sin terminacion 13)");
          }

          const rackStatus =
            readLatestRackStatus();
          const rackRoom =
            rackStatus?.rooms?.find(item =>
              item.room === room
            );

          const isCurrentRoom =
            String(current.roomNumber || "") === room;
          if (
            rackRoom
            &&
            !isCurrentRoom
            &&
            !["VL", "VS"].includes(rackRoom.status)
          ) {
            throw new Error("La habitacion no esta disponible en el rack");
          }

          if (rackRoom && !isCurrentRoom) {
            updateRackRoomStatus({
              room,
              status: "OC"
            });
          }
        }

        const reservation =
          updateCalendarReservation(sourceKey, {
            arrivalAt:
              current.arrivalAt || new Date().toISOString(),
            ...(room ? { roomNumber: room } : {})
          });
        sendJson(res, 200, {
          ok: true,
          reservation,
          queuedForGroup: false
        });
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          error:
            error.message || "No se pudo registrar la llegada"
        });
      }

      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/reservations/send-to-group"
    ) {
      try {
        const body =
          await readBody(req);
        const notification =
          enqueueReservationGroupNotification(
            body.reservations,
            "dashboard"
          );

        sendJson(res, 200, {
          ok: true,
          notificationId: notification.id,
          count: notification.reservations.length
        });
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          error:
            error.message || "No se pudo preparar el envio al grupo"
        });
      }

      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/reservations/delete"
    ) {
      try {
        const body =
          await readBody(req);

        if (!body.sourceKey && !body.folio) {
          sendJson(res, 400, {
            ok:
              false,
            error:
              "Reserva requerida"
          });
          return;
        }

        if (body.sourceKey) {
          cancelCalendarReservationByKey(
            String(body.sourceKey)
          );
        }

        if (body.folio) {
          cancelRoomReservationByFolio(
            String(body.folio)
          );
        }

        sendJson(res, 200, {
          ok:
            true
        });
      } catch (error) {
        sendJson(res, 400, {
          ok:
            false,
          error:
            error.message || "No se pudo eliminar la reserva"
        });
      }

      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/rack/analyze"
    ) {
      try {
        const body =
          await readBody(req);

        if (!body.imageBase64) {
          sendJson(res, 400, {
            ok: false,
            error: "Imagen requerida"
          });
          return;
        }

        const result =
          await analyzeRackImage({
            imageBase64:
              body.imageBase64,
            mimeType:
              body.mimeType
          });

        sendJson(
          res,
          result.ok ? 200 : 400,
          result
        );
      } catch (error) {
        sendJson(res, 500, {
          ok: false,
          error:
            error.message || "No se pudo analizar el rack"
        });
      }

      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/rack/analyze-csv"
    ) {
      try {
        const body =
          await readBody(req);

        if (!body.csvText) {
          sendJson(res, 400, {
            ok: false,
            error: "CSV requerido"
          });
          return;
        }

        const result =
          analyzeRackCsv({
            csvText:
              body.csvText,
            fileName:
              body.fileName || "",
            uploadedBy:
              req.socket.remoteAddress || ""
          });

        sendJson(
          res,
          result.ok ? 200 : 400,
          result
        );
      } catch (error) {
        sendJson(res, 500, {
          ok: false,
          error:
            error.message || "No se pudo analizar el CSV del rack"
        });
      }

      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/rack/room-status"
    ) {
      try {
        const body =
          await readBody(req);

        const rackStatus =
          updateRackRoomStatus({
            room:
              body.room,
            status:
              body.status || "OC"
          });

        sendJson(res, 200, {
          ok:
            true,
          rackStatus
        });
      } catch (error) {
        sendJson(res, 400, {
          ok:
            false,
          error:
            error.message || "No se pudo actualizar la habitacion"
        });
      }

      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/cancel"
    ) {
      try {
        const body =
          await readBody(req);

        if (!body.folio) {
          sendJson(res, 400, {
            ok: false,
            error: "Folio requerido"
          });
          return;
        }

        cancelRoomReservationByFolio(String(body.folio));

        sendJson(res, 200, {
          ok: true
        });
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          error: "Solicitud invalida"
        });
      }

      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/close-dates"
    ) {
      try {
        const body =
          await readBody(req);

        const closedDates =
          closeDateRange({
            start:
              body.start,
            end:
              body.end || body.start
          });

        sendJson(res, 200, {
          ok: true,
          closedDates
        });
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          error:
            error.message || "No se pudo cerrar la fecha"
        });
      }

      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/open-date"
    ) {
      try {
        const body =
          await readBody(req);

        const closedDates =
          openDate(body.date);

        sendJson(res, 200, {
          ok: true,
          closedDates
        });
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          error:
            error.message || "No se pudo abrir la fecha"
        });
      }

      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/open-dates"
    ) {
      try {
        const body =
          await readBody(req);

        const closedDates =
          openDateRange({
            start:
              body.start,
            end:
              body.end || body.start
          });

        sendJson(res, 200, {
          ok: true,
          closedDates
        });
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          error:
            error.message || "No se pudo abrir el rango"
        });
      }

      return;
    }

    sendJson(res, 404, {
      ok: false,
      error: "Ruta no encontrada"
    });
  });

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Dashboard disponible en http://127.0.0.1:${PORT}`);
});
