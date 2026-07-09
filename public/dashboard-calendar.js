// Dashboard frontend module: calendar
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

