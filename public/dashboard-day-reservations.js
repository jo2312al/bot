// Dashboard frontend module: day-reservations
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
            '<div><button class="compact" onclick="openReservationArrival(' + index + ')">' + (item.arrivalAt ? 'Ver llegada' : 'Registrar llegada') + '</button> <button class="compact" onclick="openReservationEdit(' + index + ')">Editar</button> <button class="compact" onclick="resendReservationToGroupByKey(\'' + escapeJs(getReservationClientKey(item)) + '\')">Reenviar</button> <button class="danger compact" onclick="confirmDeleteReservation(' + index + ')">Eliminar</button></div>' +
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
  const reservation =
    findReservationByClientKey(sourceKey);

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
