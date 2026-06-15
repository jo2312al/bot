const http = require("http");
const {
  URL
} = require("url");
const QRCode =
  require("qrcode");
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
  readBotStatus
} = require("./services/botStatusService");
const {
  TOTAL_ROOMS,
  readGroupReservations,
  buildGroupReservationCalendar
} = require("./services/groupReservationLogService");
const {
  cancelCalendarReservationByKey,
  saveCalendarReservation
} = require("./services/reservationDatabaseService");

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
  const fecha =
    String(input.fecha || "").includes("-")
      ? isoToDisplayDate(input.fecha)
      : String(input.fecha || "").trim();

  const fechaSalida =
    input.fechaSalida
      ? (
        String(input.fechaSalida).includes("-")
          ? isoToDisplayDate(input.fechaSalida)
          : String(input.fechaSalida).trim()
      )
      : fecha;

  const dates =
    getDatesBetween(
      fecha,
      fechaSalida
    );

  if (!input.nombre || !fecha || !dates.length) {
    throw new Error("Nombre y fecha valida son requeridos");
  }

  const sourceKey =
    input.sourceKey
    ||
    `manual:${Date.now()}:${Math.random().toString(16).slice(2)}`;

  return {
    source:
      input.source || "manual",
    sourceKey,
    folio:
      input.folio || sourceKey.replace("manual:", "M-").slice(0, 18),
    timestamp:
      new Date().toISOString(),
    nombre:
      String(input.nombre || "").trim(),
    telefono:
      String(input.telefono || "").trim(),
    fecha:
      dates[0],
    dates,
    habitaciones:
      Math.max(Number(input.habitaciones || 1), 1),
    adultos:
      Math.max(Number(input.adultos || 0), 0),
    ninos:
      Math.max(Number(input.ninos || 0), 0),
    tipo:
      normalizeRoomType(
        String(input.tipo || input.habitacion || "").trim()
      ),
    tarifa:
      String(input.tarifa || "").trim(),
    hora:
      String(input.hora || "").trim(),
    raw:
      input.raw || "Captura manual",
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
                ? `excel:${data.folio}`
                : `excel:${data.nombre}:${data.fecha}:${data.telefono}`,
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
            raw:
              "Importado desde CSV"
          });

        saveCalendarReservation(reservation);
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
      "tarifa"
  };

  return aliases[key] || key;
}

