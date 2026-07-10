// Dashboard frontend module: check-in
let selectedCheckinReservationKey = '';

function renderCheckinBoard() {
  if (typeof checkinReservationList === 'undefined') {
    return;
  }

  const reservations = getCheckinReservations();

  checkinReservationList.innerHTML = reservations.length
    ? reservations.map(renderCheckinReservationButton).join('')
    : '<div class="muted">Sin llegadas pendientes para check-in.</div>';

  if (
    selectedCheckinReservationKey
    &&
    !reservations.some(reservation => getCheckinReservationKey(reservation) === selectedCheckinReservationKey)
  ) {
    selectedCheckinReservationKey = '';
  }
}

function getCheckinReservations() {
  const todayDisplay = dashboardData
    ? isoToDisplay(dashboardData.today)
    : '';

  return (dashboardData?.groupReservations || [])
    .filter(reservation =>
      reservation.status !== 'cancelada'
      &&
      getCheckinArrivalDisplay(reservation) === todayDisplay
    )
    .sort((left, right) =>
      Number(Boolean(left.arrivalAt)) - Number(Boolean(right.arrivalAt))
      ||
      String(left.hora || '').localeCompare(String(right.hora || ''))
      ||
      String(left.nombre || '').localeCompare(String(right.nombre || ''))
    );
}

function renderCheckinReservationButton(reservation) {
  const key =
    getCheckinReservationKey(reservation);
  const selected =
    key === selectedCheckinReservationKey ? ' selected' : '';

  return '<button class="checkin-reservation-item' + selected + '" onclick="selectCheckinReservation(\'' + escapeJs(key) + '\')">' +
    '<strong>' + escapeHtml(reservation.nombre || 'Sin nombre') + '</strong>' +
    '<span>' + escapeHtml(reservation.tipo || '-') + ' / ' + escapeHtml(reservation.hora || '-') + '</span>' +
    '<span>Hab ' + escapeHtml(reservation.roomNumber || '-') + ' / ' + escapeHtml(reservation.arrivalAt ? 'Check-in hecho' : 'Pendiente') + '</span>' +
  '</button>';
}

function getCheckinReservationKey(reservation) {
  return reservation?.sourceKey || (reservation?.folio ? 'folio:' + reservation.folio : '');
}

function getCheckinArrivalDisplay(reservation) {
  const dates =
    Array.isArray(reservation?.dates)
      ? reservation.dates
      : [reservation?.fecha].filter(Boolean);
  const arrival =
    String(reservation?.fecha || dates[0] || '').trim();

  return isoToDisplay(arrival) || arrival;
}

function selectCheckinReservation(key) {
  const reservation =
    findCheckinReservation(key);

  if (!reservation) {
    alert('No se encontro la reserva para check-in.');
    return;
  }

  selectedCheckinReservationKey = key;
  fillCheckinForm(reservation);
  renderCheckinBoard();
}

function findCheckinReservation(key) {
  const normalized =
    String(key || '').trim();

  return (dashboardData?.groupReservations || [])
    .find(reservation =>
      getCheckinReservationKey(reservation) === normalized
      ||
      reservation.sourceKey === normalized
      ||
      (reservation.folio && normalized === 'folio:' + reservation.folio)
    );
}

function fillCheckinForm(reservation) {
  const dates =
    Array.isArray(reservation.dates) && reservation.dates.length
      ? reservation.dates
      : [reservation.fecha].filter(Boolean);
  const startIso =
    displayToIsoClient(dates[0] || reservation.fecha || '');
  const endIso =
    getCheckinCheckoutIso(reservation);

  checkinSelectedSummary.innerHTML =
    '<strong>' + escapeHtml(reservation.nombre || 'Reserva') + '</strong>' +
    '<div class="muted">' + escapeHtml((dates.join(' al ') || '-') + ' / ' + (reservation.telefono || 'sin telefono')) + '</div>';
  checkinGuestName.value =
    reservation.nombre || '';
  checkinRoom.value =
    reservation.roomNumber || '';
  checkinReservationCode.value =
    reservation.folio || reservation.sourceKey || '';
  checkinGuestNumber.value =
    '';
  checkinRoomType.value =
    getCheckinRoomTypeCode(reservation.tipo);
  checkinRoomsCount.value =
    reservation.habitaciones || 1;
  checkinPeopleCount.value =
    Number(reservation.adultos || 0) + Number(reservation.ninos || 0);
  checkinStart.value =
    startIso || '';
  checkinEnd.value =
    endIso || '';
  checkinTime.value =
    new Date().toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit'
    });
  checkinRate.value =
    getCheckinRateValue(reservation);
  checkinDeposit.value =
    '0.00';
  checkinPaymentMethod.value =
    'TARJETA DE CREDITO';
  checkinCompany.value =
    'SIN COMPANIA';
  checkinCity.value =
    'MEXICO';
  checkinAgency.value =
    '';
  checkinNotes.value =
    reservation.note || '';
  checkinStatus.textContent =
    reservation.arrivalAt ? 'Esta reserva ya tiene llegada registrada.' : 'Lista para registrar check-in.';
}

