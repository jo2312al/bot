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
  createRoomPreassignmentService
} = require("./services/roomPreassignmentService");
const {
  applyReservationPricing
} = require("./services/reservationPricingService");
const {
  handleRoomPreassignmentRoute
} = require("./dashboard/routes/roomPreassignmentRoutes");
const {
  handleRoomBlockRoute
} = require("./dashboard/routes/roomBlockRoutes");
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
const DASHBOARD_ASSET_VERSION =
  "dashboard-modules-20260709";
const DASHBOARD_SCRIPT_FILES = [
  "dashboard-core.js",
  "dashboard-search.js",
  "dashboard-reports.js",
  "dashboard-operations.js",
  "dashboard-rack-preassign.js",
  "dashboard-calendar-reservations.js",
  "dashboard-files-utils.js"
];
const {
  deleteRoomPreassignment,
  readRoomPreassignments,
  saveRoomPreassignment
} = createRoomPreassignmentService({
  dataFile:
    path.join(__dirname, "data", "room-preassignments.json"),
  displayDateToIso,
  hotelRoomNumbers:
    HOTEL_ROOM_NUMBERS,
  isoToDisplayDate,
  normalizeRoomType,
  readGroupReservations,
  readLatestRackStatus
});

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

function getDatesForNights(startDisplay, nightsValue) {
  const start =
    dateValue(startDisplay);
  const nights =
    Math.max(Number.parseInt(nightsValue, 10) || 1, 1);

  if (Number.isNaN(start)) {
    return [];
  }

  const dates =
    [];
  const current =
    new Date(start);

  for (let index = 0; index < nights; index++) {
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
  const source =
    pricedInput.source || "manual";
  const fecha =
    String(pricedInput.fecha || "").includes("-")
      ? isoToDisplayDate(pricedInput.fecha)
      : String(pricedInput.fecha || "").trim();

  const dates =
    pricedInput.fechaSalida
      ? getDatesBetween(
        fecha,
        String(pricedInput.fechaSalida).includes("-")
          ? isoToDisplayDate(pricedInput.fechaSalida)
          : String(pricedInput.fechaSalida).trim()
      )
      : getDatesForNights(
        fecha,
        pricedInput.noches || pricedInput.nights || 1
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
      source,
    sourceKey,
    folio:
      pricedInput.folio || generateReservationFolio(source),
    timestamp:
      new Date().toISOString(),
    nombre:
      String(pricedInput.nombre || "").trim(),
    telefono:
      String(pricedInput.telefono || "").trim(),
    fecha:
      dates[0],
    dates,
    noches:
      Math.max(Number(pricedInput.noches || dates.length || 1), 1),
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

function generateReservationFolio(source) {
  const prefixes = {
    manual: "M",
    excel: "E",
    bot: "B"
  };
  const prefix =
    prefixes[String(source || "").toLowerCase()] || "R";
  const time =
    Date.now()
      .toString(36)
      .toUpperCase()
      .slice(-5);
  const random =
    Math.random()
      .toString(36)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(2, 5)
      .padEnd(3, "0");

  return `${prefix}-${time}${random}`;
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

function publicFilePath(relativePath) {
  const publicRoot =
    path.resolve(
      __dirname,
      "public"
    );
  const filePath =
    path.resolve(
      publicRoot,
      String(relativePath || "").replace(/^\/public\//, "")
    );

  return filePath.startsWith(publicRoot) && fs.existsSync(filePath)
    ? filePath
    : "";
}

function staticContentType(filePath) {
  const ext =
    path.extname(filePath).toLowerCase();

  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".svg") return "image/svg+xml";

  return "application/octet-stream";
}

function dashboardScriptTags() {
  return DASHBOARD_SCRIPT_FILES
    .map(file =>
      `<script src="/public/${file}?v=${DASHBOARD_ASSET_VERSION}"></script>`
    )
    .join("\n  ");
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
    "noches",
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
        reservation.noches || dates.length || 1,
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
    const arrivalDate =
      reservation.fecha || dates[0];

    return arrivalDate === displayDate
      ||
      arrivalDate === isoDate
      ||
      displayDateToIso(arrivalDate) === isoDate
      ||
      isoToDisplayDate(arrivalDate) === displayDate;
  });
}

function normalizeCsvReservationDate(value) {
  const text =
    String(value || "").trim();
  const match =
    text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!match) {
    return text;
  }

  const first =
    Number(match[1]);
  const second =
    Number(match[2]);
  const year =
    Number(match[3]);

  if (
    first === 7
    &&
    second >= 1
    &&
    second <= 31
  ) {
    return `${String(second).padStart(2, "0")}/07/${year}`;
  }

  return `${String(first).padStart(2, "0")}/${String(second).padStart(2, "0")}/${year}`;
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
        const normalizedFecha =
          normalizeCsvReservationDate(data.fecha);
        const normalizedSalida =
          data.fechasalida || data.salida
            ? normalizeCsvReservationDate(data.fechasalida || data.salida)
            : "";
        const reservation =
          normalizeManualReservation({
            source:
              "excel",
            sourceKey:
              data.folio
                ? `excel:${data.folio}:${index + 2}`
                : `excel:${data.nombre}:${normalizedFecha}:${data.telefono}:${index + 2}`,
            folio:
              data.folio,
            nombre:
              data.nombre,
            telefono:
              data.telefono,
            fecha:
              normalizedFecha,
            fechaSalida:
              normalizedSalida,
            noches:
              data.noches || data.nights || 1,
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
    noche:
      "noches",
    noches:
      "noches",
    nights:
      "noches",
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
    roomPreassignments:
      readRoomPreassignments(),
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
          'occupiedNights',
            COUNT(DISTINCT rn.id)
            +
            (
              SELECT COUNT(DISTINCT rack.report_date)
              FROM rack_snapshots rack
              JOIN rack_snapshot_rooms rack_room ON rack_room.rack_snapshot_id = rack.id
              WHERE rack_room.room_id = room.id
                AND rack.report_date BETWEEN ${mysql.quote(range.startIso)} AND ${mysql.quote(range.endIso)}
                AND rack_room.room_status IN ('OC', 'OS', 'OL', 'OR', 'OSE', 'ND')
                AND NOT EXISTS (
                  SELECT 1
                  FROM reservation_room_nights rn2
                  JOIN reservations r2 ON r2.id = rn2.reservation_id
                  WHERE rn2.room_id = room.id
                    AND rn2.stay_date = rack.report_date
                    AND rn2.occupancy_status = 'ocupada'
                    AND r2.status != 'cancelada'
                )
            ),
          'lastOccupiedDate',
            CASE
              WHEN MAX(rn.stay_date) IS NULL
                AND (
                  SELECT MAX(rack.report_date)
                  FROM rack_snapshots rack
                  JOIN rack_snapshot_rooms rack_room ON rack_room.rack_snapshot_id = rack.id
                  WHERE rack_room.room_id = room.id
                    AND rack.report_date BETWEEN ${mysql.quote(range.startIso)} AND ${mysql.quote(range.endIso)}
                    AND rack_room.room_status IN ('OC', 'OS', 'OL', 'OR', 'OSE', 'ND')
                ) IS NULL THEN ''
              ELSE DATE_FORMAT(
                GREATEST(
                  COALESCE(MAX(rn.stay_date), '1000-01-01'),
                  COALESCE((
                    SELECT MAX(rack.report_date)
                    FROM rack_snapshots rack
                    JOIN rack_snapshot_rooms rack_room ON rack_room.rack_snapshot_id = rack.id
                    WHERE rack_room.room_id = room.id
                      AND rack.report_date BETWEEN ${mysql.quote(range.startIso)} AND ${mysql.quote(range.endIso)}
                      AND rack_room.room_status IN ('OC', 'OS', 'OL', 'OR', 'OSE', 'ND')
                  ), '1000-01-01')
                ),
                '%d/%m/%Y'
              )
            END,
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
        ORDER BY (
          COUNT(DISTINCT rn.id)
          +
          (
            SELECT COUNT(DISTINCT rack.report_date)
            FROM rack_snapshots rack
            JOIN rack_snapshot_rooms rack_room ON rack_room.rack_snapshot_id = rack.id
            WHERE rack_room.room_id = room.id
              AND rack.report_date BETWEEN ${mysql.quote(range.startIso)} AND ${mysql.quote(range.endIso)}
              AND rack_room.room_status IN ('OC', 'OS', 'OL', 'OR', 'OSE', 'ND')
              AND NOT EXISTS (
                SELECT 1
                FROM reservation_room_nights rn2
                JOIN reservations r2 ON r2.id = rn2.reservation_id
                WHERE rn2.room_id = room.id
                  AND rn2.stay_date = rack.report_date
                  AND rn2.occupancy_status = 'ocupada'
                  AND r2.status != 'cancelada'
              )
          )
        ) DESC, room.room_number;
      `),
    serviceDue:
      mysql.queryJson(`
        SELECT JSON_OBJECT(
          'roomNumber', room.room_number,
          'roomType', rt.name,
          'lastDeepCleanDate', IFNULL(DATE_FORMAT(MAX(CASE WHEN ret.code = 'DEEP_CLEAN' THEN re.event_date END), '%d/%m/%Y'), ''),
          'daysSinceDeepClean', IFNULL(DATEDIFF(CURDATE(), MAX(CASE WHEN ret.code = 'DEEP_CLEAN' THEN re.event_date END)), 9999),
          'lastAcMaintenanceDate', IFNULL(DATE_FORMAT(MAX(CASE WHEN ret.code = 'AC_MAINTENANCE' THEN re.event_date END), '%d/%m/%Y'), ''),
          'daysSinceAcMaintenance', IFNULL(DATEDIFF(CURDATE(), MAX(CASE WHEN ret.code = 'AC_MAINTENANCE' THEN re.event_date END)), 9999),
          'occupiedNightsLast30Days',
            COUNT(DISTINCT CASE WHEN rn.stay_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN rn.id END)
            +
            (
              SELECT COUNT(DISTINCT rack.report_date)
              FROM rack_snapshots rack
              JOIN rack_snapshot_rooms rack_room ON rack_room.rack_snapshot_id = rack.id
              WHERE rack_room.room_id = room.id
                AND rack.report_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                AND rack_room.room_status IN ('OC', 'OS', 'OL', 'OR', 'OSE', 'ND')
                AND NOT EXISTS (
                  SELECT 1
                  FROM reservation_room_nights rn2
                  JOIN reservations r2 ON r2.id = rn2.reservation_id
                  WHERE rn2.room_id = room.id
                    AND rn2.stay_date = rack.report_date
                    AND rn2.occupancy_status = 'ocupada'
                    AND r2.status != 'cancelada'
                )
            )
        )
        FROM rooms room
        LEFT JOIN room_types rt ON rt.id = room.room_type_id
        LEFT JOIN room_events re ON re.room_id = room.id
        LEFT JOIN room_event_types ret ON ret.id = re.event_type_id
        LEFT JOIN reservation_room_nights rn ON rn.room_id = room.id
        GROUP BY room.id, room.room_number, rt.name
        ORDER BY (
          COUNT(DISTINCT CASE WHEN rn.stay_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN rn.id END)
          +
          (
            SELECT COUNT(DISTINCT rack.report_date)
            FROM rack_snapshots rack
            JOIN rack_snapshot_rooms rack_room ON rack_room.rack_snapshot_id = rack.id
            WHERE rack_room.room_id = room.id
              AND rack.report_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
              AND rack_room.room_status IN ('OC', 'OS', 'OL', 'OR', 'OSE', 'ND')
              AND NOT EXISTS (
                SELECT 1
                FROM reservation_room_nights rn2
                JOIN reservations r2 ON r2.id = rn2.reservation_id
                WHERE rn2.room_id = room.id
                  AND rn2.stay_date = rack.report_date
                  AND rn2.occupancy_status = 'ocupada'
                  AND r2.status != 'cancelada'
              )
          )
        ) DESC,
        IFNULL(DATEDIFF(CURDATE(), MAX(CASE WHEN ret.code = 'DEEP_CLEAN' THEN re.event_date END)), 9999) DESC,
        room.room_number;
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
  const roomRotationDates =
    new Set();

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

          const rotationKey =
            `${reservation.roomNumber}:${displayDate}`;

          if (!roomRotationDates.has(rotationKey)) {
            row.occupiedNights += 1;
            row.lastOccupiedDate =
              displayDate;
            roomRotationDates.add(rotationKey);
          }
          roomRotation.set(
            reservation.roomNumber,
            row
          );
        }
      });
    });

  const latestRackStatus =
    readLatestRackStatus();
  const rackRooms =
    latestRackStatus?.rooms || [];
  const latestRackDisplayDate =
    latestRackStatus?.reportDate || "";
  const latestRackIsoDate =
    displayDateToIso(latestRackDisplayDate);

  if (
    latestRackIsoDate
    &&
    latestRackIsoDate >= range.startIso
    &&
    latestRackIsoDate <= range.endIso
  ) {
    (latestRackStatus?.rooms || [])
      .filter(room =>
        ["OC", "OS", "OL", "OR", "OSE", "ND"].includes(room.status)
      )
      .forEach(room => {
        const rotationKey =
          `${room.room}:${latestRackDisplayDate}`;

        if (roomRotationDates.has(rotationKey)) {
          return;
        }

        const row =
          roomRotation.get(room.room)
          ||
          {
            roomNumber:
              room.room,
            roomType:
              room.type || "",
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
          latestRackDisplayDate;
        roomRotationDates.add(rotationKey);
        roomRotation.set(
          room.room,
          row
        );
      });
  }
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=Literata:wght@600;700&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="/public/dashboard.css?v=${DASHBOARD_ASSET_VERSION}" rel="stylesheet">
</head>
<body>
  <header class="mobile-topbar">
    <div class="brand-mark">VM</div>
    <div>
      <h1>Villa Margaritas</h1>
      <div class="muted">Heritage Boutique Hotel</div>
    </div>
  </header>
  <main>
    <nav class="view-tabs">
      <div class="sidebar-brand">
        <div class="brand-mark">VM</div>
        <div>
          <strong>Villa Margaritas</strong>
          <span>Heritage Boutique Hotel</span>
        </div>
      </div>
      <button class="nav-new-reservation" onclick="showView('reservations')"><span class="material-symbols-outlined">add</span><span>Nueva Reserva</span></button>
      <button id="tab-today" onclick="showView('today')"><span class="material-symbols-outlined">today</span><span>Hoy</span></button>
      <button id="tab-main" class="active" onclick="showView('main')"><span class="material-symbols-outlined">dashboard</span><span>Principal</span></button>
      <button id="tab-calendar" onclick="showView('calendar')"><span class="material-symbols-outlined">calendar_month</span><span>Calendario</span></button>
      <button id="tab-preassign" onclick="showView('preassign')"><span class="material-symbols-outlined">assignment_ind</span><span>Preasignar</span></button>
      <button id="tab-reservations" onclick="showView('reservations')"><span class="material-symbols-outlined">book_online</span><span>Reservas</span></button>
      <button id="tab-quotes" onclick="showView('quotes')"><span class="material-symbols-outlined">request_quote</span><span>Cotizaciones</span></button>
      <button id="tab-events" onclick="showView('events')"><span class="material-symbols-outlined">event</span><span>Eventos</span></button>
      <button id="tab-rack" onclick="showView('rack')"><span class="material-symbols-outlined">grid_view</span><span>Rack</span></button>
      <button id="tab-reports" onclick="showView('reports')"><span class="material-symbols-outlined">analytics</span><span>Reportes</span></button>
    </nav>

    <section class="page-hero">
      <div>
        <div class="eyebrow">Dashboard operativo</div>
        <h2 id="pageTitle">Vista Principal</h2>
        <p id="pageSubtitle">Resumen de operaciones y estado actual del hotel.</p>
      </div>
      <div class="hero-actions">
        <button onclick="openGlobalSearch()" data-global-search-trigger><span class="material-symbols-outlined">search</span><span>Buscar</span></button>
        <button class="primary" onclick="loadDashboard()" data-dashboard-refresh><span class="material-symbols-outlined">refresh</span><span>Actualizar</span></button>
      </div>
    </section>

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
          <button class="primary" onclick="loadDashboard()" data-dashboard-refresh>Actualizar</button>
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
        <button class="primary" onclick="loadDashboard()" data-dashboard-refresh>Actualizar</button>
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

    <div id="view-preassign" class="view-panel hidden">
    <section class="panel">
      <div class="toolbar">
        <div>
          <strong>Preasignacion de habitaciones</strong><button class="help-button" onclick="openHelp('preassign')" title="Ayuda">?</button>
          <div class="muted">Prepara llegadas, continuaciones y huespedes sin reservacion antes de recibirlos.</div>
        </div>
      </div>
      <div class="preassign-toolbar">
        <label>
          Fecha
          <input id="preassignDate" type="date" onchange="renderPreassignmentBoard()">
        </label>
        <div id="preassignStatus" class="muted"></div>
        <button onclick="autoPreassignRooms()">Autoasignar</button>
        <button class="primary" onclick="printPreassignment()">Imprimir / PDF</button>
      </div>
      <div id="preassignKpis" class="preassign-kpis"></div>
      <div class="preassign-layout">
        <div>
          <div id="preassignRoomGrid" class="preassign-grid"></div>
        </div>
        <aside class="preassign-side-card">
          <strong>Conflictos / revisar</strong>
          <div class="muted">Reservas o habitaciones que necesitan atencion antes de imprimir.</div>
          <div id="preassignConflictList" class="preassign-side-list"></div>
          <hr>
          <strong>Pendientes del dia</strong>
          <div class="muted">Reservas sin habitacion preasignada y continuaciones detectadas.</div>
          <div id="preassignPendingList" class="preassign-side-list"></div>
          <hr>
          <strong>Asignadas del dia</strong>
          <div class="muted">Solo muestra preasignaciones guardadas para la fecha seleccionada.</div>
          <div id="preassignAssignedList" class="preassign-side-list"></div>
          <hr>
          <strong>Autoasignadas del dia</strong>
          <div class="muted">Habitaciones guardadas por Autoasignar en esa fecha.</div>
          <div id="preassignAutoAssignedList" class="preassign-side-list"></div>
        </aside>
      </div>
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
          <input id="manualFecha" type="date" onchange="renderManualCheckoutPreview()">
        </label>
        <label>
          Noches
          <input id="manualNoches" type="number" min="1" step="1" value="1" oninput="renderManualCheckoutPreview()">
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
      <div id="manualSalidaPreview" class="muted" style="margin-top:8px"></div>
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
  <div id="helpModalBackdrop" class="app-modal-backdrop hidden" onclick="closeHelp()">
    <div class="app-modal confirm-app-modal" role="dialog" aria-modal="true" aria-labelledby="helpModalTitle" onclick="event.stopPropagation()">
      <div class="app-modal-head">
        <div>
          <strong id="helpModalTitle">Ayuda</strong>
          <div class="muted">Guia rapida de uso</div>
        </div>
        <button onclick="closeHelp()">Cerrar</button>
      </div>
      <div id="helpModalBody" class="app-modal-body help-content"></div>
    </div>
  </div>
  <div id="searchDetailModalBackdrop" class="app-modal-backdrop hidden" onclick="closeSearchDetailModal()">
    <div class="app-modal confirm-app-modal" role="dialog" aria-modal="true" aria-labelledby="searchDetailTitle" onclick="event.stopPropagation()">
      <div class="app-modal-head">
        <div>
          <strong id="searchDetailTitle">Detalle</strong>
          <div id="searchDetailSubtitle" class="muted"></div>
        </div>
        <button onclick="closeSearchDetailModal()">Cerrar</button>
      </div>
      <div id="searchDetailBody" class="app-modal-body"></div>
    </div>
  </div>
  <div id="dayModalBackdrop" class="app-modal-backdrop hidden" onclick="closeDayModal()">
    <div class="app-modal" role="dialog" aria-modal="true" aria-labelledby="dayModalTitle" onclick="event.stopPropagation()">
      <div class="app-modal-head">
        <div>
          <strong id="dayModalTitle">Reservas del dia</strong>
          <div id="dayModalSubtitle" class="muted"></div>
        </div>
        <button onclick="closeDayModal()">Cerrar</button>
      </div>
      <div id="dayModalBody" class="app-modal-body"></div>
    </div>
  </div>
  <div id="reservationEditBackdrop" class="app-modal-backdrop hidden" onclick="closeReservationEdit()">
    <div class="app-modal reservation-edit-app-modal" role="dialog" aria-modal="true" aria-labelledby="reservationEditTitle" onclick="event.stopPropagation()">
      <div class="app-modal-head">
        <div>
          <strong id="reservationEditTitle">Editar reserva</strong>
          <div id="reservationEditSubtitle" class="muted"></div>
        </div>
        <button onclick="closeReservationEdit()">Cerrar</button>
      </div>
      <div class="app-modal-body">
        <div class="reservation-edit-grid">
          <label class="wide">Cliente<input id="editReservationName" autocomplete="off"></label>
          <label>Telefono<input id="editReservationPhone" inputmode="tel"></label>
          <label>Entrada<input id="editReservationStart" type="date"></label>
          <label>Noches<input id="editReservationNights" type="number" min="1" step="1"></label>
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
  <div id="reservationArrivalBackdrop" class="app-modal-backdrop hidden" onclick="closeReservationArrival()">
    <div class="app-modal confirm-app-modal" role="dialog" aria-modal="true" aria-labelledby="reservationArrivalTitle" onclick="event.stopPropagation()">
      <div class="app-modal-head">
        <div>
          <strong id="reservationArrivalTitle">Registrar llegada</strong>
          <div id="reservationArrivalSubtitle" class="muted"></div>
        </div>
        <button onclick="closeReservationArrival()">Cerrar</button>
      </div>
      <div class="app-modal-body">
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
  <div id="preassignModalBackdrop" class="app-modal-backdrop hidden" onclick="closePreassignModal()">
    <div class="app-modal reservation-edit-app-modal" role="dialog" aria-modal="true" aria-labelledby="preassignModalTitle" onclick="event.stopPropagation()">
      <div class="app-modal-head">
        <div>
          <strong id="preassignModalTitle">Preasignar habitacion</strong>
          <div id="preassignModalSubtitle" class="muted"></div>
        </div>
        <button onclick="closePreassignModal()">Cerrar</button>
      </div>
      <div class="app-modal-body">
        <div id="preassignModalBody" class="preassign-app-modal-grid"></div>
      </div>
    </div>
  </div>
  <div id="groupSendConfirmBackdrop" class="app-modal-backdrop hidden" onclick="closeGroupSendConfirm()">
    <div class="app-modal confirm-app-modal" role="dialog" aria-modal="true" aria-labelledby="groupSendConfirmTitle" onclick="event.stopPropagation()">
      <div class="app-modal-head">
        <div>
          <strong id="groupSendConfirmTitle">Enviar reserva al grupo</strong>
          <div id="groupSendConfirmText" class="muted"></div>
        </div>
      </div>
      <div class="app-modal-body">
        <div class="confirm-actions">
          <button onclick="closeGroupSendConfirm()">No</button>
          <button class="primary" onclick="sendPendingReservationsToGroup()">Si, enviar al grupo</button>
        </div>
      </div>
    </div>
  </div>
  <div id="confirmDeleteBackdrop" class="app-modal-backdrop hidden" onclick="closeDeleteConfirm()">
    <div class="app-modal confirm-app-modal" role="dialog" aria-modal="true" aria-labelledby="confirmDeleteTitle" onclick="event.stopPropagation()">
      <div class="app-modal-head">
        <div>
          <strong id="confirmDeleteTitle">Eliminar reserva</strong>
          <div class="muted">Esta accion libera el inventario del calendario.</div>
        </div>
      </div>
      <div class="app-modal-body">
        <div id="confirmDeleteText"></div>
        <div class="confirm-actions">
          <button onclick="closeDeleteConfirm()">Cancelar</button>
          <button class="danger" onclick="deleteSelectedReservation()">Eliminar</button>
        </div>
      </div>
    </div>
  </div>
  <div id="confirmRackBackdrop" class="app-modal-backdrop hidden" onclick="closeRackConfirm()">
    <div class="app-modal confirm-app-modal" role="dialog" aria-modal="true" aria-labelledby="confirmRackTitle" onclick="event.stopPropagation()">
      <div class="app-modal-head">
        <div>
          <strong id="confirmRackTitle">Marcar habitacion ocupada</strong>
          <div class="muted">Actualiza el ultimo rack guardado.</div>
        </div>
      </div>
      <div class="app-modal-body">
        <div id="confirmRackText"></div>
        <div class="confirm-actions">
          <button onclick="closeRackConfirm()">Cancelar</button>
          <button class="primary" onclick="confirmRackRoomOccupied()">Marcar ocupada</button>
        </div>
      </div>
    </div>
  </div>
  <div id="quoteMenuModalBackdrop" class="app-modal-backdrop hidden" onclick="closeQuoteMenuModal()">
    <div class="app-modal quote-catalog-app-modal" role="dialog" aria-modal="true" aria-labelledby="quoteMenuModalTitle" onclick="event.stopPropagation()">
      <div class="app-modal-head">
        <div>
          <strong id="quoteMenuModalTitle">Catalogo de platillos</strong>
          <div class="muted">Edita precios y descripciones para el menu rapido de cotizaciones.</div>
        </div>
        <button onclick="closeQuoteMenuModal()">Cerrar</button>
      </div>
      <div class="app-modal-body">
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
  <div id="quoteEventModalBackdrop" class="app-modal-backdrop hidden" onclick="closeQuoteEventModal()">
    <div class="app-modal reservation-edit-app-modal" role="dialog" aria-modal="true" aria-labelledby="quoteEventModalTitle" onclick="event.stopPropagation()">
      <div class="app-modal-head">
        <div>
          <strong id="quoteEventModalTitle">Apartar salon desde cotizacion</strong>
          <div id="quoteEventModalSubtitle" class="muted"></div>
        </div>
        <button onclick="closeQuoteEventModal()">Cerrar</button>
      </div>
      <div class="app-modal-body">
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
  <div id="eventDetailModalBackdrop" class="app-modal-backdrop hidden" onclick="closeEventDetailModal()">
    <div class="app-modal reservation-edit-app-modal" role="dialog" aria-modal="true" aria-labelledby="eventDetailTitle" onclick="event.stopPropagation()">
      <div class="app-modal-head">
        <div>
          <strong id="eventDetailTitle">Evento</strong>
          <div id="eventDetailSubtitle" class="muted"></div>
        </div>
        <button onclick="closeEventDetailModal()">Cerrar</button>
      </div>
      <div id="eventDetailBody" class="app-modal-body"></div>
    </div>
  </div>
  <script>
    window.DASHBOARD_BOOTSTRAP = {
      hotelRateOptions: ${JSON.stringify(HOTEL_RATE_OPTIONS)}
    };
  </script>
  ${dashboardScriptTags()}
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
      url.pathname.startsWith("/public/")
    ) {
      const filePath =
        publicFilePath(
          decodeURIComponent(url.pathname)
        );

      if (!filePath) {
        sendJson(res, 404, {
          ok: false,
          error: "Archivo no encontrado"
        });
        return;
      }

      res.writeHead(200, {
        "Content-Type": staticContentType(filePath),
        "Cache-Control": "public, max-age=300"
      });
      fs.createReadStream(filePath).pipe(res);
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
      (
        req.method === "GET"
        ||
        req.method === "POST"
      )
      &&
      url.pathname === "/api/room-blocks"
    ) {
      const handled =
        await handleRoomBlockRoute(req, res, url, {
          readBody,
          readRoomBlocks,
          saveRoomBlock,
          sendJson
        });

      if (handled) {
        return;
      }
    }

    if (
      req.method === "POST"
      &&
      url.pathname.startsWith("/api/room-preassignments")
    ) {
      const handled =
        await handleRoomPreassignmentRoute(req, res, url, {
          deleteRoomPreassignment,
          readBody,
          saveRoomPreassignment,
          sendJson
        });

      if (handled) {
        return;
      }
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
