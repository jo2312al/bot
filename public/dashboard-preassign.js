// Dashboard frontend module: preassign
function getPreassignAssignmentsForDate(isoDate) {
  return (dashboardData?.roomPreassignments || [])
    .filter(item => item.date === isoDate);
}

function getPreassignRoomAssignment(room, isoDate) {
  return getPreassignAssignmentsForDate(isoDate)
    .find(item => item.room === room);
}

function getPreassignCandidates(isoDate) {
  const display = isoToDisplay(isoDate);
  const arrivals = filterClientReservationsByArrivalDate(
    dashboardData?.groupReservations || [],
    display
  ).map(reservation => ({
    ...reservation,
    preassignKind: 'Llegada',
    preassignKey: reservation.sourceKey || ('arrival:' + (reservation.folio || reservation.nombre || Math.random()))
  }));
  const continuing = getContinuingReservationsByDisplayDate(
    dashboardData?.groupReservations || [],
    display
  ).map(reservation => ({
    ...reservation,
    preassignKind: 'Continua',
    preassignKey: reservation.sourceKey || ('continue:' + (reservation.folio || reservation.nombre || Math.random()))
  }));
  const seen = new Set();

  return arrivals.concat(continuing)
    .filter(reservation => {
      const key = reservation.preassignKey;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((left, right) =>
      String(left.hora || '').localeCompare(String(right.hora || ''))
    );
}

function getPreassignReservationIsoDates(reservation) {
  return (Array.isArray(reservation?.dates) ? reservation.dates : [reservation?.fecha].filter(Boolean))
    .map(date => {
      const text = String(date || '').trim();
      return text.includes('-')
        ? text.slice(0, 10)
        : displayToIsoClient(text);
    })
    .filter(Boolean)
    .sort();
}

function getPreassignReservationBySourceKey(sourceKey) {
  if (!sourceKey) {
    return null;
  }

  return (dashboardData?.groupReservations || [])
    .find(reservation => reservation.sourceKey === sourceKey);
}

function isPreassignContinuedAssignment(assignment, isoDate) {
  const reservation = getPreassignReservationBySourceKey(assignment?.sourceKey);
  const dates = getPreassignReservationIsoDates(reservation);

  return dates.length > 1 && isoDate > dates[0];
}

function getAssignedReservationKeys(isoDate) {
  return new Set(
    getPreassignAssignmentsForDate(isoDate)
      .filter(item => item.sourceKey)
      .map(item => item.sourceKey)
  );
}

function getPreassignPeople(reservation) {
  const rooms = Math.max(Number(reservation?.habitaciones || 1), 1);
  const total = Number(reservation?.adultos || 0) + Number(reservation?.ninos || 0);
  return Math.max(Math.ceil(total / rooms) || 1, 1);
}

function countPreassignmentsForSource(assignments, sourceKey) {
  if (!sourceKey) {
    return 0;
  }

  return (assignments || []).filter(assignment =>
    assignment.sourceKey === sourceKey
  ).length;
}

function getPreassignCapacity(room) {
  return getClientRoomCapacity(room?.type || '');
}

function getClientRoomCapacity(type) {
  const clean = String(type || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (clean.includes('doble') || clean.includes('suite') || clean.includes('matrimonial')) return 4;
  if (clean.includes('king')) return 2;
  return 4;
}

function renderPreassignmentBoard() {
  if (!dashboardData || typeof preassignRoomGrid === 'undefined') {
    return;
  }

  const isoDate = preassignDate.value;

  if (!isoDate) {
    preassignStatus.textContent = 'Selecciona una fecha para cargar preasignaciones.';
    preassignKpis.innerHTML =
      renderPreassignKpi('Preasignadas', '-') +
      renderPreassignKpi('Llegan / continuan', '-') +
      renderPreassignKpi('Pendientes', '-') +
      renderPreassignKpi('Habitaciones rack', '-') +
      renderPreassignKpi('Quedan por tipo', '-');
    preassignRoomGrid.innerHTML =
      '<div class="muted">El tablero se carga cuando seleccionas una fecha.</div>';
    preassignPendingList.innerHTML =
      '<div class="muted">Sin fecha seleccionada.</div>';
    preassignConflictList.innerHTML =
      '<div class="muted">Sin fecha seleccionada.</div>';
    preassignAssignedList.innerHTML =
      '<div class="muted">Sin fecha seleccionada.</div>';
    preassignAutoAssignedList.innerHTML =
      '<div class="muted">Sin fecha seleccionada.</div>';
    return;
  }

  const rooms = dashboardData.rackStatus?.rooms || [];
  const assignments = getPreassignAssignmentsForDate(isoDate);
  const candidates = getPreassignCandidates(isoDate);
  const assignedKeys = getAssignedReservationKeys(isoDate);
  const pending = candidates.filter(item => !assignedKeys.has(item.sourceKey));
  const conflicts = buildPreassignConflicts(isoDate);

  preassignStatus.textContent = 'Fecha: ' + escapeHtml(isoToDisplay(isoDate) || isoDate) +
    (dashboardData.rackStatus?.uploadedAt ? ' / Rack: ' + new Date(dashboardData.rackStatus.uploadedAt).toLocaleString() : ' / Sin rack cargado');
  preassignKpis.innerHTML =
    renderPreassignKpi('Preasignadas', assignments.length) +
    renderPreassignKpi('Llegan / continuan', candidates.length) +
    renderPreassignKpi('Pendientes', pending.length) +
    renderPreassignKpi('Habitaciones rack', rooms.length || '-') +
    renderPreassignKpi('Quedan por tipo', renderPreassignRemainingByType(rooms, assignments));

  if (!rooms.length) {
    preassignRoomGrid.innerHTML = '<div class="muted">Importa el CSV del rack para preasignar sobre habitaciones reales.</div>';
  } else {
    const rackRooms = rooms
      .slice()
      .sort((left, right) => String(left.room || '').localeCompare(String(right.room || '')))

    preassignRoomGrid.innerHTML = rackRooms.length
      ? rackRooms
        .map(room => renderPreassignRoomButton(room, isoDate))
        .join('')
      : '<div class="muted">No hay habitaciones en el rack para esta fecha.</div>';
  }

  renderPreassignConflictList(conflicts);
  renderPreassignPendingList(pending, isoDate);
  renderPreassignAssignedLists(assignments, isoDate);
}

function renderPreassignKpi(label, value) {
  return '<div class="preassign-kpi"><span class="muted">' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
}

function getPreassignTypeLabel(value) {
  const type = normalizeClientRoomType(value);

  if (type === 'Suite King') return 'Suite King';
  if (type === 'Doble Suite') return 'Doble Suite';
  if (type === 'King') return 'King';
  if (type === 'Doble') return 'Doble';

  return type || 'Sin tipo';
}

function renderPreassignRemainingByType(rooms, assignments) {
  const counts = {};

  (rooms || []).forEach(room => {
    const type = getPreassignTypeLabel(room.type);
    if (!counts[type]) {
      counts[type] = {
        total: 0,
        assigned: 0
      };
    }
    counts[type].total++;
  });

  (assignments || []).forEach(assignment => {
    const room = (rooms || []).find(item => item.room === assignment.room);
    const type = getPreassignTypeLabel(room?.type || assignment.roomType);
    if (!counts[type]) {
      counts[type] = {
        total: 0,
        assigned: 0
      };
    }
    counts[type].assigned++;
  });

  return Object.keys(counts)
    .sort((left, right) => left.localeCompare(right))
    .map(type => type + ' ' + Math.max(counts[type].total - counts[type].assigned, 0))
    .join(' / ') || '-';
}

function buildPreassignConflicts(isoDate) {
  const assignments = getPreassignAssignmentsForDate(isoDate);
  const rooms = dashboardData?.rackStatus?.rooms || [];
  const conflicts = [];
  const roomCounts = {};
  const autoPlan = buildAutoPreassignJobs(isoDate);

  autoPlan.conflicts.forEach(conflict => conflicts.push(conflict));

  assignments.forEach(assignment => {
    const room = rooms.find(item => item.room === assignment.room) || {
      room: assignment.room,
      type: assignment.roomType
    };
    const capacity = getPreassignCapacity(room);
    const people = Number(assignment.people || 0);

    roomCounts[assignment.room] = (roomCounts[assignment.room] || 0) + 1;

    if (people > capacity) {
      conflicts.push({
        title: 'Hab ' + assignment.room + ' excede capacidad',
        detail: (assignment.guestName || 'Sin nombre') + ' tiene ' + people + ' persona(s), capacidad ' + capacity + '.'
      });
    }

    if (normalizeSearchText(assignment.status) === 'revisar') {
      conflicts.push({
        title: 'Hab ' + assignment.room + ' marcada para revisar',
        detail: assignment.guestName || 'Sin nombre'
      });
    }
  });

  Object.keys(roomCounts)
    .filter(room => roomCounts[room] > 1)
    .forEach(room => {
      conflicts.push({
        title: 'Habitacion duplicada ' + room,
        detail: roomCounts[room] + ' preasignaciones guardadas en el mismo dia.'
      });
    });

  return conflicts;
}

function renderPreassignRoomButton(room, isoDate) {
  const category = getRackRoomCategory(room.status);
  const displayCategory = category === 'occupied' ? 'available' : category;
  const assignment = getPreassignRoomAssignment(room.room, isoDate);
  const continued = assignment && isPreassignContinuedAssignment(assignment, isoDate);
  const className = assignment
    ? (continued ? 'continued' : 'assigned')
    : (displayCategory === 'available' && room.status === 'VS' ? 'dirty' : displayCategory);
  const label = assignment
    ? ((continued ? 'Continua: ' : '') + assignment.guestName)
    : (displayCategory === 'available' ? 'Libre' : 'Bloqueada');

  return '<button class="preassign-room ' + className + '" onclick="openPreassignModal(\'' + escapeJs(room.room || '') + '\')">' +
    '<strong>' + escapeHtml(room.room || '-') + '</strong>' +
    '<span>' + escapeHtml(room.type || '-') + '</span>' +
    '<span>' + escapeHtml(room.status || '-') + ' / cap ' + getPreassignCapacity(room) + '</span>' +
    '<span class="guest">' + escapeHtml(label) + '</span>' +
  '</button>';
}

function preassignRackMatchesDate(isoDate) {
  const rackDate = dashboardData?.rackStatus?.reportDate || '';
  return Boolean(rackDate && isoToDisplay(isoDate) === rackDate);
}

function getPreassignRoomGroup(type) {
  const clean = normalizeSearchText(type);

  if (clean.includes('suite')) {
    return 'suite';
  }

  if (clean.includes('king')) {
    return 'king';
  }

  return 'double';
}

function getPreassignPreferredGroup(reservation) {
  const people = getPreassignPeople(reservation);
  const requestedGroup = getPreassignRoomGroup(reservation?.tipo || reservation?.habitacion || '');

  if (requestedGroup === 'suite' || people >= 4) {
    return 'suite';
  }

  if (people <= 2) {
    return 'king';
  }

  return 'double';
}

function getPreassignPreferenceText(reservation) {
  return normalizeSearchText([
    reservation?.note,
    reservation?.nota,
    reservation?.tipo,
    reservation?.habitacion,
    reservation?.nombre
  ].join(' '));
}

function scorePreassignRoomForReservation(room, reservation) {
  const text = getPreassignPreferenceText(reservation);
  const floor = Number(String(room?.room || '').slice(0, 1)) || 9;
  let score = 0;

  if (
    text.includes('planta baja')
    ||
    text.includes('piso bajo')
    ||
    text.includes('adulto mayor')
    ||
    text.includes('discapacidad')
    ||
    text.includes('silla')
    ||
    text.includes('elevador')
  ) {
    score += floor * 10;
  } else {
    score += floor;
  }

  if (text.includes('suite') && getPreassignRoomGroup(room?.type) === 'suite') {
    score -= 20;
  }

  if (text.includes('king') && getPreassignRoomGroup(room?.type) === 'king') {
    score -= 10;
  }

  return score;
}

function takePreassignRoom(pools, preferredGroup, reservation) {
  const fallbackByGroup = {
    suite: ['suite', 'double', 'king'],
    king: ['king', 'double', 'suite'],
    double: ['double', 'suite', 'king']
  };

  for (const group of fallbackByGroup[preferredGroup] || ['double', 'suite', 'king']) {
    if (pools[group]?.length) {
      pools[group].sort((left, right) =>
        scorePreassignRoomForReservation(left, reservation) - scorePreassignRoomForReservation(right, reservation)
        ||
        String(left.room || '').localeCompare(String(right.room || ''))
      );
      return pools[group].shift();
    }
  }

  return null;
}

function buildAutoPreassignJobs(isoDate) {
  const rooms = dashboardData?.rackStatus?.rooms || [];
  const assignments = getPreassignAssignmentsForDate(isoDate);
  const assignedRooms = new Set(assignments.map(assignment => assignment.room));
  const sameDayRack = preassignRackMatchesDate(isoDate);
  const candidates = getPreassignCandidates(isoDate);
  const jobs = [];
  const conflicts = [];
  const pools = {
    king: [],
    suite: [],
    double: []
  };

  rooms
    .filter(room =>
      !assignedRooms.has(room.room)
      &&
      (
        !sameDayRack
        ||
        getRackRoomCategory(room.status) === 'available'
      )
    )
    .sort((left, right) => String(left.room || '').localeCompare(String(right.room || '')))
    .forEach(room => {
      pools[getPreassignRoomGroup(room.type)].push(room);
    });

  candidates
    .map(candidate => ({
      candidate,
      preferredGroup: getPreassignPreferredGroup(candidate),
      neededRooms: Math.max(Number(candidate.habitaciones || 1) - countPreassignmentsForSource(assignments, candidate.sourceKey), 0)
    }))
    .filter(item => item.neededRooms > 0)
    .sort((left, right) => {
      const priority = {
        suite: 0,
        king: 1,
        double: 2
      };
      return priority[left.preferredGroup] - priority[right.preferredGroup];
    })
    .forEach(item => {
      let assignedCount = 0;

      for (let index = 0; index < item.neededRooms; index++) {
        const room = takePreassignRoom(pools, item.preferredGroup, item.candidate);

        if (!room) {
          break;
        }

        const people = getPreassignPeople(item.candidate);
        assignedCount++;
        jobs.push({
          date: isoDate,
          room: room.room,
          roomType: room.type,
          sourceKey: item.candidate.sourceKey || '',
          guestName: item.candidate.nombre || 'Sin nombre',
          adults: Math.ceil(Number(item.candidate.adultos || 0) / Math.max(Number(item.candidate.habitaciones || 1), 1)),
          children: Math.ceil(Number(item.candidate.ninos || 0) / Math.max(Number(item.candidate.habitaciones || 1), 1)),
          people,
          origin: item.candidate.preassignKind === 'Continua' ? 'Ya hospedado' : 'Reserva',
          status: 'preasignado',
          note: 'Autoasignado: regla ' + item.preferredGroup
        });
      }

      if (assignedCount < item.neededRooms) {
        const labels = {
          king: 'King',
          suite: 'Suite',
          double: 'Doble'
        };
        conflicts.push({
          title: item.candidate.nombre || 'Reserva sin nombre',
          detail: 'Faltan ' + (item.neededRooms - assignedCount) + ' habitacion(es). Preferencia: ' + (labels[item.preferredGroup] || item.preferredGroup) + '.'
        });
      }
    });

  return {
    jobs,
    conflicts,
    sameDayRack
  };
}

async function autoPreassignRooms() {
  const isoDate = preassignDate.value;

  if (!isoDate) {
    alert('Selecciona una fecha primero.');
    return;
  }

  if (!dashboardData?.rackStatus?.rooms?.length) {
    alert('Importa el rack antes de autoasignar.');
    return;
  }

  const result = buildAutoPreassignJobs(isoDate);

  if (!result.jobs.length) {
    alert('No hay reservas pendientes o no quedan habitaciones para autoasignar.');
    return;
  }

  if (!confirm('Se guardaran ' + result.jobs.length + ' preasignacion(es) nuevas para ' + (isoToDisplay(isoDate) || isoDate) + '. No se movera lo ya asignado.')) {
    return;
  }

  let saved = 0;
  let failed = 0;

  for (const job of result.jobs) {
    const response = await fetch('/api/room-preassignments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(job)
    });
    const data = await response.json();

    if (data.ok) {
      saved++;
    } else {
      failed++;
    }
  }

  await loadDashboard();
  showView('preassign');
  alert('Autoasignado: ' + saved + ' guardada(s)' + (failed ? ' / ' + failed + ' fallida(s)' : '') + (result.sameDayRack ? '. Rack del dia tomado en cuenta.' : '. Rack usado como inventario de tipos.'));
}

function renderPreassignConflictList(conflicts) {
  if (!conflicts.length) {
    preassignConflictList.innerHTML = '<div class="muted">Sin conflictos detectados.</div>';
    return;
  }

  preassignConflictList.innerHTML = conflicts.map(conflict =>
    '<div class="preassign-mini-row preassign-conflict-row">' +
      '<strong>' + escapeHtml(conflict.title || 'Revisar') + '</strong>' +
      '<div class="muted">' + escapeHtml(conflict.detail || '') + '</div>' +
    '</div>'
  ).join('');
}

function renderPreassignPendingList(pending, isoDate) {
  if (!pending.length) {
    preassignPendingList.innerHTML = '<div class="muted">Sin pendientes. Todo lo detectado para el dia ya tiene al menos una preasignacion.</div>';
    return;
  }

  preassignPendingList.innerHTML = pending.map(item =>
    '<div class="preassign-mini-row">' +
      '<strong>' + escapeHtml(item.nombre || 'Sin nombre') + '</strong>' +
      '<div class="muted">' + escapeHtml(item.preassignKind || '-') + ' / ' + escapeHtml(item.tipo || '-') + ' / ' + getPreassignPeople(item) + ' persona(s) por cuarto</div>' +
      '<div class="muted">' + escapeHtml(item.telefono || '') + '</div>' +
    '</div>'
  ).join('');
}

function renderPreassignAssignmentMiniRow(assignment) {
  return '<div class="preassign-mini-row">' +
    '<strong>Hab ' + escapeHtml(assignment.room || '-') + ' - ' + escapeHtml(assignment.guestName || 'Sin nombre') + '</strong>' +
    '<div class="muted">' + escapeHtml(assignment.roomType || '-') + ' / ' + escapeHtml(assignment.people || 1) + ' persona(s) / ' + escapeHtml(assignment.origin || '-') + '</div>' +
    '<div class="muted">' + escapeHtml(assignment.note || '') + '</div>' +
  '</div>';
}

function renderPreassignAssignedLists(assignments, isoDate) {
  const rows = (assignments || [])
    .filter(assignment => assignment.date === isoDate)
    .slice()
    .sort((left, right) => String(left.room || '').localeCompare(String(right.room || '')));
  const autoRows = rows.filter(assignment =>
    normalizeSearchText(assignment.note).includes('autoasignado')
  );

  preassignAssignedList.innerHTML = rows.length
    ? rows.map(renderPreassignAssignmentMiniRow).join('')
    : '<div class="muted">Sin habitaciones asignadas para esta fecha.</div>';

  preassignAutoAssignedList.innerHTML = autoRows.length
    ? autoRows.map(renderPreassignAssignmentMiniRow).join('')
    : '<div class="muted">Sin autoasignaciones para esta fecha.</div>';
}

function openPreassignModal(roomNumber) {
  const isoDate = preassignDate.value;

  if (!isoDate) {
    alert('Selecciona una fecha primero.');
    return;
  }

  const room = (dashboardData?.rackStatus?.rooms || []).find(item => item.room === roomNumber) || {
    room: roomNumber,
    type: '',
    status: '-'
  };
  const assignment = getPreassignRoomAssignment(roomNumber, isoDate);
  pendingPreassignRoom = room;
  selectedPreassignCandidateKey = assignment?.sourceKey || '';

  preassignModalTitle.textContent = 'Habitacion ' + roomNumber;
  preassignModalSubtitle.textContent = (isoToDisplay(isoDate) || isoDate) + ' / ' + (room.type || '-') + ' / Estado rack ' + (room.status || '-');
  preassignModalBody.innerHTML = renderPreassignModalBody(room, assignment, isoDate);
  preassignModalBackdrop.classList.remove('hidden');
  document.body.classList.add('app-modal-open');
  updatePreassignCapacityHelp();
}

function renderPreassignModalBody(room, assignment, isoDate) {
  const candidates = getPreassignCandidates(isoDate);
  const assignedKeys = getAssignedReservationKeys(isoDate);
  const candidateList = candidates.length
    ? candidates.map(item => renderPreassignCandidate(item, assignedKeys, assignment)).join('')
    : '<div class="muted">No hay reservas detectadas para esta fecha. Puedes capturar huesped fuera de reservacion.</div>';
  const currentName = assignment?.guestName || '';
  const currentAdults = assignment?.adults ?? '';
  const currentChildren = assignment?.children ?? '';
  const currentPeople = assignment?.people || '';
  const currentOrigin = assignment?.origin || 'Sin reservacion';
  const currentStatus = assignment?.status || 'preasignado';
  const currentNote = assignment?.note || '';
  const deleteButton = assignment
    ? '<button class="danger" onclick="deletePreassignment(\'' + escapeJs(assignment.id) + '\')">Quitar</button>'
    : '';

  return '<div>' +
    '<strong>Reservas y continuaciones del dia</strong>' +
    '<div class="muted">Elige una, o llena el formulario como huesped sin reservacion.</div>' +
    '<input id="preassignCandidateSearch" placeholder="Buscar nombre, telefono, folio, tipo o nota" oninput="filterPreassignCandidates()" style="margin-top:10px">' +
    '<div class="preassign-form-row" style="margin-top:8px">' +
      '<label>Min personas<input id="preassignPeopleMin" type="number" min="0" placeholder="Ej. 2" oninput="filterPreassignCandidates()"></label>' +
      '<label>Max personas<input id="preassignPeopleMax" type="number" min="0" placeholder="Ej. 4" oninput="filterPreassignCandidates()"></label>' +
    '</div>' +
    '<div class="summary-chips" style="margin-top:8px">' +
      '<label class="chip"><input type="radio" name="preassignAssignedFilter" value="all" checked onchange="filterPreassignCandidates()"> Todas</label>' +
      '<label class="chip"><input type="radio" name="preassignAssignedFilter" value="unassigned" onchange="filterPreassignCandidates()"> No asignadas</label>' +
    '</div>' +
    '<div class="preassign-candidate-list" style="margin-top:10px">' + candidateList + '</div>' +
  '</div>' +
  '<div>' +
    '<strong>Asignacion</strong>' +
    '<div id="preassignCapacityHelp" class="muted" style="margin:6px 0 10px"></div>' +
    '<div class="preassign-form">' +
      '<input id="preassignAssignmentId" type="hidden" value="' + escapeHtml(assignment?.id || '') + '">' +
      '<input id="preassignSourceKey" type="hidden" value="' + escapeHtml(assignment?.sourceKey || '') + '">' +
      '<label>Huesped<input id="preassignGuestName" value="' + escapeHtml(currentName) + '" placeholder="Nombre del huesped"></label>' +
      '<div class="preassign-form-row">' +
        '<label>Adultos<input id="preassignAdults" type="number" min="0" value="' + escapeHtml(currentAdults) + '" oninput="syncPreassignPeople()"></label>' +
        '<label>Menores<input id="preassignChildren" type="number" min="0" value="' + escapeHtml(currentChildren) + '" oninput="syncPreassignPeople()"></label>' +
      '</div>' +
      '<div class="preassign-form-row">' +
        '<label>Personas<input id="preassignPeople" type="number" min="1" value="' + escapeHtml(currentPeople) + '" oninput="updatePreassignCapacityHelp()"></label>' +
        '<label>Origen<select id="preassignOrigin">' +
          renderPreassignOption('Reserva', currentOrigin) +
          renderPreassignOption('Ya hospedado', currentOrigin) +
          renderPreassignOption('Sin reservacion', currentOrigin) +
        '</select></label>' +
      '</div>' +
      '<label>Estado<select id="preassignAssignmentStatus">' +
        renderPreassignOption('preasignado', currentStatus) +
        renderPreassignOption('llego', currentStatus) +
        renderPreassignOption('cambiar cuarto', currentStatus) +
        renderPreassignOption('revisar', currentStatus) +
      '</select></label>' +
      '<label>Notas<input id="preassignNote" value="' + escapeHtml(currentNote) + '" placeholder="Ej. llega tarde, cerca elevador, pago pendiente"></label>' +
      '<div class="confirm-actions">' +
        deleteButton +
        '<button onclick="closePreassignModal()">Cancelar</button>' +
        '<button class="primary" onclick="savePreassignment()">Guardar</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function renderPreassignOption(value, selected) {
  return '<option value="' + escapeHtml(value) + '"' + (value === selected ? ' selected' : '') + '>' + escapeHtml(value) + '</option>';
}

function renderPreassignCandidate(item, assignedKeys, assignment) {
  const selected = item.sourceKey && item.sourceKey === assignment?.sourceKey;
  const alreadyAssigned = item.sourceKey && assignedKeys.has(item.sourceKey) && !selected;
  const searchText = [
    item.nombre,
    item.telefono,
    item.folio,
    item.tipo,
    item.preassignKind,
    item.hora,
    item.note
  ].join(' ');
  const people = getPreassignPeople(item);

  return '<div class="preassign-candidate ' + (selected ? 'selected ' : '') + (alreadyAssigned ? 'assigned' : '') + '" data-search="' + escapeHtml(normalizeSearchText(searchText)) + '" data-people="' + escapeHtml(people) + '" data-assigned="' + (alreadyAssigned ? '1' : '0') + '" onclick="selectPreassignCandidate(\'' + escapeJs(item.sourceKey || '') + '\', this)">' +
    '<strong>' + escapeHtml(item.nombre || 'Sin nombre') + '</strong>' +
    '<div class="muted">' + escapeHtml(item.preassignKind || '-') + ' / ' + escapeHtml(item.tipo || '-') + ' / ' + escapeHtml(item.habitaciones || 1) + ' hab(s)</div>' +
    '<div class="muted">' + people + ' persona(s) sugeridas por cuarto / ' + escapeHtml(item.telefono || '') + '</div>' +
    (alreadyAssigned ? '<div class="muted">Ya tiene una preasignacion; puedes usarla otra vez si son varias habitaciones.</div>' : '') +
  '</div>';
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function filterPreassignCandidates() {
  const input = document.getElementById('preassignCandidateSearch');
  const query = normalizeSearchText(input?.value || '');
  const minPeople = Number(document.getElementById('preassignPeopleMin')?.value || 0);
  const maxPeople = Number(document.getElementById('preassignPeopleMax')?.value || 0);
  const assignedFilter = document.querySelector('input[name="preassignAssignedFilter"]:checked')?.value || 'all';
  let visible = 0;

  document.querySelectorAll('.preassign-candidate').forEach(candidate => {
    const people = Number(candidate.dataset.people || 0);
    const matchesText = !query || String(candidate.dataset.search || '').includes(query);
    const matchesMin = !minPeople || people >= minPeople;
    const matchesMax = !maxPeople || people <= maxPeople;
    const matchesAssigned = assignedFilter !== 'unassigned' || candidate.dataset.assigned !== '1';
    const matches = matchesText && matchesMin && matchesMax && matchesAssigned;
    candidate.style.display = matches ? '' : 'none';
    if (matches) {
      visible++;
    }
  });

  const list = document.querySelector('.preassign-candidate-list');
  let empty = document.getElementById('preassignCandidateEmpty');

  if (!list) {
    return;
  }

  if (!empty) {
    empty = document.createElement('div');
    empty.id = 'preassignCandidateEmpty';
    empty.className = 'muted';
    empty.textContent = 'Sin coincidencias.';
    empty.style.display = 'none';
    list.appendChild(empty);
  }

  empty.style.display = visible ? 'none' : '';
}

function selectPreassignCandidate(sourceKey, trigger) {
  const isoDate = preassignDate.value;
  const candidate = getPreassignCandidates(isoDate).find(item => item.sourceKey === sourceKey);

  selectedPreassignCandidateKey = sourceKey;
  document.querySelectorAll('.preassign-candidate').forEach(node => node.classList.remove('selected'));
  trigger?.classList.add('selected');

  if (!candidate) {
    return;
  }

  preassignSourceKey.value = candidate.sourceKey || '';
  preassignGuestName.value = candidate.nombre || '';
  preassignAdults.value = Math.ceil(Number(candidate.adultos || 0) / Math.max(Number(candidate.habitaciones || 1), 1));
  preassignChildren.value = Math.ceil(Number(candidate.ninos || 0) / Math.max(Number(candidate.habitaciones || 1), 1));
  preassignPeople.value = getPreassignPeople(candidate);
  preassignOrigin.value = candidate.preassignKind === 'Continua' ? 'Ya hospedado' : 'Reserva';
  if (!preassignNote.value && candidate.note) {
    preassignNote.value = candidate.note;
  }
  updatePreassignCapacityHelp();
}

function syncPreassignPeople() {
  preassignPeople.value = Math.max(
    Number(preassignAdults.value || 0) + Number(preassignChildren.value || 0),
    1
  );
  updatePreassignCapacityHelp();
}

function updatePreassignCapacityHelp() {
  if (!pendingPreassignRoom || typeof preassignCapacityHelp === 'undefined') {
    return;
  }

  const capacity = getPreassignCapacity(pendingPreassignRoom);
  const people = Number(preassignPeople?.value || 0);
  preassignCapacityHelp.textContent =
    'Capacidad: ' + capacity + ' persona(s). King max 2; Doble/Suite max 4.';
  preassignCapacityHelp.style.color = people > capacity ? '#b91c1c' : '';
}

async function savePreassignment() {
  if (!pendingPreassignRoom) {
    return;
  }

  if (!preassignDate.value) {
    alert('Selecciona una fecha primero.');
    return;
  }

  const capacity = getPreassignCapacity(pendingPreassignRoom);
  const people = Number(preassignPeople.value || 0);

  if (people > capacity) {
    alert('La habitacion permite maximo ' + capacity + ' persona(s).');
    return;
  }

  const response = await fetch('/api/room-preassignments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: preassignAssignmentId.value,
      date: preassignDate.value,
      room: pendingPreassignRoom.room,
      roomType: pendingPreassignRoom.type,
      sourceKey: preassignSourceKey.value,
      guestName: preassignGuestName.value,
      adults: Number(preassignAdults.value || 0),
      children: Number(preassignChildren.value || 0),
      people,
      origin: preassignOrigin.value,
      status: preassignAssignmentStatus.value,
      note: preassignNote.value
    })
  });
  const data = await response.json();

  if (!data.ok) {
    alert(data.error || 'No se pudo guardar la preasignacion.');
    return;
  }

  closePreassignModal();
  await loadDashboard();
  showView('preassign');
}

