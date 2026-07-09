// Dashboard frontend module: calendar-reservations
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
      '<td><button class="compact" onclick="openReservationArrivalByKey(\'' + escapeJs(row.sourceKey || (row.folio ? 'folio:' + row.folio : '')) + '\')">' + (row.arrivalAt ? 'Ver llegada' : 'Registrar llegada') + '</button></td>' +
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
    '<button class="compact" onclick="saveReservationNote(\'' + escapeJs(key) + '\', this)">Guardar</button>' +
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

function calculateCheckoutDate(startIso, nightsValue) {
  const start = isoToDate(startIso);
  const nights = Math.max(Number.parseInt(nightsValue, 10) || 1, 1);

  if (Number.isNaN(start.getTime())) {
    return '';
  }

  start.setDate(start.getDate() + nights);
  return dateToDisplay(start);
}

function renderManualCheckoutPreview() {
  if (typeof manualSalidaPreview === 'undefined') {
    return;
  }

  const nights = Math.max(Number.parseInt(manualNoches.value, 10) || 1, 1);
  const checkout = calculateCheckoutDate(
    manualFecha.value,
    nights
  );

  manualSalidaPreview.textContent = checkout
    ? 'Salida calculada: ' + checkout + ' (' + nights + ' noche(s)).'
    : 'La fecha de salida se calcula automaticamente con entrada + noches.';
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
    noches: Number.parseInt(manualNoches.value, 10) || 1,
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
  manualNoches.value = '1';
  manualAdultos.value = '2';
  manualNinos.value = '0';
  manualHora.value = '';
  manualTarifa.value = '$700';
  manualRateLocked = false;
  manualNota.value = '';
  renderManualCheckoutPreview();
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
  document.body.classList.add('app-modal-open');
}