function getCheckinCheckoutIso(reservation) {
  const dates =
    Array.isArray(reservation?.dates)
      ? reservation.dates
      : [reservation?.fecha].filter(Boolean);
  const lastDisplay =
    dates[dates.length - 1] || reservation?.fecha || '';
  const lastIso =
    displayToIsoClient(lastDisplay);

  if (!lastIso) {
    return '';
  }

  const checkout =
    isoToDate(lastIso);
  checkout.setDate(checkout.getDate() + 1);
  return dateToIso(checkout);
}

function getCheckinRoomTypeCode(type) {
  const normalized =
    String(type || '').toLowerCase();

  if (normalized.includes('king')) {
    return 'KING';
  }

  return 'DOBL';
}

function getCheckinRateValue(reservation) {
  const text =
    String(reservation?.tarifa || '').trim();

  if (!text) {
    return '';
  }

  const numeric =
    Number(text.replace(/[^\d.]/g, ''));

  return numeric
    ? '$' + numeric.toFixed(2)
    : text;
}

function clearCheckinForm() {
  selectedCheckinReservationKey = '';
  [
    checkinGuestName,
    checkinRoom,
    checkinReservationCode,
    checkinGuestNumber,
    checkinRoomType,
    checkinStart,
    checkinEnd,
    checkinTime,
    checkinRate,
    checkinDeposit,
    checkinPaymentMethod,
    checkinCompany,
    checkinCity,
    checkinAgency,
    checkinNotes
  ].forEach(input => {
    input.value = '';
  });
  checkinRoomsCount.value = '1';
  checkinPeopleCount.value = '1';
  checkinSelectedSummary.textContent =
    'Selecciona una reserva para llenar el comprobante.';
  checkinStatus.textContent = '';
  renderCheckinBoard();
}

async function registerCheckin() {
  const reservation =
    findCheckinReservation(selectedCheckinReservationKey);

  if (!reservation?.sourceKey) {
    alert('Selecciona una reserva del listado para registrar check-in.');
    return;
  }

  const response = await fetch('/api/reservations/arrival', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sourceKey: reservation.sourceKey,
      room: checkinRoom.value
    })
  });
  const data = await response.json();

  if (!data.ok) {
    checkinStatus.textContent = data.error || 'No se pudo registrar el check-in.';
    return;
  }

  checkinStatus.textContent =
    'Check-in registrado. Ya puedes imprimir la comprobacion.';
  await loadDashboard();
  selectedCheckinReservationKey =
    getCheckinReservationKey(data.reservation || reservation);
  fillCheckinForm(data.reservation || reservation);
}

