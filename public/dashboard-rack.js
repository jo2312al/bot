// Dashboard frontend module: rack
function formatMoney(value) {
  return Number(value || 0).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN'
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
      renderRackPie(counts) +
      renderRackKpi('Ocupadas', counts.occupied) +
      renderRackKpi('Bloqueadas', counts.blocked) +
      renderRackKpi('VL limpias', counts.availableClean) +
      renderRackKpi('VS sucias', counts.availableDirty) +
    '</div>';
}

function renderRackPie(counts) {
  const total = Number(counts?.total || 0);
  const occupied = Number(counts?.occupied?.total || 0);
  const blocked = Number(counts?.blocked?.total || 0);
  const available = Number(counts?.availableClean?.total || 0) + Number(counts?.availableDirty?.total || 0);
  const occupiedDegrees = total ? Math.round((occupied / total) * 360) : 0;
  const availableDegrees = total ? Math.round((available / total) * 360) : 0;

  return '<div class="rack-pie-card">' +
    '<div class="rack-pie" style="--occupied:' + occupiedDegrees + 'deg; --available:' + availableDegrees + 'deg">' +
      '<span>' + escapeHtml(total || 0) + '</span>' +
    '</div>' +
    '<div>' +
      '<strong>Distribucion</strong>' +
      '<div class="rack-pie-legend">' +
        '<div><span><i class="rack-pie-occupied"></i>OC ocupadas</span><strong>' + occupied + '</strong></div>' +
        '<div><span><i class="rack-pie-available"></i>Vacias</span><strong>' + available + '</strong></div>' +
        '<div><span><i class="rack-pie-blocked"></i>Bloqueadas</span><strong>' + blocked + '</strong></div>' +
      '</div>' +
    '</div>' +
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
    rackFloorMap.innerHTML = '';
    rackRoomGrid.innerHTML =
      '<div class="muted" style="margin-top:12px">Importa un CSV del rack para ver habitaciones con botones.</div>';
    return;
  }

  renderRackFloorMap(status.rooms);
  const availableCounts = getAvailableRoomColorCounts(status.rooms);
  rackRoomGrid.innerHTML =
    '<div class="rack-type-legend">' +
      '<span class="king">Vacias King: ' + availableCounts.king + '</span>' +
      '<span class="double">Vacias Dobles: ' + availableCounts.double + '</span>' +
      '<span class="suite">Vacias Suites: ' + availableCounts.suite + '</span>' +
    '</div>' +
    '<div class="rack-room-grid">' +
    status.rooms.map(room => {
      const category = getRackRoomCategory(room.status);
      const typeClass = getRackRoomTypeClass(room, category);
      return '<button class="rack-room ' + category + ' ' + typeClass + '" onclick="openRackRoom(\'' + escapeHtml(room.room) + '\')">' +
        '<strong>' + escapeHtml(room.room) + '</strong>' +
        '<span>' + escapeHtml(room.type || '-') + '</span>' +
        '<span>' + escapeHtml(room.status || '-') + '</span>' +
        (room.guestName ? '<span class="rack-room-guest" title="Huesped: ' + escapeHtml(room.guestName) + '">' + escapeHtml(room.guestName) + '</span>' : '') +
      '</button>';
    }).join('') +
    '</div>';
}

function openRackRoom(room) {
  const rackRoom = dashboardData?.rackStatus?.rooms?.find(item => item.room === room);
  if (rackRoom && getRackRoomCategory(rackRoom.status) === 'occupied') {
    openRackGuestDetails(room);
    return;
  }
  setRackRoomOccupied(room);
}

let activeRackGuestRoom = '';

