// Dashboard frontend module: reports
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
  if (typeof dailyCloseStatus !== 'undefined' && dailyCloseStatus) {
    const operational = dashboardData?.operationalDate || dashboardData?.today || '';
    const closedToday = (dashboardData?.dailyClosures || []).some(row => row.date === dashboardData?.today);
    dailyCloseStatus.textContent = operational
      ? 'Dia operativo: ' + (isoToDisplay(operational) || operational) + (closedToday ? ' / Hoy ya esta cerrado.' : '')
      : '';
  }
  reportKpis.innerHTML =
    renderReportKpi('Dias con ocupacion', daily.length, 'Fechas con movimiento', 'calendar_month') +
    renderReportKpi('Room nights mes', totalOccupied, 'Noches ocupadas acumuladas', 'bed') +
    renderReportKpi('Ocupacion promedio', avgOccupancy + '%', 'Promedio del mes', 'monitoring') +
    renderReportKpi('Cuartos por revisar', dueCount, 'Limpieza, clima o mantenimiento', 'construction');

  dailyOccupancyReport.innerHTML = renderDailyOccupancyTable(daily);
  roomRotationReport.innerHTML = renderRoomRotationTable(report.roomRotation || []);
  serviceDueReport.innerHTML = renderServiceDueTable(report.serviceDue || []);
  sourceReport.innerHTML = renderSourceReport(report.reservationsBySource || []);
  eventReport.innerHTML = renderEventReport(report.eventSummary || [], report.events || []);
  roomEventsReport.innerHTML = renderRoomEventsTable(report.roomEvents || []);
  renderRoomEventOptions(report);
  initCheckinSlipSearch();
}

function initCheckinSlipSearch() {
  const dateInput = document.getElementById('checkinSlipDate');
  const results = document.getElementById('checkinSlipSearchResults');

  if (!dateInput || !results) {
    return;
  }

  if (!dateInput.value) {
    const auditDateInput = document.getElementById('reportAuditDate');
    dateInput.value = auditDateInput?.value || dashboardData?.operationalDate || dashboardData?.today || dateToIso(new Date());
  }
}

async function searchCheckinSlips() {
  const dateInput = document.getElementById('checkinSlipDate');
  const queryInput = document.getElementById('checkinSlipQuery');
  const status = document.getElementById('checkinSlipSearchStatus');
  const results = document.getElementById('checkinSlipSearchResults');

  if (!dateInput || !queryInput || !status || !results) {
    return;
  }

  const date = dateInput.value || dashboardData?.operationalDate || dashboardData?.today || '';
  const query = queryInput.value.trim();
  status.textContent = 'Buscando check-ins...';
  results.innerHTML = '';

  const response = await fetch('/api/checkins/search?date=' + encodeURIComponent(date) + '&q=' + encodeURIComponent(query));
  const data = await response.json();

  if (!data.ok) {
    status.textContent = data.error || 'No se pudieron buscar check-ins.';
    return;
  }

  const rows = data.checkins || [];
  window.checkinSlipSearchRows = rows;
  status.textContent = rows.length
    ? rows.length + ' check-in(s) encontrados para ' + (isoToDisplay(date) || date) + '.'
    : 'Sin check-ins para esa busqueda.';
  results.innerHTML = renderCheckinSlipSearchResults(rows);
}

function renderCheckinSlipSearchResults(rows) {
  if (!rows.length) {
    return '<div class="muted">Busca por habitacion, nombre, folio o telefono.</div>';
  }

  return '<table class="report-table"><thead><tr><th>Hab</th><th>Huesped</th><th>Entrada</th><th>Salida</th><th>Tarifa</th><th>Estado</th><th></th></tr></thead><tbody>' +
    rows.map((row, index) =>
      '<tr>' +
        '<td><strong>' + escapeHtml(row.room || '-') + '</strong></td>' +
        '<td>' + escapeHtml(row.guestName || '-') + '<div class="muted">' + escapeHtml(row.folio ? ('Folio ' + row.folio) : '') + '</div></td>' +
        '<td>' + escapeHtml(formatReportCheckinDate(row.startDate || row.checkedInAt)) + '</td>' +
        '<td>' + escapeHtml(formatReportCheckinDate(row.endDate || row.checkedOutAt)) + '</td>' +
        '<td>' + escapeHtml(row.rate || '-') + '</td>' +
        '<td>' + escapeHtml(row.status || '-') + '</td>' +
        '<td><button onclick="printCheckinSlipFromReport(' + index + ')">Imprimir papeleta</button></td>' +
      '</tr>'
    ).join('') +
  '</tbody></table>';
}