function getSummary() {
  const reservations =
    readReservations();

  const groupReservations =
    readGroupReservations();

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

  return {
    generatedAt:
      new Date().toISOString(),
    limits:
      getRoomLimits(),
    today:
      getMexicoTodayIso(),
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
    occupancy:
      buildOccupancy(groupReservations),
    groupReservationCalendar,
    groupReservations,
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

async function getBotStatus() {
  const status =
    readBotStatus();

  const qrDataUrl =
    status.qr
      ? await QRCode.toDataURL(
        status.qr,
        {
          margin: 1,
          width: 320
        }
      )
      : null;

  return {
    ...status,
    qrDataUrl
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
      grid-template-columns: repeat(4, minmax(0, 1fr));
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
    .bot-status {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: center;
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
    input,
    select {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 9px 10px;
      min-width: 220px;
      max-width: 100%;
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
      grid-template-columns: 1.2fr repeat(4, minmax(0, 1fr));
      gap: 10px;
      align-items: stretch;
    }
    .rack-meta-card,
    .rack-kpi-card {
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
    .rack-room-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
      gap: 8px;
      margin-top: 12px;
    }
    .rack-room {
      border: 2px solid var(--line);
      border-radius: 8px;
      padding: 8px 6px;
      background: #ffffff;
      text-align: left;
      min-width: 0;
      box-shadow: 0 1px 0 rgba(15, 23, 42, .08);
    }
    .rack-room strong {
      display: block;
      font-size: 15px;
    }
    .rack-room span {
      display: block;
      color: inherit;
      font-size: 11px;
      margin-top: 2px;
      opacity: .82;
    }
    .rack-room.occupied {
      background: #dc2626;
      border-color: #991b1b;
      color: #ffffff;
    }
    .rack-room.available {
      background: #16a34a;
      border-color: #166534;
      color: #ffffff;
    }
    .rack-room.blocked {
      background: #475569;
      border-color: #1e293b;
      color: #ffffff;
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
    .confirm-modal {
      width: min(460px, 100%);
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
    body.modal-open {
      overflow: hidden;
    }
    @media (max-width: 800px) {
      .grid { grid-template-columns: 1fr; }
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
      <button id="tab-main" class="active" onclick="showView('main')">Principal</button>
      <button id="tab-calendar" onclick="showView('calendar')">Calendario</button>
      <button id="tab-reservations" onclick="showView('reservations')">Reservas</button>
      <button id="tab-rack" onclick="showView('rack')">Rack</button>
    </nav>

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
        <div class="muted">Reservas canceladas</div>
        <div id="canceledCount" class="metric">0</div>
      </div>
      <div class="panel">
        <div class="muted">Limites</div>
        <div id="limits" class="metric">-</div>
      </div>
    </section>

    <section class="panel">
      <div class="bot-status">
        <div>
          <strong>Estado de WhatsApp</strong>
          <div class="status-row">
            <span id="botStatusDot" class="status-dot"></span>
            <span id="botStatusText">Cargando...</span>
          </div>
          <div id="botStatusDetail" class="muted"></div>
          <div id="botStatusUpdated" class="muted"></div>
        </div>
        <div id="qrBox" class="qr-box hidden">
          <img id="qrImage" alt="QR de WhatsApp">
          <div class="muted">Escanea este codigo desde WhatsApp.</div>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="toolbar">
        <div>
          <strong>Rack global</strong>
          <div id="rackGlobalUpdated" class="muted">Sin rack CSV guardado.</div>
        </div>
      </div>
      <div id="rackDashboard"></div>
    </section>

    <section class="panel">
      <div class="toolbar">
        <div>
          <strong>Proximas reservas por fecha</strong>
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
          <strong>Calendario de reservas</strong>
          <div class="muted">Cada dia muestra reservas detectadas y guardadas sobre 69 habitaciones. Da clic en un dia para ver el desglose.</div>
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
          <strong>Agregar reservas</strong>
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
          <input id="manualHabitaciones" type="number" min="1" value="1">
        </label>
        <label>
          Adultos
          <input id="manualAdultos" type="number" min="0" value="2">
        </label>
        <label>
          Menores
          <input id="manualNinos" type="number" min="0" value="0">
        </label>
        <label>
          Tipo
          <select id="manualTipo">
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
          <input id="manualTarifa" placeholder="$700">
        </label>
        <button class="primary" onclick="saveManualReservation()">Guardar reserva</button>
      </div>
      <div class="rack-controls" style="margin-top:12px">
        <input id="csvFile" type="file" accept=".csv,text/csv">
        <button class="primary" onclick="importReservationsCsv()">Importar CSV</button>
        <button onclick="downloadTemplateCsv()">Plantilla CSV</button>
      </div>
      <div id="manualReservationStatus" class="muted" style="margin-top:10px"></div>
    </section>

    <section class="panel">
      <div class="toolbar">
        <div>
          <strong>Reservas registradas</strong>
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

    <div id="view-rack" class="view-panel hidden">
    <section class="panel">
      <div class="toolbar">
        <div>
          <strong>Lector de rack</strong>
          <div class="muted">Importa el CSV del sistema para leer ocupadas, disponibles y bloqueadas. La foto queda como respaldo.</div>
        </div>
      </div>
      <div class="rack-controls">
        <input id="rackCsv" type="file" accept=".csv,text/csv">
        <button id="analyzeRackCsvButton" class="primary" onclick="analyzeRackCsvFile()">Analizar CSV</button>
        <input id="rackImage" type="file" accept="image/*">
        <button id="analyzeRackButton" onclick="analyzeRack()">Analizar foto</button>
      </div>
      <div style="margin-top:12px">
        <textarea id="rackResult" readonly placeholder="Aqui aparecera el resultado del rack."></textarea>
      </div>
      <div id="rackRoomGrid"></div>
    </section>
    </div>
  </main>
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
  <script>
    let dashboardData = null;
    let calendarDate = new Date();
    let selectedStart = "";
    let selectedEnd = "";
    let pendingDeleteReservation = null;
    let pendingRackRoom = null;
    let activeModalIsoDate = "";

    async function loadBotStatus() {
      try {
        const response = await fetch('/api/bot-status');
        const status = await response.json();
        const connection = status.connection || 'unknown';
        const labels = {
          open: 'Conectado',
          qr: 'Esperando escaneo de QR',
          close: 'Desconectado',
          unknown: 'Sin estado'
        };

        botStatusDot.className = 'status-dot ' + connection;
        botStatusText.textContent = labels[connection] || connection;
        botStatusDetail.textContent = status.detail || '';
        botStatusUpdated.textContent = status.updatedAt
          ? 'Actualizado: ' + new Date(status.updatedAt).toLocaleString()
          : '';

        if (status.qrDataUrl) {
          qrImage.src = status.qrDataUrl;
          qrBox.classList.remove('hidden');
        } else {
          qrImage.removeAttribute('src');
          qrBox.classList.add('hidden');
        }
      } catch (error) {
        botStatusDot.className = 'status-dot close';
        botStatusText.textContent = 'No se pudo leer el estado';
        botStatusDetail.textContent = error.message || '';
        qrBox.classList.add('hidden');
      }
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
      canceledCount.textContent = data.totals.canceled;
      limits.textContent = Object.entries(data.limits)
        .map(([type, limit]) => type + ' ' + limit)
        .join(' / ');
      updatedAt.textContent = 'Actualizado: ' + new Date(data.generatedAt).toLocaleString();

      renderRackDashboard(data.rackStatus);
      renderRackRoomGrid(data.rackStatus);
      occupancy.innerHTML = renderOccupancy(data.occupancy);
      reservations.innerHTML = renderReservations(data.reservations);
      updateSelectionSummary();
      renderCalendar();
      renderGroupReservationDetail(closeStart.value || data.today);
    }

    function showView(name) {
      ['main', 'calendar', 'reservations', 'rack'].forEach(view => {
        const panel = document.getElementById('view-' + view);
        const tab = document.getElementById('tab-' + view);

        if (panel) {
          panel.classList.toggle('hidden', view !== name);
        }

        if (tab) {
          tab.classList.toggle('active', view === name);
        }
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
          renderRackKpi('Ocupadas', counts.occupied) +
          renderRackKpi('Bloqueadas', counts.blocked) +
          renderRackKpi('VL limpias', counts.availableClean) +
          renderRackKpi('VS sucias', counts.availableDirty) +
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
        rackRoomGrid.innerHTML =
          '<div class="muted" style="margin-top:12px">Importa un CSV del rack para ver habitaciones con botones.</div>';
        return;
      }

      rackRoomGrid.innerHTML =
        '<div class="rack-room-grid">' +
        status.rooms.map(room => {
          const category = getRackRoomCategory(room.status);
          return '<button class="rack-room ' + category + '" onclick="setRackRoomOccupied(\\'' + escapeHtml(room.room) + '\\')">' +
            '<strong>' + escapeHtml(room.room) + '</strong>' +
            '<span>' + escapeHtml(room.type || '-') + '</span>' +
            '<span>' + escapeHtml(room.status || '-') + '</span>' +
          '</button>';
        }).join('') +
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

      return '<div class="table-wrap"><table><thead><tr><th>Folio</th><th>Cliente</th><th>Habitacion</th><th>Fechas</th><th>Estado</th></tr></thead><tbody>' +
        rows.map(row => '<tr>' +
          '<td>#' + escapeHtml(row.folio || '') + '</td>' +
          '<td>' + escapeHtml(row.nombre || 'Sin nombre') + '<br><span class="muted">' + escapeHtml(row.telefono || '') + '</span></td>' +
          '<td>' + escapeHtml(row.habitacion || '') + '<br><span class="muted">' + escapeHtml(row.habitaciones || 1) + ' hab(s)</span>' + (row.servicioEspecial ? '<br><span class="muted">' + escapeHtml(row.servicioEspecial) + '</span>' : '') + '</td>' +
          '<td>' + escapeHtml((row.dates || [row.fecha]).join(', ')) + '<br><span class="muted">' + (row.noches || 1) + ' noche(s)</span></td>' +
          '<td><span class="pill ' + escapeHtml(row.status || '') + '">' + escapeHtml(row.status || 'activa') + '</span></td>' +
        '</tr>').join('') +
      '</tbody></table></div>';
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
        tarifa: manualTarifa.value.trim()
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
      manualTarifa.value = '';
      manualReservationStatus.textContent = 'Reserva guardada: #' + data.reservation.folio;
      await loadDashboard();
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
      manualReservationStatus.textContent =
        'Importadas: ' + data.imported + (data.errors.length ? ' / Errores: ' + data.errors.join(' | ') : '');
      await loadDashboard();
    }

    function downloadReservationsCsv() {
      window.location.href = '/api/reservations/export-csv';
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

    function getDayTotals(row) {
      return row.reservations.reduce((totals, item) => {
        totals.adultos += Number(item.adultos || 0);
        totals.ninos += Number(item.ninos || 0);
        if (item.source === 'manual' || item.source === 'excel') {
          totals.manual++;
        }
        if (item.source === 'grupo') {
          totals.grupo++;
        }
        if (item.source === 'bot') {
          totals.bot++;
        }
        return totals;
      }, {
        adultos: 0,
        ninos: 0,
        manual: 0,
        grupo: 0,
        bot: 0
      });
    }

    function openDayModal(isoDate) {
      if (!dashboardData) return;

      activeModalIsoDate = isoDate;
      const display = isoToDisplay(isoDate);
      const row = getCalendarRowForIso(isoDate) || {
        date: display,
        occupied: 0,
        total: dashboardData.totalRooms || 69,
        reservations: []
      };
      const totals = getDayTotals(row);

      dayModalTitle.textContent = 'Reservas para ' + display;
      dayModalSubtitle.textContent = row.occupied + '/' + row.total + ' habitaciones ocupadas en calendario';

      if (!row.reservations.length) {
        dayModalBody.innerHTML =
          '<div class="modal-kpis">' +
            '<div class="modal-kpi"><span class="muted">Reservas</span><strong>0</strong></div>' +
            '<div class="modal-kpi"><span class="muted">Habitaciones</span><strong>0/' + row.total + '</strong></div>' +
            '<div class="modal-kpi"><span class="muted">Adultos</span><strong>0</strong></div>' +
            '<div class="modal-kpi"><span class="muted">Menores</span><strong>0</strong></div>' +
          '</div>' +
          '<div class="muted">No hay reservas detectadas para este dia.</div>';
      } else {
        dayModalBody.innerHTML =
          '<div class="modal-kpis">' +
            '<div class="modal-kpi"><span class="muted">Reservas</span><strong>' + row.reservations.length + '</strong></div>' +
            '<div class="modal-kpi"><span class="muted">Habitaciones</span><strong>' + row.occupied + '/' + row.total + '</strong></div>' +
            '<div class="modal-kpi"><span class="muted">Adultos</span><strong>' + totals.adultos + '</strong></div>' +
            '<div class="modal-kpi"><span class="muted">Menores</span><strong>' + totals.ninos + '</strong></div>' +
          '</div>' +
          '<div class="summary-chips" style="margin-bottom:12px">' +
            '<span class="chip">Grupo ' + totals.grupo + '</span>' +
            '<span class="chip">Bot ' + totals.bot + '</span>' +
            '<span class="chip">Manual/Excel ' + totals.manual + '</span>' +
          '</div>' +
          '<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Fuente</th><th>Habs</th><th>Huespedes</th><th>Tipo</th><th>Hora</th><th>Telefono</th><th>Tarifa</th><th></th></tr></thead><tbody>' +
          row.reservations.map((item, index) =>
            '<tr>' +
              '<td>' + escapeHtml(item.nombre || 'Sin nombre') + '<br><span class="muted">' + escapeHtml(item.timestamp || '') + '</span></td>' +
              '<td><span class="pill">' + escapeHtml(item.source || '-') + '</span></td>' +
              '<td>' + escapeHtml(item.habitaciones || 1) + '</td>' +
              '<td>' + escapeHtml((item.adultos || 0) + ' adulto(s), ' + (item.ninos || 0) + ' menor(es)') + '</td>' +
              '<td>' + escapeHtml(item.tipo || '-') + '</td>' +
              '<td>' + escapeHtml(item.hora || '-') + '</td>' +
              '<td>' + escapeHtml(item.telefono || '-') + '</td>' +
              '<td>' + escapeHtml(item.tarifa || '-') + '</td>' +
              '<td><button class="danger compact" onclick="confirmDeleteReservation(' + index + ')">Eliminar</button></td>' +
            '</tr>'
          ).join('') +
          '</tbody></table></div>';
      }

      dayModalBackdrop.classList.remove('hidden');
      document.body.classList.add('modal-open');
    }

    function closeDayModal() {
      dayModalBackdrop.classList.add('hidden');
      confirmDeleteBackdrop.classList.add('hidden');
      pendingDeleteReservation = null;
      document.body.classList.remove('modal-open');
    }

    function confirmDeleteReservation(index) {
      const row = getCalendarRowForIso(activeModalIsoDate);
      const reservation = row?.reservations?.[index];

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

    loadBotStatus();
    loadDashboard();
    setInterval(loadBotStatus, 5000);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (!confirmRackBackdrop.classList.contains('hidden')) {
          closeRackConfirm();
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
      url.pathname === "/api/summary"
    ) {
      sendJson(res, 200, getSummary());
      return;
    }

    if (
      req.method === "GET"
      &&
      url.pathname === "/api/reservations/export-csv"
    ) {
      const summary =
        getSummary();

      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"reservas-calendario.csv\"",
        "Cache-Control": "no-store"
      });
      res.end(
        reservationsToCsv(summary.groupReservations)
      );
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
      url.pathname === "/api/reservations/manual"
    ) {
      try {
        const body =
          await readBody(req);

        const reservation =
          normalizeManualReservation(body);

        saveCalendarReservation(reservation);

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

server.listen(PORT, () => {
  console.log(`Dashboard disponible en http://localhost:${PORT}`);
});