async function deletePreassignment(id) {
  const response = await fetch('/api/room-preassignments/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id })
  });
  const data = await response.json();

  if (!data.ok) {
    alert(data.error || 'No se pudo quitar la preasignacion.');
    return;
  }

  closePreassignModal();
  await loadDashboard();
  showView('preassign');
}

function closePreassignModal() {
  preassignModalBackdrop.classList.add('hidden');
  pendingPreassignRoom = null;
  selectedPreassignCandidateKey = '';
  document.body.classList.remove('app-modal-open');
}

function renderPreassignPrintTypeSummary(rooms, assignments) {
  const counts = {};

  (rooms || []).forEach(room => {
    const type = getPreassignTypeLabel(room.type);
    const category = getRackRoomCategory(room.status);

    if (!counts[type]) {
      counts[type] = {
        total: 0,
        assigned: 0,
        available: 0,
        occupied: 0,
        blocked: 0
      };
    }

    counts[type].total++;

    if (category === 'available') {
      counts[type].available++;
    } else if (category === 'occupied') {
      counts[type].occupied++;
    } else {
      counts[type].blocked++;
    }
  });

  (assignments || []).forEach(assignment => {
    const room = (rooms || []).find(item => item.room === assignment.room);
    const type = getPreassignTypeLabel(room?.type || assignment.roomType);

    if (!counts[type]) {
      counts[type] = {
        total: 0,
        assigned: 0,
        available: 0,
        occupied: 0,
        blocked: 0
      };
    }

    counts[type].assigned++;
  });

  return Object.keys(counts)
    .sort((left, right) => left.localeCompare(right))
    .map(type =>
      '<tr><td><strong>' + escapeHtml(type) + '</strong></td><td>' + counts[type].total + '</td><td>' + counts[type].assigned + '</td><td>' + Math.max(counts[type].available - counts[type].assigned, 0) + '</td><td>' + counts[type].occupied + '</td><td>' + counts[type].blocked + '</td></tr>'
    )
    .join('') || '<tr><td colspan="6">Sin habitaciones en rack.</td></tr>';
}

