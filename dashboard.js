const http = require("http");
const {
  URL
} = require("url");
const QRCode =
  require("qrcode");
const {
  readReservations,
  getRoomLimits,
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
  analyzeRackImage
} = require("./services/rackAnalysisService");
const {
  readBotStatus
} = require("./services/botStatusService");
const {
  TOTAL_ROOMS,
  readGroupReservations,
  buildGroupReservationCalendar
} = require("./services/groupReservationLogService");

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
            King: 0,
            Doble: 0,
            limits
          };
        }

        if (reservation.habitacion === "King") {
          occupancy[date].King +=
            reservation.habitaciones || 1;
        }

        if (reservation.habitacion === "Doble") {
          occupancy[date].Doble +=
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
      buildOccupancy(reservations),
    groupReservationCalendar,
    groupReservations,
    totalRooms:
      TOTAL_ROOMS,
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
    input {
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
      min-height: 74px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #ffffff;
      padding: 7px;
      display: grid;
      align-content: start;
      gap: 4px;
      text-align: left;
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
      .date-controls {
        grid-template-columns: 1fr;
      }
      .calendar-grid {
        gap: 4px;
      }
      .day {
        min-height: 58px;
        padding: 5px;
      }
      .weekday,
      .day-meta {
        font-size: 11px;
      }
      input,
      button {
        width: 100%;
        min-width: 0;
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
          <strong>Ocupacion por fecha</strong>
          <div id="updatedAt" class="muted"></div>
        </div>
        <button class="primary" onclick="loadDashboard()">Actualizar</button>
      </div>
      <div id="occupancy"></div>
    </section>

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

    <section class="panel">
      <div class="toolbar">
        <div>
          <strong>Lector de rack por foto</strong>
          <div class="muted">Sube una foto del rack. El dashboard usa Tesseract OCR local para leer habitaciones disponibles y suites.</div>
        </div>
      </div>
      <div class="rack-controls">
        <input id="rackImage" type="file" accept="image/*">
        <button id="analyzeRackButton" class="primary" onclick="analyzeRack()">Analizar rack</button>
      </div>
      <div style="margin-top:12px">
        <textarea id="rackResult" readonly placeholder="Aqui aparecera el resultado del rack."></textarea>
      </div>
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
  </main>
  <script>
    let dashboardData = null;
    let calendarDate = new Date();
    let selectedStart = "";
    let selectedEnd = "";

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
      limits.textContent = 'King ' + data.limits.King + ' / Doble ' + data.limits.Doble;
      updatedAt.textContent = 'Actualizado: ' + new Date(data.generatedAt).toLocaleString();

      occupancy.innerHTML = renderOccupancy(data.occupancy);
      reservations.innerHTML = renderReservations(data.reservations);
      updateSelectionSummary();
      renderCalendar();
      renderGroupReservationDetail(closeStart.value || data.today);
    }

    function renderOccupancy(rows) {
      if (!rows.length) {
        return '<div class="muted">Sin reservas activas registradas.</div>';
      }

      return '<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>King</th><th>Doble</th></tr></thead><tbody>' +
        rows.map(row => {
          const kingPct = Math.min((row.King / row.limits.King) * 100, 100);
          const doblePct = Math.min((row.Doble / row.limits.Doble) * 100, 100);
          return '<tr>' +
            '<td>' + row.date + '</td>' +
            '<td>' + row.King + ' / ' + row.limits.King + '<div class="bar"><span style="width:' + kingPct + '%"></span></div></td>' +
            '<td>' + row.Doble + ' / ' + row.limits.Doble + '<div class="bar"><span style="width:' + doblePct + '%"></span></div></td>' +
          '</tr>';
        }).join('') +
      '</tbody></table></div>';
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
        const row = occupancyByDate[display] || { King: 0, Doble: 0, limits: dashboardData.limits };
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
          : groupRow.occupied + '/' + groupRow.total + ' reservas<br>K ' + row.King + '/' + row.limits.King + ' / D ' + row.Doble + '/' + row.limits.Doble;

        cells.push(
          '<button class="' + className + '" onclick="selectCalendarDate(\\'' + iso + '\\')">' +
            '<span class="day-number">' + day + '</span>' +
            '<span class="day-meta">' + meta + '</span>' +
          '</button>'
        );
      }

      calendar.innerHTML = cells.join('');
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
      const row = dashboardData.groupReservationCalendar.find(item => item.date === display);

      if (!row || !row.reservations.length) {
        groupReservationDetail.innerHTML =
          '<div class="muted">Sin reservas detectadas para ' + display + '.</div>';
        return;
      }

      groupReservationDetail.innerHTML =
        '<strong>Reservas para ' + display + ': ' + row.occupied + '/' + row.total + '</strong>' +
        '<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Cliente</th><th>Fuente</th><th>Habs</th><th>Huespedes</th><th>Tipo</th><th>Hora</th><th>Telefono</th><th>Tarifa</th></tr></thead><tbody>' +
        row.reservations.map(item =>
          '<tr>' +
            '<td>' + escapeHtml(item.nombre || 'Sin nombre') + '<br><span class="muted">' + escapeHtml(item.timestamp || '') + '</span></td>' +
            '<td>' + escapeHtml(item.source || '-') + '</td>' +
            '<td>' + escapeHtml(item.habitaciones || 1) + '</td>' +
            '<td>' + escapeHtml((item.adultos || 0) + ' adulto(s), ' + (item.ninos || 0) + ' menor(es)') + '</td>' +
            '<td>' + escapeHtml(item.tipo || '-') + '</td>' +
            '<td>' + escapeHtml(item.hora || '-') + '</td>' +
            '<td>' + escapeHtml(item.telefono || '-') + '</td>' +
            '<td>' + escapeHtml(item.tarifa || '-') + '</td>' +
          '</tr>'
        ).join('') +
        '</tbody></table></div>';
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
