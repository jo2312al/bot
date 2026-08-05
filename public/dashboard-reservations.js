// Dashboard frontend module: reservations
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
    rows.map(row => {
      const reservationKey =
        getReservationClientKey(row);

      return '<tr>' +
      '<td>#' + escapeHtml(row.folio || '') + '</td>' +
      '<td>' + escapeHtml(row.nombre || 'Sin nombre') + '<br><span class="muted">' + escapeHtml(row.telefono || '') + '</span></td>' +
      '<td>' + escapeHtml(row.habitacion || '') + '<br><span class="muted">' + escapeHtml(row.habitaciones || 1) + ' hab(s)</span>' + (row.servicioEspecial ? '<br><span class="muted">' + escapeHtml(row.servicioEspecial) + '</span>' : '') + '</td>' +
      '<td>' + escapeHtml((row.dates || [row.fecha]).join(', ')) + '<br><span class="muted">' + (row.noches || 1) + ' noche(s)</span></td>' +
      '<td>' + renderNoteEditor(row) + '</td>' +
      '<td><span class="pill ' + escapeHtml(row.status || '') + '">' + escapeHtml(row.status || 'activa') + '</span></td>' +
      '<td><div class="summary-chips">' +
        '<button class="compact" onclick="openReservationArrivalByKey(\'' + escapeJs(reservationKey) + '\')">' + (row.arrivalAt ? 'Ver llegada' : 'Registrar llegada') + '</button>' +
        '<button class="compact" onclick="resendReservationToGroupByKey(\'' + escapeJs(reservationKey) + '\')">Reenviar</button>' +
      '</div></td>' +
    '</tr>';
    }).join('') +
  '</tbody></table></div>';
}

function getReservationClientKey(reservation) {
  return reservation?.sourceKey || (reservation?.folio ? 'folio:' + reservation.folio : '');
}

function findReservationByClientKey(key) {
  const normalized =
    String(key || '').trim();

  if (!normalized) {
    return null;
  }

  return [
    ...(dashboardData?.groupReservations || []),
    ...(dashboardData?.reservations || [])
  ].find(reservation =>
    getReservationClientKey(reservation) === normalized
    ||
    reservation.sourceKey === normalized
    ||
    (reservation.folio && normalized === 'folio:' + reservation.folio)
  );
}

function resendReservationToGroupByKey(key) {
  const reservation =
    findReservationByClientKey(key);

  if (!reservation) {
    alert('No se encontro la reserva para reenviar.');
    return;
  }

  openGroupSendConfirm([reservation], 'reenviada');
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
    email: manualEmail.value.trim(),
    fecha: manualFecha.value,
    noches: Number.parseInt(manualNoches.value, 10) || 1,
    habitaciones: Number(manualHabitaciones.value || 1),
    adultos: Number(manualAdultos.value || 0),
    ninos: Number(manualNinos.value || 0),
    tipo: manualTipo.value,
    hora: manualHora.value.trim(),
    tarifa: manualTarifa.value.trim(),
    note: manualNota.value.trim(),
    reservationMessagesConsent: manualReservationMessagesConsent.checked,
    marketingConsent: manualMarketingConsent.checked
  };

  if (!payload.nombre || !payload.fecha) {
    alert('Nombre y fecha de entrada son requeridos.');
    return;
  }
  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    alert('Escribe un correo valido para enviar la confirmacion y el PDF.');
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
  manualEmail.value = '';
  manualHabitaciones.value = '1';
  manualNoches.value = '1';
  manualAdultos.value = '2';
  manualNinos.value = '0';
  manualHora.value = '';
  manualTarifa.value = '$700';
  manualRateLocked = false;
  manualNota.value = '';
  manualReservationMessagesConsent.checked = false;
  manualMarketingConsent.checked = false;
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
    ? 'Elige si la reserva ' + source + ' se envia al grupo, al cliente o a ambos.'
    : 'Elige los destinatarios para las ' + count + ' reservas ' + source + '.';
  sendReservationToGroup.checked = true;
  sendReservationToClient.checked = count === 1 && Boolean(pendingGroupReservations[0].telefono);
  sendReservationToClient.disabled = count !== 1 || !pendingGroupReservations[0]?.telefono;
  confirmReservationWhatsAppConsent.checked = Boolean(
    count === 1 && pendingGroupReservations[0].reservationMessagesConsent
  );
  confirmReservationWhatsAppConsent.disabled = sendReservationToClient.disabled;
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
    ? 'Reserva preparada. El bot la enviara al grupo en unos segundos.'
    : data.count + ' reservas preparadas. El bot las enviara al grupo en unos segundos.';
  closeGroupSendConfirm();
}

async function sendPendingReservationNotifications() {
  if (!pendingGroupReservations.length) return closeGroupSendConfirm();
  const tasks = [];
  if (sendReservationToGroup.checked) {
    tasks.push(fetch('/api/reservations/send-to-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reservations: pendingGroupReservations })
    }));
  }
  if (sendReservationToClient.checked) {
    if (!confirmReservationWhatsAppConsent.checked) {
      alert('Confirma que el huesped autorizo los mensajes de WhatsApp de la reserva.');
      return;
    }
    tasks.push(fetch('/api/reservations/send-to-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservation: pendingGroupReservations[0],
        reservationMessagesConsent: true,
        marketingConsent: pendingGroupReservations[0].marketingConsent === true
      })
    }));
  }
  if (!tasks.length) return closeGroupSendConfirm();
  const responses = await Promise.all(tasks);
  const results = await Promise.all(responses.map(response => response.json()));
  const failed = results.find(result => !result.ok);
  if (failed) {
    alert(failed.error || 'No se pudo preparar uno de los envios.');
    return;
  }
  manualReservationStatus.textContent = 'Envio preparado. El bot lo procesara en unos segundos.';
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