function renderPreassignPrintRack(rooms, assignments, isoDate) {
  const byFloor = (rooms || []).reduce((acc, room) => {
    const floor = String(room.room || '').slice(0, 1) || '-';
    if (!acc[floor]) {
      acc[floor] = [];
    }
    acc[floor].push(room);
    return acc;
  }, {});

  return Object.keys(byFloor)
    .sort()
    .map(floor => {
      const rows = byFloor[floor]
        .sort((left, right) => String(left.room || '').localeCompare(String(right.room || '')))
        .map(room => {
          const assignment = assignments.find(item => item.room === room.room);
          const category = getRackRoomCategory(room.status);
          const status = assignment
            ? (isPreassignContinuedAssignment(assignment, isoDate) ? 'Continua preasignada' : 'Preasignada')
            : (category === 'occupied' ? 'Ocupada rack' : (category === 'available' ? 'Libre' : 'Bloqueada'));
          const guest = assignment
            ? assignment.guestName || 'Sin nombre'
            : '';

          return '<tr><td><strong>' + escapeHtml(room.room || '-') + '</strong></td><td>' + escapeHtml(room.type || '-') + '</td><td>' + escapeHtml(room.status || '-') + '</td><td>' + escapeHtml(status) + '</td><td>' + escapeHtml(guest) + '</td><td>' + escapeHtml(assignment?.note || '') + '</td></tr>';
        })
        .join('');

      return '<h2>Piso ' + escapeHtml(floor) + '</h2><table><thead><tr><th>Hab</th><th>Tipo</th><th>Rack</th><th>Estado</th><th>Huesped</th><th>Notas</th></tr></thead><tbody>' + rows + '</tbody></table>';
    })
    .join('') || '<table><tbody><tr><td>Sin rack cargado.</td></tr></tbody></table>';
}

