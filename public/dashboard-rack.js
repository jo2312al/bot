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
      return '<button class="rack-room ' + category + ' ' + typeClass + '" onclick="setRackRoomOccupied(\'' + escapeHtml(room.room) + '\')">' +
        '<strong>' + escapeHtml(room.room) + '</strong>' +
        '<span>' + escapeHtml(room.type || '-') + '</span>' +
        '<span>' + escapeHtml(room.status || '-') + '</span>' +
      '</button>';
    }).join('') +
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
              return '<button class="floor-room ' + className + '" onclick="setRackRoomOccupied(\'' + escapeHtml(room.room) + '\')">' +
                '<strong>' + escapeHtml(room.room || '-') + '</strong>' +
                '<span>' + escapeHtml(room.type || '-') + '</span>' +
                '<span>' + escapeHtml(room.status || '-') + '</span>' +
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