function getCheckinSlipRowsFromReport() {
  return Array.isArray(window.checkinSlipSearchRows)
    ? window.checkinSlipSearchRows
    : [];
}

function printCheckinSlipFromReport(index) {
  const rows = getCheckinSlipRowsFromReport();
  const checkin = rows[index];

  if (!checkin) {
    alert('No se encontro el check-in seleccionado.');
    return;
  }

  if (typeof printCheckinSlip !== 'function') {
    alert('No esta cargado el formato de impresion de check-in.');
    return;
  }

  printCheckinSlip({
    slipNumber: checkin.folio || checkin.reservationId || checkin.id || '',
    guestName: checkin.guestName || '',
    address: '',
    city: '',
    country: 'MEXICO',
    company: '',
    room: checkin.room || '',
    guestNumber: checkin.folio || '',
    agency: '',
    seq: '1.4',
    roomType: checkin.roomType || '',
    roomsCount: checkin.roomsCount || '1',
    peopleCount: checkin.pax || '1',
    start: isoToDisplay(checkin.startDate || '') || formatReportCheckinDate(checkin.checkedInAt),
    end: isoToDisplay(checkin.endDate || '') || formatReportCheckinDate(checkin.checkedOutAt),
    rate: checkin.rate || '',
    deposit: '0.00',
    paymentMethod: checkin.paymentMethod || '',
    travelPlan: '',
    reservationDate: formatReportCheckinDate(checkin.checkedInAt),
    checkinUser: 'DASH',
    time: formatReportCheckinDate(checkin.checkedInAt),
    extraCharges: ['', '', '', '', ''],
    extraConcepts: ['', '', '', '', ''],
    notes: checkin.notes || ''
  });
}

function formatReportCheckinDate(value) {
  if (!value) return '';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return isoToDisplay(text) || text;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return text;
  }
  return date.toLocaleString('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City'
  });
}

function renderReportKpi(label, value, caption, icon) {
  return '<div class="report-kpi">' +
    '<div class="report-kpi-icon"><span class="material-symbols-outlined">' + escapeHtml(icon || 'analytics') + '</span></div>' +
    '<span class="muted">' + escapeHtml(label) + '</span>' +
    '<strong>' + escapeHtml(value) + '</strong>' +
    '<small>' + escapeHtml(caption || '') + '</small>' +
  '</div>';
}

function renderDailyOccupancyTable(rows) {
  if (!rows.length) {
    return '<div class="muted">Sin ocupacion para este mes.</div>';
  }

  const chart = '<div class="report-occupancy-chart">' +
    rows.map(row => {
      const percent = clampReportPercent(row.occupancyPercent || 0);
      const day = String(row.date || '').slice(-2);
      return '<div class="report-day-bar" title="' + escapeHtml(row.date || '') + ' - ' + percent + '%">' +
        '<div class="report-day-track"><span style="height:' + percent + '%"></span></div>' +
        '<strong>' + escapeHtml(day || '-') + '</strong>' +
      '</div>';
    }).join('') +
  '</div>';

  return chart + '<table class="report-table"><thead><tr><th>Fecha</th><th>Ocupadas</th><th>%</th></tr></thead><tbody>' +
    rows.map(row =>
      '<tr><td>' + escapeHtml(row.date) + '</td><td>' + escapeHtml(row.occupiedRooms || 0) + '</td><td>' + escapeHtml(row.occupancyPercent || 0) + '%</td></tr>'
    ).join('') +
  '</tbody></table>';
}