function printPreassignment() {
  const isoDate = preassignDate.value;

  if (!isoDate) {
    alert('Selecciona una fecha para imprimir.');
    return;
  }

  const display = isoToDisplay(isoDate) || isoDate;
  const assignments = getPreassignAssignmentsForDate(isoDate)
    .slice()
    .sort((left, right) => String(left.room || '').localeCompare(String(right.room || '')));
  const rooms = (dashboardData?.rackStatus?.rooms || [])
    .slice()
    .sort((left, right) => String(left.room || '').localeCompare(String(right.room || '')));
  const conflicts = buildPreassignConflicts(isoDate);
  const pending = getPreassignCandidates(isoDate)
    .filter(item => !getAssignedReservationKeys(isoDate).has(item.sourceKey));
  const rows = assignments.length
    ? assignments.map(item =>
      '<tr><td><strong>' + escapeHtml(item.room || '') + '</strong></td><td>' + escapeHtml(item.guestName || '') + '</td><td>' + escapeHtml(item.people || '') + '</td><td>' + escapeHtml(item.roomType || '') + '</td><td>' + escapeHtml(item.origin || '') + '</td><td>' + escapeHtml(isPreassignContinuedAssignment(item, isoDate) ? 'continua' : item.status || '') + '</td><td>' + escapeHtml(item.note || '') + '</td></tr>'
    ).join('')
    : '<tr><td colspan="7">Sin preasignaciones guardadas.</td></tr>';
  const conflictRows = conflicts.length
    ? conflicts.map(item =>
      '<tr><td><strong>' + escapeHtml(item.title || '') + '</strong></td><td>' + escapeHtml(item.detail || '') + '</td></tr>'
    ).join('')
    : '<tr><td colspan="2">Sin conflictos detectados.</td></tr>';
  const pendingRows = pending.length
    ? pending.map(item =>
      '<tr><td>' + escapeHtml(item.nombre || '') + '</td><td>' + escapeHtml(item.preassignKind || '') + '</td><td>' + escapeHtml(item.tipo || '') + '</td><td>' + escapeHtml(getPreassignPeople(item)) + '</td><td>' + escapeHtml(item.telefono || '') + '</td></tr>'
    ).join('')
    : '<tr><td colspan="5">Sin pendientes detectados.</td></tr>';
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><title>Preasignacion ' + escapeHtml(display) + '</title>' +
    '<style>body{font-family:Arial,sans-serif;color:#111827;margin:24px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:22px 0 8px;break-after:avoid}.muted{color:#64748b}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}.box{border:1px solid #cbd5e1;padding:8px}.box strong{display:block;font-size:18px}table{width:100%;border-collapse:collapse;margin-top:8px;break-inside:auto}tr{break-inside:avoid}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left;vertical-align:top;font-size:11px}th{background:#f1f5f9}.actions{text-align:right;margin-bottom:12px}@media print{.actions{display:none}body{margin:8mm}.page-break{break-before:page}}</style>' +
    '</head><body><div class="actions"><button onclick="window.print()">Imprimir / guardar PDF</button></div>' +
    '<h1>Preasignacion de habitaciones</h1><div class="muted">Hotel Villa Margaritas / ' + escapeHtml(display) + '</div>' +
    '<div class="summary"><div class="box"><span>Preasignadas</span><strong>' + assignments.length + '</strong></div><div class="box"><span>Pendientes</span><strong>' + pending.length + '</strong></div><div class="box"><span>Conflictos</span><strong>' + conflicts.length + '</strong></div><div class="box"><span>Rack</span><strong>' + rooms.length + '</strong></div></div>' +
    '<h2>Resumen por tipo</h2><table><thead><tr><th>Tipo</th><th>Total</th><th>Preasig.</th><th>Libres</th><th>Ocupadas rack</th><th>Bloq.</th></tr></thead><tbody>' + renderPreassignPrintTypeSummary(rooms, assignments) + '</tbody></table>' +
    '<h2>Conflictos / revisar</h2><table><thead><tr><th>Detalle</th><th>Motivo</th></tr></thead><tbody>' + conflictRows + '</tbody></table>' +
    '<h2>Habitaciones asignadas</h2><table><thead><tr><th>Hab</th><th>Huesped</th><th>Pers.</th><th>Tipo</th><th>Origen</th><th>Estado</th><th>Notas</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<h2>Pendientes</h2><table><thead><tr><th>Huesped</th><th>Tipo</th><th>Habitacion solicitada</th><th>Pers./cuarto</th><th>Telefono</th></tr></thead><tbody>' + pendingRows + '</tbody></table>' +
    '<div class="page-break"></div><h1>Mapa completo del rack</h1><div class="muted">Libre, preasignada, continuacion, ocupada rack o bloqueada.</div>' + renderPreassignPrintRack(rooms, assignments, isoDate) +
    '<script>window.onload=function(){window.print();}<\/script></body></html>';
  const printWindow = window.open('', '_blank');

  if (!printWindow) {
    alert('Permite ventanas emergentes para imprimir.');
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();
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
  document.body.classList.add('app-modal-open');
}

function closeRackConfirm() {
  confirmRackBackdrop.classList.add('hidden');
  pendingRackRoom = null;
  document.body.classList.remove('app-modal-open');
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