function closeGroupSendConfirm() {
  groupSendConfirmBackdrop.classList.add('hidden');
  pendingGroupReservations = [];
  document.body.classList.remove('app-modal-open');
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
    'nombre,telefono,fecha,noches,habitaciones,adultos,ninos,tipo,hora,tarifa\\n' +
    'Juan Perez,9931234567,25/12/2026,1,1,2,0,Doble,3 pm,$700\\n';
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
    const groupRow = groupByDate[display] || { occupied: 0, arrivals: 0, continuing: 0, total: dashboardData.totalRooms || 69 };
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
      : renderCalendarDayMeta(groupRow, row);

    cells.push(
      '<div class="' + className + '" onclick="selectCalendarDate(\'' + iso + '\')">' +
        '<span class="day-top">' +
          '<span class="day-number">' + day + '</span>' +
          '<button class="day-view ' + (groupRow.occupied ? 'has-reservations' : '') + '" onclick="openDayModal(' + escapeJsArg(iso) + '); event.stopPropagation();">Ver</button>' +
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

function renderCalendarDayMeta(groupRow, inventoryRow) {
  const occupied = Number(groupRow.occupied || 0);
  const total = Number(groupRow.total || dashboardData.totalRooms || 69);

  return occupied + '/' + total + ' ocupadas' +
    '<br>Entradas ' + Number(groupRow.arrivals || 0) +
    ' / Continuan ' + Number(groupRow.continuing || 0) +
    renderDayOccupancyPie(groupRow, true) +
    '<br>' + renderInventoryMini(inventoryRow);
}

function renderDayOccupancyPie(row, compact) {
  const total = Number(row.total || dashboardData?.totalRooms || 69);
  const arrivals = Number(row.arrivals ?? sumReservationRooms(row.reservations));
  const continuing = Number(row.continuing ?? sumReservationRooms(row.continuingReservations));
  const occupied = Number(row.occupied || arrivals + continuing);
  const arrivalDegrees = total ? Math.min((arrivals / total) * 360, 360) : 0;
  const continuingDegrees = total ? Math.min((continuing / total) * 360, 360 - arrivalDegrees) : 0;

  return '<div class="' + (compact ? 'day-breakdown' : 'app-modal-day-breakdown') + '">' +
    '<div class="day-pie" style="--arrivals:' + arrivalDegrees + 'deg;--continuing:' + continuingDegrees + 'deg"></div>' +
    '<div class="day-pie-legend">' +
      '<span><i class="day-pie-arrivals"></i>Entradas hoy: <strong>' + arrivals + '</strong></span>' +
      '<span><i class="day-pie-continuing"></i>Continuan: <strong>' + continuing + '</strong></span>' +
      (compact ? '' : '<span>Ocupadas total: <strong>' + occupied + '/' + total + '</strong></span>') +
    '</div>' +
  '</div>';
}

function sumReservationRooms(reservations) {
  return (reservations || []).reduce((total, reservation) =>
    total + Number(reservation.habitaciones || 1),
    0
  );
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

  if (!row || (!row.reservations.length && !Number(row.continuing || 0))) {
    groupReservationDetail.innerHTML =
      '<div class="day-summary-card">' +
        '<div><strong>' + display + '</strong><div class="muted">Sin entradas ni continuaciones detectadas para este dia.</div></div>' +
        '<button onclick="openDayModal(' + escapeJsArg(isoDate) + ')">Ver dia</button>' +
      '</div>';
    return;
  }

  const totals = getDayTotals(row);
  groupReservationDetail.innerHTML =
    '<div class="day-summary-card">' +
      '<div>' +
        '<strong>' + display + ': ' + row.occupied + '/' + row.total + ' habitaciones ocupadas</strong>' +
        '<div class="summary-chips">' +
          '<span class="chip">' + row.reservations.length + ' entrada(s)</span>' +
          '<span class="chip">' + Number(row.continuing || 0) + ' hab(s) continuan</span>' +
          '<span class="chip">' + totals.adultos + ' adulto(s)</span>' +
          '<span class="chip">' + totals.ninos + ' menor(es)</span>' +
          '<span class="chip">' + totals.manual + ' manual/excel</span>' +
        '</div>' +
      '</div>' +
      '<button class="primary" onclick="openDayModal(' + escapeJsArg(isoDate) + ')">Ver desglose</button>' +
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
  if (!isoDate) {
    return [];
  }

  return filterClientReservationsByArrivalDate(
    dashboardData?.groupReservations || [],
    isoToDisplay(isoDate)
  );
}

function filterClientReservationsByArrivalDate(reservations, displayDate) {
  if (!displayDate) {
    return [];
  }

  return (reservations || []).filter(reservation =>
    isSameDisplayDate(
      getReservationArrivalDisplayDate(reservation),
      displayDate
    )
  );
}

function getContinuingReservationsByDisplayDate(reservations, displayDate) {
  if (!displayDate) {
    return [];
  }

  return filterClientReservationsByDisplayDate(reservations, displayDate)
    .filter(reservation =>
      !isSameDisplayDate(
        getReservationArrivalDisplayDate(reservation),
        displayDate
      )
    );
}

function getReservationArrivalDisplayDate(reservation) {
  const dates = Array.isArray(reservation.dates)
    ? reservation.dates
    : [reservation.fecha].filter(Boolean);
  const arrival = String(reservation.fecha || dates[0] || '').trim();

  return isoToDisplay(arrival) || arrival;
}

function isSameDisplayDate(value, displayDate) {
  if (!value || !displayDate) {
    return false;
  }

  const isoDate = displayToIsoClient(displayDate);
  const text = String(value || '').trim();

  return text === displayDate ||
    text === isoDate ||
    displayToIsoClient(text) === isoDate ||
    isoToDisplay(text) === displayDate;
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

  const normalizedIsoDate =
    displayToIsoClient(isoDate)
    || displayToIsoClient(selectedStart)
    || dashboardData.today;
  const display = isoToDisplay(normalizedIsoDate);

  if (!display) {
    dayModalTitle.textContent = 'Entradas del dia';
    dayModalSubtitle.textContent = 'Selecciona una fecha valida en el calendario.';
    dayModalBody.innerHTML = '<div class="muted">No se pudo identificar la fecha del dia. Cierra este modal y vuelve a tocar Ver en el calendario.</div>';
    dayModalBackdrop.classList.remove('hidden');
    document.body.classList.add('app-modal-open');
    return;
  }

  activeModalIsoDate = normalizedIsoDate;
  const calendarRow = getCalendarRowForIso(normalizedIsoDate) || {
    date: display,
    occupied: 0,
    total: dashboardData.totalRooms || 69,
    reservations: []
  };
  const reservationsForDay =
    filterClientReservationsByArrivalDate(
      dashboardData.groupReservations || [],
      display
    );
  const continuingReservations =
    getContinuingReservationsByDisplayDate(
      dashboardData.groupReservations || [],
      display
    );
  const row = {
    ...calendarRow,
    reservations:
      reservationsForDay,
    continuingReservations,
    arrivals:
      sumReservationRooms(reservationsForDay),
    continuing:
      sumReservationRooms(continuingReservations),
    occupied:
      sumReservationRooms(reservationsForDay) + sumReservationRooms(continuingReservations),
    total:
      calendarRow.total || dashboardData.totalRooms || 69
  };
  const totals = getDayTotals(row);

  dayModalTitle.textContent = 'Entradas para ' + display;
  dayModalSubtitle.textContent = row.occupied + '/' + row.total + ' habitaciones ocupadas contando continuaciones';
  const dayDownloadButton =
    '<div class="toolbar" style="margin-bottom:12px"><button class="primary" onclick="downloadDayReservationsCsv(' + escapeJsArg(normalizedIsoDate) + ')">Descargar CSV del dia</button><div class="muted">Exporta solo las entradas de ' + escapeHtml(display) + '.</div></div>';

  if (!row.reservations.length) {
    dayModalBody.innerHTML =
      dayDownloadButton +
      renderDayOccupancyPie(row, false) +
      '<div class="app-modal-kpis">' +
        '<div class="app-modal-kpi"><span class="muted">Entradas</span><strong>0</strong></div>' +
        '<div class="app-modal-kpi"><span class="muted">Habitaciones ocupadas</span><strong>' + row.occupied + '/' + row.total + '</strong></div>' +
        '<div class="app-modal-kpi"><span class="muted">Adultos</span><strong>0</strong></div>' +
        '<div class="app-modal-kpi"><span class="muted">Menores</span><strong>0</strong></div>' +
      '</div>' +
      '<div class="muted">No hay entradas detectadas para este dia.' + (row.continuing ? ' Si hay habitaciones que continuan de dias anteriores.' : '') + '</div>';
  } else {
    dayModalBody.innerHTML =
      dayDownloadButton +
      renderDayOccupancyPie(row, false) +
      '<div class="app-modal-kpis">' +
        '<div class="app-modal-kpi"><span class="muted">Entradas</span><strong>' + row.reservations.length + '</strong></div>' +
        '<div class="app-modal-kpi"><span class="muted">Habitaciones ocupadas</span><strong>' + row.occupied + '/' + row.total + '</strong></div>' +
        '<div class="app-modal-kpi"><span class="muted">Adultos</span><strong>' + totals.adultos + '</strong></div>' +
        '<div class="app-modal-kpi"><span class="muted">Menores</span><strong>' + totals.ninos + '</strong></div>' +
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
  document.body.classList.add('app-modal-open');
}

function closeDayModal() {
  dayModalBackdrop.classList.add('hidden');
  reservationEditBackdrop.classList.add('hidden');
  reservationArrivalBackdrop.classList.add('hidden');
  confirmDeleteBackdrop.classList.add('hidden');
  pendingDeleteReservation = null;
  pendingEditReservation = null;
  pendingArrivalReservation = null;
  document.body.classList.remove('app-modal-open');
}

function displayToIso(value) {
  const parts = String(value || '').split('/').map(Number);

  if (parts.length !== 3 || parts.some(part => !part)) {
    return '';
  }

  return String(parts[2]).padStart(4, '0') + '-' + String(parts[1]).padStart(2, '0') + '-' + String(parts[0]).padStart(2, '0');
}

function getEditReservationDates(startValue, nightsValue) {
  const start = isoToDate(startValue);
  const nights = Math.max(Number.parseInt(nightsValue, 10) || 1, 1);

  if (Number.isNaN(start.getTime())) {
    return [];
  }

  const dates = [];
  const cursor = new Date(start);

  for (let index = 0; index < nights; index++) {
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
  editReservationNights.value = reservation.noches || dates.length || 1;
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
  document.body.classList.add('app-modal-open');
}

function closeReservationEdit() {
  reservationEditBackdrop.classList.add('hidden');
  pendingEditReservation = null;

  if (dayModalBackdrop.classList.contains('hidden')) {
    document.body.classList.remove('app-modal-open');
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
  document.body.classList.add('app-modal-open');
}

function closeReservationArrival() {
  reservationArrivalBackdrop.classList.add('hidden');
  pendingArrivalReservation = null;

  if (dayModalBackdrop.classList.contains('hidden')) {
    document.body.classList.remove('app-modal-open');
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
    editReservationNights.value
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
      noches: Number.parseInt(editReservationNights.value, 10) || dates.length || 1,
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
  document.body.classList.add('app-modal-open');
}

function closeDeleteConfirm() {
  confirmDeleteBackdrop.classList.add('hidden');
  pendingDeleteReservation = null;

  if (dayModalBackdrop.classList.contains('hidden')) {
    document.body.classList.remove('app-modal-open');
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