function renderRoomRotationTable(rows) {
  if (!rows.length) {
    return '<div class="muted">Sin habitaciones asignadas en este mes. El historico exacto se llena cuando se registra llegada con habitacion.</div>';
  }

  const maxNights = rows.reduce((max, row) => Math.max(max, Number(row.occupiedNights || 0)), 1);
  const visual = '<div class="report-ranking">' +
    rows.slice(0, 8).map(row => {
      const nights = Number(row.occupiedNights || 0);
      const percent = Math.round((nights / maxNights) * 100);
      return '<div class="report-rank-row">' +
        '<div><strong>' + escapeHtml(row.roomNumber || '-') + '</strong><span>' + escapeHtml(row.roomType || '-') + '</span></div>' +
        '<div class="report-progress"><span style="width:' + percent + '%"></span></div>' +
        '<b>' + escapeHtml(nights) + '</b>' +
      '</div>';
    }).join('') +
  '</div>';

  return visual + '<table class="report-table"><thead><tr><th>Hab</th><th>Tipo</th><th>Noches</th><th>Ultima ocupacion</th><th>Limpieza profunda</th><th>Clima</th><th>Mantenimiento</th></tr></thead><tbody>' +
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

  const cards = '<div class="report-service-cards">' +
    rows.slice(0, 6).map(row => {
      const deepDays = Number(row.daysSinceDeepClean || 0);
      const acDays = Number(row.daysSinceAcMaintenance || 0);
      const isUrgent = deepDays >= 30 || acDays >= 90;
      return '<div class="report-service-card ' + (isUrgent ? 'urgent' : '') + '">' +
        '<strong>Hab ' + escapeHtml(row.roomNumber || '-') + '</strong>' +
        '<span>' + escapeHtml(row.roomType || '-') + '</span>' +
        '<div><b>' + escapeHtml(row.occupiedNightsLast30Days || 0) + '</b><small> noches 30d</small></div>' +
        '<small>Limpieza: ' + escapeHtml(row.daysSinceDeepClean ?? '-') + ' dias</small>' +
        '<small>Clima: ' + escapeHtml(row.daysSinceAcMaintenance ?? '-') + ' dias</small>' +
      '</div>';
    }).join('') +
  '</div>';

  return cards + '<table class="report-table"><thead><tr><th>Hab</th><th>30 dias</th><th>Clima</th><th>Uso 30d</th></tr></thead><tbody>' +
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

  const maxReservations = rows.reduce((max, row) => Math.max(max, Number(row.reservationsCount || 0)), 1);
  const bars = '<div class="report-source-bars">' +
    rows.map(row => {
      const reservations = Number(row.reservationsCount || 0);
      const percent = Math.round((reservations / maxReservations) * 100);
      return '<div class="report-source-row">' +
        '<div><strong>' + escapeHtml(row.source || '-') + '</strong><span>' + escapeHtml(reservations) + ' reservas</span></div>' +
        '<div class="report-progress"><span style="width:' + percent + '%"></span></div>' +
      '</div>';
    }).join('') +
  '</div>';

  return bars + '<table class="report-table"><thead><tr><th>Fuente</th><th>Reservas</th><th>Habs</th><th>Huespedes</th></tr></thead><tbody>' +
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
  const eventTotals = summaryRows.reduce((totals, row) => ({
    events: totals.events + Number(row.eventsCount || 0),
    total: totals.total + Number(row.totalAmount || 0),
    paid: totals.paid + Number(row.paidAmount || 0),
    pending: totals.pending + Number(row.pendingAmount || 0)
  }), { events: 0, total: 0, paid: 0, pending: 0 });
  const visual = '<div class="report-event-summary">' +
    '<div><span>Eventos</span><strong>' + escapeHtml(eventTotals.events) + '</strong></div>' +
    '<div><span>Total</span><strong>' + formatMoney(eventTotals.total) + '</strong></div>' +
    '<div><span>Pagado</span><strong>' + formatMoney(eventTotals.paid) + '</strong></div>' +
    '<div><span>Pendiente</span><strong>' + formatMoney(eventTotals.pending) + '</strong></div>' +
  '</div>';
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

  return visual + summary + details;
}

function clampReportPercent(value) {
  const percent = Number(value || 0);
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, Math.round(percent)));
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