function printCheckinSlip() {
  const data =
    getCheckinPrintData();

  if (!data.guestName) {
    alert('Selecciona o escribe un huesped para imprimir.');
    return;
  }

  const html =
    '<!doctype html><html><head><meta charset="utf-8"><title>Check-in ' + escapeHtml(data.room || '') + '</title>' +
    '<style>@page{size:letter landscape;margin:8mm}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:13px}.actions{text-align:right;margin-bottom:8px}.slip{border:2px solid #1f2937;padding:8px}.slip-head{display:grid;grid-template-columns:1fr 2fr 1fr;border-bottom:2px solid #1f2937;align-items:center}.slip-head div{padding:5px}.hotel{text-align:center;font-family:Georgia,serif;font-weight:700;font-size:16px;text-decoration:underline}.doc-title{text-align:center;font-weight:800;font-size:18px}.mini-table{display:grid;grid-template-columns:1.2fr 1fr 1fr;border-bottom:2px solid #1f2937}.box{border-right:2px solid #1f2937;padding:7px;min-height:92px}.box:last-child{border-right:0}.line{display:grid;grid-template-columns:110px 1fr;gap:6px;margin:2px 0}.line b{font-weight:800}.underline{text-decoration:underline}.section-title{font-weight:800;text-align:center;border-bottom:1px solid #1f2937;margin:-2px -2px 6px;padding:2px}.charges{display:grid;grid-template-columns:1fr 1fr;border-bottom:2px solid #1f2937}.charges .box{min-height:160px}.charges-grid{display:grid;grid-template-columns:1fr 90px;gap:3px 10px}.notes{min-height:90px;padding:10px}.obs-title{text-align:center;font-weight:800}.footer{display:grid;grid-template-columns:1fr 1fr;border-top:2px solid #1f2937}.footer div{padding:6px}.footer div:first-child{border-right:2px solid #1f2937}@media print{.actions{display:none}}</style>' +
    '</head><body><div class="actions"><button onclick="window.print()">Imprimir / guardar PDF</button></div>' +
    '<div class="slip">' +
      '<div class="slip-head"><div>No. ' + escapeHtml(data.slipNumber || '') + '</div><div class="hotel">HOTEL VILLA MARGARITAS</div><div></div><div></div><div class="doc-title">Comprobacion de reservacion</div><div></div></div>' +
      '<div class="mini-table">' +
        '<div class="box"><div class="section-title">Reservacion:</div>' + renderCheckinPrintLine('Nombre:', data.guestName) + renderCheckinPrintLine('Direccion:', data.address) + renderCheckinPrintLine('Ciudad:', data.city) + renderCheckinPrintLine('Pais:', data.country) + renderCheckinPrintLine('Compania:', data.company, true) + '</div>' +
        '<div class="box"><div class="line"><b>Numero de habitacion:</b><span class="underline">' + escapeHtml(data.room || '') + '</span></div><div class="section-title">Datos Generales del Cliente</div></div>' +
        '<div class="box"><div class="line"><b>Num. Huesped</b><span>' + escapeHtml(data.guestNumber || '') + '</span></div><div class="section-title">Estadisticos</div><div class="line"><b>Agencia:</b><span>' + escapeHtml(data.agency || '') + '</span></div><div class="line"><b>Seq.Mer:</b><span>' + escapeHtml(data.seq || '1.4') + '</span></div></div>' +
      '</div>' +
      '<div class="mini-table">' +
        '<div class="box">' + renderCheckinPrintLine('Solicitud de Habitacion:', '') + renderCheckinPrintLine('Tipo de Habitacion:', data.roomType) + renderCheckinPrintLine('No. Habitaciones:', data.roomsCount) + renderCheckinPrintLine('No. Personas:', data.peopleCount) + '</div>' +
        '<div class="box">' + renderCheckinPrintLine('Entrada:', data.start) + renderCheckinPrintLine('Salida:', data.end) + renderCheckinPrintLine('Tarifa:', data.rate) + renderCheckinPrintLine('Deposito:', data.deposit) + renderCheckinPrintLine('Forma de Pago:', data.paymentMethod) + renderCheckinPrintLine('Plan de viaje:', data.travelPlan) + '</div>' +
        '<div class="box"><div class="section-title">Informativos</div>' + renderCheckinPrintLine('Fha. reserva', data.reservationDate) + renderCheckinPrintLine('Check In:', data.checkinUser) + renderCheckinPrintLine('Hora de entrada:', data.time) + '</div>' +
      '</div>' +
      '<div class="charges"><div class="box"><div class="charges-grid">' + renderChargeRows('Cargo Extra', data.extraCharges) + '</div></div><div class="box"><div class="section-title">Cargos extras</div><div class="charges-grid">' + renderChargeRows('Concepto', data.extraConcepts) + '</div></div></div>' +
      '<div class="notes"><div class="obs-title">Observaciones generales del registro.</div><br>' + escapeHtml(data.notes || '') + '</div>' +
      '<div class="footer"><div>1.- NS<br>2.- TARIF ' + escapeHtml(data.rate || '') + ' 4PAX</div><div></div></div>' +
    '</div>' +
    '</body></html>';
  const printWindow =
    window.open('', '_blank');

  if (!printWindow) {
    alert('Permite ventanas emergentes para imprimir.');
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}

function getCheckinPrintData() {
  return {
    slipNumber: '',
    guestName: checkinGuestName.value.trim(),
    address: '',
    city: checkinCity.value.trim(),
    country: 'MEXICO',
    company: checkinCompany.value.trim(),
    room: checkinRoom.value.trim(),
    guestNumber: checkinGuestNumber.value.trim(),
    agency: checkinAgency.value.trim(),
    seq: '1.4',
    roomType: checkinRoomType.value.trim(),
    roomsCount: checkinRoomsCount.value || '1',
    peopleCount: checkinPeopleCount.value || '1',
    start: isoToDisplay(checkinStart.value) || checkinStart.value,
    end: isoToDisplay(checkinEnd.value) || checkinEnd.value,
    rate: checkinRate.value.trim(),
    deposit: checkinDeposit.value.trim() || '0.00',
    paymentMethod: checkinPaymentMethod.value.trim(),
    travelPlan: '',
    reservationDate: new Date().toLocaleDateString('es-MX'),
    checkinUser: 'DASH',
    time: checkinTime.value.trim(),
    extraCharges: ['', '', '', '', ''],
    extraConcepts: ['', '', '', '', ''],
    notes: checkinNotes.value.trim()
  };
}

function renderCheckinPrintLine(label, value, underline) {
  return '<div class="line"><b>' + escapeHtml(label) + '</b><span' + (underline ? ' class="underline"' : '') + '>' + escapeHtml(value || '') + '</span></div>';
}

function renderChargeRows(label, values) {
  return [0, 1, 2, 3, 4].map(index =>
    '<span>' + escapeHtml(label + ' ' + (index + 1) + ':') + '</span><span>' + escapeHtml(values?.[index] || (index < 2 ? '0.00 M.N.' : '')) + '</span>'
  ).join('');
}
