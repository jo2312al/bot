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