function getReportAuditIsoDate() {
  return reportAuditDate.value || dashboardData?.operationalDate || dashboardData?.today || new Date().toISOString().slice(0, 10);
}

async function loadDailyRoomRates() {
  const date = getReportAuditIsoDate();
  if (!confirm('Cargar tarifas de habitaciones ocupadas al saldo del dia ' + (isoToDisplay(date) || date) + '?')) {
    return;
  }

  dailyCloseStatus.textContent = 'Cargando tarifas...';
  const response = await fetch('/api/day-rate-charges', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date })
  });
  const data = await response.json();
  if (!data.ok) {
    dailyCloseStatus.textContent = data.error || 'No se pudieron cargar tarifas.';
    return;
  }

  const result = data.result || {};
  dailyCloseStatus.textContent =
    'Tarifas cargadas: ' + (result.applied?.length || 0) +
    ' / omitidas: ' + (result.skipped?.length || 0) +
    ' / total: ' + formatAuditMoney(result.total || 0);
  await loadReports();
}

async function closeDailyOperations() {
  const date = getReportAuditIsoDate();
  if (!confirm('Cerrar el dia operativo ' + (isoToDisplay(date) || date) + '? Despues la fecha operativa avanzara al siguiente dia.')) {
    return;
  }

  dailyCloseStatus.textContent = 'Cerrando dia...';
  const response = await fetch('/api/day-close', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date })
  });
  const data = await response.json();
  if (!data.ok) {
    dailyCloseStatus.textContent = data.error || 'No se pudo cerrar el dia.';
    return;
  }

  const result = data.result || {};
  dailyCloseStatus.textContent =
    'Dia cerrado: ' + (isoToDisplay(result.date) || result.date || date) +
    ' / siguiente dia: ' + (isoToDisplay(result.nextDate) || result.nextDate || '');
  await loadDashboard();
  if (result.date) {
    reportAuditDate.value = result.date;
  }
}

async function runOperationalPreclose() {
  const panel = document.getElementById('operationalPreclosePanel');
  if (!panel) return;
  panel.innerHTML = '<div class="muted">Revisando el dia operativo...</div>';
  const response = await fetch('/api/business-day/preclose', { method: 'POST' });
  const data = await response.json();
  if (!data.ok) {
    panel.innerHTML = '<div class="muted">' + escapeHtml(data.error || 'No se pudo ejecutar el pre-cierre.') + '</div>';
    return;
  }
  const result = data.preclose || {};
  const issues = Array.isArray(result.issues) ? result.issues : [];
  const summary = '<div class="report-kpis">' +
    renderReportKpi('Bloqueantes', result.counts?.blocking || 0, 'Deben corregirse antes de cerrar', 'error') +
    renderReportKpi('Advertencias', result.counts?.warning || 0, 'Requieren revision', 'warning') +
    renderReportKpi('Ocupadas', result.rooms?.occupiedRooms || 0, 'Habitaciones en estancia', 'bed') +
    renderReportKpi('Movimientos', result.ledger?.movements || 0, 'Cargos y pagos del dia', 'receipt_long') + '</div>';
  const table = issues.length ? '<table class="report-table"><thead><tr><th>Nivel</th><th>Problema</th><th>Hab.</th><th>Detalle</th><th>Importe</th></tr></thead><tbody>' + issues.map(item =>
    '<tr><td><strong>' + (item.severity === 'blocking' ? 'BLOQUEA' : 'AVISO') + '</strong></td><td>' + escapeHtml(item.title || item.code) + '</td><td>' + escapeHtml(item.room || '-') + '</td><td>' + escapeHtml(item.guestName || item.concept || '') + '</td><td>' + escapeHtml(item.balance ?? item.amount ?? '') + '</td></tr>'
  ).join('') + '</tbody></table>' : '<div class="muted">Sin excepciones: el dia esta listo para cierre.</div>';
  panel.innerHTML = summary + table;
}