async function openRackGuestDetails(room) {
  ensureRackGuestModal();
  activeRackGuestRoom = room;
  document.getElementById('rackGuestModalTitle').textContent = 'Habitación ' + room;
  document.getElementById('rackGuestModalSubtitle').textContent = 'Cargando información del check-in...';
  document.getElementById('rackGuestSummary').innerHTML = '';
  document.getElementById('rackGuestModalBackdrop').classList.remove('hidden');
  document.body.classList.add('app-modal-open');

  const response = await fetch('/api/checkins/room?room=' + encodeURIComponent(room));
  const data = await response.json();
  if (!data.ok || !data.checkin) {
    document.getElementById('rackGuestModalSubtitle').textContent = data.error || 'Habitación ocupada sin check-in histórico.';
    document.getElementById('rackGuestSummary').innerHTML = data.rackGuestName
      ? '<div class="rack-guest-kpis"><div><span>Huésped en rack</span><strong>' + escapeHtml(data.rackGuestName) + '</strong></div></div><div class="muted">Este registro es anterior a la nueva tabla de check-ins; puedes hacer check-out, pero no agregar movimientos hasta vincularlo a una reserva.</div>'
      : '<div class="muted">Registra el check-in para asociar huésped y movimientos.</div>';
    return;
  }

  renderRackGuestDetails(data.checkin);
}

function renderRackGuestDetails(checkin) {
  const balance = Number(checkin.balance || 0);
  const movements = Array.isArray(checkin.movements) ? checkin.movements : [];
  document.getElementById('rackGuestModalSubtitle').textContent = 'Check-in desde ' + formatRackMovementDate(checkin.checkedInAt);
  document.getElementById('rackGuestSummary').innerHTML =
    '<div class="rack-guest-kpis"><div><span>Huésped</span><strong>' + escapeHtml(checkin.guestName || '-') + '</strong></div><div><span>Saldo</span><strong>' + formatMoney(balance) + '</strong></div></div>' +
    '<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Cargo</th><th>Pago</th></tr></thead><tbody>' +
    (movements.length ? movements.map(item => '<tr><td>' + escapeHtml(formatRackMovementDate(item.occurredAt)) + '</td><td>' + escapeHtml(item.concept || '-') + '</td><td>' + formatMoney(item.charge) + '</td><td>' + formatMoney(item.payment) + '</td></tr>').join('') : '<tr><td colspan="4" class="muted">Sin movimientos.</td></tr>') +
    '</tbody></table></div>';
}

function ensureRackGuestModal() {
  if (document.getElementById('rackGuestModalBackdrop')) return;

  document.body.insertAdjacentHTML('beforeend',
    '<div id="rackGuestModalBackdrop" class="app-modal-backdrop hidden" onclick="closeRackGuestModal()">' +
      '<div class="app-modal reservation-edit-app-modal" role="dialog" aria-modal="true" onclick="event.stopPropagation()">' +
        '<div class="app-modal-head"><div><strong id="rackGuestModalTitle">Habitación ocupada</strong><div id="rackGuestModalSubtitle" class="muted"></div></div><button onclick="closeRackGuestModal()">Cerrar</button></div>' +
        '<div class="app-modal-body"><div id="rackGuestSummary" class="rack-guest-summary"></div>' +
          '<div class="rack-movement-form"><strong>Agregar movimiento</strong><div class="reservation-edit-grid">' +
            '<label>Concepto<input id="rackMovementConcept" placeholder="Hospedaje, consumo, abono..."></label>' +
            '<label>Forma de pago<select id="rackMovementMethod"><option value="">Sin especificar</option><option>Efectivo</option><option>Tarjeta de crédito</option><option>Tarjeta de débito</option><option>Transferencia</option></select></label>' +
            '<label>Referencia<input id="rackMovementReference" placeholder="Folio o autorización"></label>' +
            '<label>Cargo<input id="rackMovementCharge" type="number" min="0" step="0.01" value="0"></label>' +
            '<label>Pago<input id="rackMovementPayment" type="number" min="0" step="0.01" value="0"></label>' +
          '</div><div class="confirm-actions"><button class="primary" onclick="saveRackMovement()">Guardar movimiento</button></div></div>' +
          '<div class="confirm-actions rack-guest-actions"><button class="danger" onclick="checkoutRackGuest()">Hacer check-out (pasar a VS)</button></div>' +
        '</div></div></div>'
  );
}

function formatRackMovementDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(value));
}

function closeRackGuestModal() {
  const backdrop = document.getElementById('rackGuestModalBackdrop');
  if (backdrop) backdrop.classList.add('hidden');
  activeRackGuestRoom = '';
  document.body.classList.remove('app-modal-open');
}

async function saveRackMovement() {
  const response = await fetch('/api/checkins/movement', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room: activeRackGuestRoom, concept: document.getElementById('rackMovementConcept').value.trim(), paymentMethod: document.getElementById('rackMovementMethod').value, reference: document.getElementById('rackMovementReference').value.trim(), charge: document.getElementById('rackMovementCharge').value, payment: document.getElementById('rackMovementPayment').value })
  });
  const data = await response.json();
  if (!data.ok) return alert(data.error || 'No se pudo guardar el movimiento.');
  document.getElementById('rackMovementConcept').value = ''; document.getElementById('rackMovementReference').value = ''; document.getElementById('rackMovementCharge').value = '0'; document.getElementById('rackMovementPayment').value = '0';
  renderRackGuestDetails(data.checkin);
}

async function checkoutRackGuest() {
  if (!activeRackGuestRoom || !confirm('¿Confirmas el check-out? La habitación pasará a VS.')) return;
  const response = await fetch('/api/checkins/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: activeRackGuestRoom }) });
  const data = await response.json();
  if (!data.ok) return alert(data.error || 'No se pudo hacer el check-out.');
  closeRackGuestModal();
  await loadDashboard();
  showView('rack');
}

function printRack() {
  const status =
    dashboardData?.rackStatus;
  const rooms =
    Array.isArray(status?.rooms)
      ? status.rooms.slice().sort((left, right) =>
        String(left.room || '').localeCompare(String(right.room || ''))
      )
      : [];

  if (!rooms.length) {
    alert('No hay rack cargado para imprimir.');
    return;
  }

  const printedAt = getRackPrintMexicoDateTime();

  const title =
    'Rack ' + (status?.reportDate || '') + ' ' + (status?.reportTime || '');
  const rows =
    rooms.map(room =>
      '<div class="rack-print-room">' +
        '<span class="room-number">' + escapeHtml(room.room || '') + '</span>' +
        '<span class="room-status">' + escapeHtml(room.status || '-') + '</span>' +
        '<strong>' + escapeHtml(getRackPrintTypeLabel(room.type)) + '</strong>' +
        '<span class="room-blank">( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</span>' +
      '</div>'
    ).join('');
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(title) + '</title>' +
    '<style>@page{size:letter landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#000;margin:22px 34px;font-size:15px}.actions{text-align:right;margin-bottom:8px}.rack-print-head{position:relative;text-align:center;margin-bottom:14px}.rack-print-head h1{font-size:15px;letter-spacing:.5px;margin:0;text-transform:uppercase}.rack-print-head div{font-size:15px}.rack-print-date{position:absolute;right:0;top:0;text-align:right;font-weight:700;line-height:1.35}.rack-print-date span{display:block;font-size:14px;font-weight:400}.rack-print-grid{display:grid;grid-template-columns:repeat(5,1fr);column-gap:34px;row-gap:22px}.rack-print-room{white-space:nowrap;display:flex;gap:9px;align-items:baseline}.room-number{min-width:34px;text-align:right}.room-status{display:inline-block;min-width:34px;text-align:center;border-bottom:2px solid #000;line-height:1}.room-blank{margin-left:auto}.rack-print-legend{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:26px;font-size:15px;line-height:1.55}.rack-print-legend div{break-inside:avoid}.summary{display:none}@media print{.actions{display:none}body{margin:0}}</style>' +
    '</head><body><div class="actions"><button onclick="window.print()">Imprimir / guardar PDF</button></div>' +
    '<div class="rack-print-head"><h1>Hotel Villa Margaritas</h1><div>Reporte ama de llaves todo el hotel</div><div class="rack-print-date"><span>' + escapeHtml(printedAt.date) + '</span>Hora: ' + escapeHtml(printedAt.time) + '<br><small>Tiempo de Mexico</small></div></div>' +
    '<div class="rack-print-grid">' + rows + '</div>' +
    renderRackPrintLegend() +
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

function getRackPrintMexicoDateTime() {
  const now = new Date();
  const zone = 'America/Mexico_City';

  return {
    date: new Intl.DateTimeFormat('es-MX', {
      timeZone: zone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(now),
    time: new Intl.DateTimeFormat('es-MX', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now)
  };
}

function getRackPrintTypeLabel(type) {
  const normalized =
    String(type || '').toLowerCase();

  if (normalized.includes('king')) {
    return 'KING';
  }

  if (normalized.includes('suite')) {
    return 'SUIT';
  }

  return 'DOBL';
}

function renderRackPrintLegend() {
  return '<div class="rack-print-legend">' +
    '<div>BLO BLOQUEO<br>NM NO MOLESTAR<br>VS VACIO SUCIO<br>CH CAMBIO DE HABITACION<br>OS OCUPADA SUCIA</div>' +
    '<div>VL VACIO<br>ND NO DURMIO<br>A PRE-ASIGNADO-LIMPIO<br>FS FUERA DE SERVICIO<br>OR OCUPADO RECIENTE</div>' +
    '<div>OC OCUPADO<br>OSE OCUPADO SIN EQUIPAJE<br>AS ASIGNADO-SUCIO<br>OL OCUPADO LIMPIO</div>' +
  '</div>';
}

function renderRackFloorMap(rooms) {
  const byFloor = rooms.reduce((acc, room) => {
    const floor = String(room.room || '').slice(0, 1) || '-';
    if (!acc[floor]) {
      acc[floor] = [];
    }
    acc[floor].push(room);
    return acc;
  }, {});

  rackFloorMap.innerHTML =
    '<div class="floor-map">' +
      Object.keys(byFloor).sort().map(floor =>
        '<div class="floor-card">' +
          '<strong>Piso ' + escapeHtml(floor) + '</strong>' +
          '<div class="floor-rooms">' +
            byFloor[floor].sort((left, right) => String(left.room).localeCompare(String(right.room))).map(room => {
              const category = getRackRoomCategory(room.status);
              const className = category === 'available'
                ? (room.status === 'VS' ? 'dirty' : 'clean')
                : category;
              return '<button class="floor-room ' + className + '" onclick="openRackRoom(\'' + escapeHtml(room.room) + '\')">' +
                '<strong>' + escapeHtml(room.room || '-') + '</strong>' +
                '<span>' + escapeHtml(room.type || '-') + '</span>' +
                '<span>' + escapeHtml(room.status || '-') + '</span>' +
                (room.guestName ? '<span class="rack-room-guest" title="Huesped: ' + escapeHtml(room.guestName) + '">' + escapeHtml(room.guestName) + '</span>' : '') +
              '</button>';
            }).join('') +
          '</div>' +
        '</div>'
      ).join('') +
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

function getRackRoomTypeClass(room, category) {
  if (category !== 'available') return '';

  const type = String(room.type || '').toLowerCase();
  if (type.includes('suite')) return 'available-type-suite';
  if (type.includes('king')) return 'available-type-king';
  return 'available-type-double';
}

function getAvailableRoomColorCounts(rooms) {
  return rooms.reduce((counts, room) => {
    if (getRackRoomCategory(room.status) !== 'available') {
      return counts;
    }

    const type = String(room.type || '').toLowerCase();

    if (type.includes('suite')) {
      counts.suite++;
    } else if (type.includes('king')) {
      counts.king++;
    } else {
      counts.double++;
    }

    return counts;
  }, {
    king: 0,
    double: 0,
    suite: 0
  });
}