async function printAuditReport(type) {
  const date = getReportAuditIsoDate();
  const response = await fetch('/api/reports/audit?date=' + encodeURIComponent(date));
  const data = await response.json();
  if (!data.ok) return alert(data.error || 'No se pudo generar el reporte.');

  const reports = data.reports || {};
  const rows = type === 'rents' ? reports.rents : (type === 'balances' ? reports.balances : reports.movements);
  const title = type === 'rents'
    ? 'Sábana de Rentas y Extras'
    : (type === 'balances' ? 'Lista de Huéspedes con Saldos Actuales' : 'Reporte de Cargos y Créditos por Concepto');
  const headers = type === 'rents'
    ? ['Hab.', 'Nombre', 'Fha. Ent.', 'Fha. Sal.', 'T. H.', 'Pax', 'Tarifa', 'Extras']
    : (type === 'balances'
      ? ['Hab.', 'Nombre', 'Fha. Ent.', 'Fha. Sal.', 'Noc.', 'T. H.', 'Pax', 'Tarifa', 'Saldo', 'Forma pago']
      : ['Hab.', 'Fecha', 'Hora', 'Referencia', 'Huésped', 'Concepto', 'Movimientos', 'Créditos', 'Forma pago']);
  const cells = row => type === 'rents'
    ? [row.room, row.guestName, row.startDate, row.endDate, row.roomType, row.pax, row.rate, formatAuditMoney(row.extras)]
    : (type === 'balances'
      ? [row.room, row.guestName, row.startDate, row.endDate, row.nights, row.roomType, row.pax, row.rate, formatAuditMoney(row.balance), row.paymentMethod]
      : [row.room, row.date, row.time, row.reference, row.guestName, row.concept, formatAuditMoney(row.charge), formatAuditMoney(row.payment), row.paymentMethod]);
  const totalCharge = rows.reduce((sum, row) => sum + Number(row.charge || row.extras || 0), 0);
  const totalPayment = rows.reduce((sum, row) => sum + Number(row.payment || 0), 0);
  const displayDate = isoToDisplay(date) || date;
  const bodyContent = type === 'movements'
    ? renderAuditMovementSections(rows, headers)
    : '<table><thead><tr>' + headers.map(header => '<th>' + escapeHtml(header) + '</th>').join('') + '</tr></thead><tbody>' +
      (rows.length ? rows.map(row => '<tr>' + cells(row).map((cell, index) => '<td class="' + (index >= 6 ? 'num' : '') + '">' + escapeHtml(cell === undefined || cell === null ? '' : cell) + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + headers.length + '">Sin datos disponibles para este día.</td></tr>') +
      '<tr class="total"><td colspan="' + Math.max(headers.length - 2, 1) + '">Totales (' + rows.length + ' registros)</td><td class="num">' + (type === 'rents' ? formatAuditMoney(totalCharge) : '') + '</td><td class="num"></td></tr>' +
      '</tbody></table>';
  const html =
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' + escapeHtml(title) + '</title>' +
    '<style>@page{size:letter landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#111;font-size:11px}.actions{text-align:right;margin-bottom:8px}.head{display:grid;grid-template-columns:1fr 2fr 1fr;align-items:start;border-bottom:2px solid #111;padding:4px 0 10px}.head h1{font-size:18px;margin:0;text-align:center}.head h2{font-size:15px;margin:4px 0 0;text-align:center}.head .right{text-align:right}.section-title{font-size:13px;margin:16px 0 0;border-bottom:1px solid #111;padding-bottom:3px;text-transform:uppercase}table{width:100%;border-collapse:collapse;margin-top:8px}th{font-family:Georgia,serif;font-weight:400;text-align:left;border-bottom:2px solid #111;padding:4px}td{border-bottom:1px solid #ddd;padding:3px 4px;vertical-align:top}.num{text-align:right}.total td{border-top:2px solid #111;font-weight:700}@media print{.actions{display:none}}</style>' +
    '</head><body><div class="actions"><button onclick="window.print()">Imprimir / guardar PDF</button></div>' +
    '<header class="head"><div><strong>Coach Guest</strong><br>Ver. 2013</div><div><h1>HOTEL VILLA MARGARITAS</h1><h2>' + escapeHtml(title) + ' del día ' + escapeHtml(displayDate) + '</h2></div><div class="right">Impreso: ' + escapeHtml(new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date())) + '<br>Hora: ' + escapeHtml(new Intl.DateTimeFormat('es-MX', { timeStyle: 'medium', timeZone: 'America/Mexico_City' }).format(new Date())) + '</div></header>' +
    bodyContent + '</body></html>';
  const printWindow = window.open('', '_blank');
  if (!printWindow) return alert('Permite ventanas emergentes para imprimir.');
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}

function renderAuditMovementSections(rows, headers) {
  const groups = groupAuditMovementsByMethod(rows);
  const chargeTotal = rows.reduce((sum, row) => sum + Number(row.charge || 0), 0);
  const creditTotal = rows.reduce((sum, row) => sum + Number(row.payment || 0), 0);
  return groups.map(group => renderAuditMovementTable(group.title, group.rows, headers)).join('') +
    '<table><tbody><tr class="total"><td>Total movimientos</td><td class="num">' + formatAuditMoney(chargeTotal) + '</td><td>Total creditos</td><td class="num">' + formatAuditMoney(creditTotal) + '</td><td>Saldo neto</td><td class="num">' + formatAuditMoney(chargeTotal - creditTotal) + '</td></tr></tbody></table>';
}

function groupAuditMovementsByMethod(rows) {
  const buckets = new Map();
  rows.forEach(row => {
    const title = getAuditMovementGroupTitle(row);
    if (!buckets.has(title)) buckets.set(title, []);
    buckets.get(title).push(row);
  });
  return Array.from(buckets.entries())
    .map(([title, groupRows]) => ({ title, rows: groupRows }))
    .sort((left, right) => getAuditMovementGroupRank(left.title) - getAuditMovementGroupRank(right.title) || left.title.localeCompare(right.title));
}

function getAuditMovementGroupTitle(row) {
  const method = String(row.paymentMethod || '').trim().toLowerCase();
  const concept = String(row.concept || '').trim().toLowerCase();

  if (method.includes('efect')) return 'Efectivo';
  if (method.includes('transfer')) return 'Transferencia';
  if (method.includes('traspas') || concept.includes('traspas')) return 'Traspaso';
  if (method.includes('debito') || method.includes('débito')) return 'Tarjeta de debito';
  if (method.includes('credito') || method.includes('crédito')) return 'Tarjeta de credito';
  if (method.includes('tarjeta')) return 'Tarjeta';
  return method ? method.toUpperCase() : 'Movimientos en general';
}

function getAuditMovementGroupRank(title) {
  const normalized = String(title || '').toLowerCase();
  if (normalized.includes('efect')) return 1;
  if (normalized.includes('tarjeta')) return 2;
  if (normalized.includes('transfer')) return 3;
  if (normalized.includes('traspas')) return 4;
  if (normalized.includes('general')) return 8;
  return 9;
}

function renderAuditMovementTable(title, rows, headers) {
  const chargeTotal = rows.reduce((sum, row) => sum + Number(row.charge || 0), 0);
  const paymentTotal = rows.reduce((sum, row) => sum + Number(row.payment || 0), 0);
  return '<h3 class="section-title">' + escapeHtml(title) + '</h3>' +
    '<table><thead><tr>' + headers.map(header => '<th>' + escapeHtml(header) + '</th>').join('') + '</tr></thead><tbody>' +
    (rows.length ? rows.map(row => '<tr>' +
      [row.room, row.date, row.time, row.reference, row.guestName, row.concept, formatAuditMoney(row.charge), formatAuditMoney(row.payment), row.paymentMethod]
        .map((cell, index) => '<td class="' + (index >= 6 ? 'num' : '') + '">' + escapeHtml(cell === undefined || cell === null ? '' : cell) + '</td>').join('') +
      '</tr>').join('') : '<tr><td colspan="' + headers.length + '">Sin movimientos.</td></tr>') +
    '<tr class="total"><td colspan="' + Math.max(headers.length - 2, 1) + '">Total ' + escapeHtml(title.toLowerCase()) + ' (' + rows.length + ' registros)</td><td class="num">' + formatAuditMoney(chargeTotal) + '</td><td class="num">' + formatAuditMoney(paymentTotal) + '</td></tr>' +
    '</tbody></table>';
}

function formatAuditMoney(value) {
  return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
