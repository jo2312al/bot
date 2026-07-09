// Dashboard frontend module: search
function handleGlobalSearchKey(event) {
  if (event.key === 'Enter') {
    runGlobalSearch();
  }
}

function openGlobalSearch() {
  const searchPanel = document.querySelector('.global-search-panel');
  if (searchPanel) {
    searchPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    searchPanel.classList.add('search-panel-active');
    window.setTimeout(() => searchPanel.classList.remove('search-panel-active'), 1400);
  }

  globalSearchResults.classList.remove('hidden');
  if (!globalSearchInput.value.trim()) {
    globalSearchResults.innerHTML = '<div class="muted">Escribe nombre, telefono, folio, habitacion, evento o cotizacion y presiona Buscar.</div>';
    globalSearchInput.focus();
    return;
  }

  globalSearchInput.focus();
  runGlobalSearch();
}

async function runGlobalSearch() {
  const query = globalSearchInput.value.trim();

  if (query.length < 2) {
    globalSearchResults.classList.remove('hidden');
    globalSearchResults.innerHTML = '<div class="muted">Escribe al menos 2 caracteres para buscar.</div>';
    return;
  }

  globalSearchResults.classList.remove('hidden');
  globalSearchResults.innerHTML = '<div class="muted">Buscando...</div>';

  try {
    const response = await fetch('/api/search?q=' + encodeURIComponent(query));
    const data = await response.json();

    if (!data.ok) {
      globalSearchResults.innerHTML = '<div class="muted">' + escapeHtml(data.error || 'No se pudo buscar') + '</div>';
      return;
    }

    renderGlobalSearchResults(data.results || {});
  } catch (error) {
    globalSearchResults.innerHTML = '<div class="muted">No se pudo buscar: ' + escapeHtml(error.message || '') + '</div>';
  }
}

function renderGlobalSearchResults(results) {
  const sections = [
    ['Reservas', results.reservations || [], renderSearchReservation],
    ['Historial huespedes', results.guests || [], renderSearchGuest],
    ['Eventos', results.events || [], renderSearchEvent],
    ['Cotizaciones', results.quotations || [], renderSearchQuote],
    ['Bloqueos', results.blocks || [], renderSearchBlock]
  ];
  const total = sections.reduce((sum, [, rows]) => sum + rows.length, 0);

  if (!total) {
    globalSearchResults.innerHTML = '<div class="muted">Sin resultados para "' + escapeHtml(results.query || '') + '".</div>';
    return;
  }

  globalSearchResults.innerHTML =
    '<div class="search-grid">' +
      sections
        .filter(([, rows]) => rows.length)
        .map(([title, rows, renderer]) =>
          '<div class="search-card"><h3>' + escapeHtml(title) + '</h3><div class="mini-list">' +
          rows.map(renderer).join('') +
          '</div></div>'
        )
        .join('') +
    '</div>';
}

function renderSearchReservation(reservation) {
  const dates = Array.isArray(reservation.dates)
    ? reservation.dates.join(', ')
    : (reservation.fecha || reservation.startDate || '-');
  const isoDate = Array.isArray(reservation.dates) && reservation.dates[0]
    ? displayToIsoClient(reservation.dates[0])
    : displayToIsoClient(reservation.fecha || reservation.startDate || '');
  return '<button class="mini-item search-result-button" onclick="openSearchReservation(\'' + escapeJs(isoDate) + '\', \'' + escapeJs(reservation.sourceKey || '') + '\')">' +
    '<strong>' + escapeHtml(reservation.nombre || reservation.guestName || 'Reserva') + '</strong>' +
    '<div class="muted">' + escapeHtml(dates) + ' · ' + escapeHtml(reservation.tipo || reservation.roomType || '-') + ' · ' + escapeHtml(reservation.source || reservation.origen || '') + '</div>' +
    '<div>' + escapeHtml(reservation.telefono || reservation.phone || '') + '</div>' +
  '</button>';
}

function renderSearchGuest(row) {
  return '<button class="mini-item search-result-button" onclick="openSearchGuest(\'' + escapeJs(row.reservationId || '') + '\')">' +
    '<strong>' + escapeHtml(row.guestName || 'Huesped') + '</strong>' +
    '<div class="muted">' + escapeHtml(row.dates || row.startDate || '-') + ' · ' + escapeHtml(row.source || '-') + ' · ' + escapeHtml(row.status || '-') + '</div>' +
    '<div>Hab: ' + escapeHtml(row.assignedRoom || '-') + ' · Tipo: ' + escapeHtml(row.roomType || '-') + '</div>' +
    '<div class="muted">' + escapeHtml(row.phone || '') + (row.note ? ' · Nota: ' + escapeHtml(row.note) : '') + '</div>' +
  '</button>';
}

function renderSearchEvent(event) {
  return '<button class="mini-item search-result-button" onclick="openSearchEvent(\'' + escapeJs(event.id || '') + '\')">' +
    '<strong>' + escapeHtml(event.eventName || event.client || 'Evento') + '</strong>' +
    '<div class="muted">' + escapeHtml(isoToDisplay(event.eventDate || '') || event.eventDate || '-') + ' · ' + escapeHtml(event.hallName || '-') + ' · ' + escapeHtml(event.status || '-') + '</div>' +
    '<div>' + escapeHtml(event.client || '') + '</div>' +
  '</button>';
}

function renderSearchQuote(quote) {
  return '<button class="mini-item search-result-button" onclick="openSearchQuote(\'' + escapeJs(quote.id || '') + '\')">' +
    '<strong>' + escapeHtml(quote.id || 'Cotizacion') + '</strong>' +
    '<div class="muted">' + escapeHtml(quote.client || '-') + ' · ' + escapeHtml(quote.eventName || '-') + '</div>' +
    '<div>' + escapeHtml(quote.eventDate || '') + ' · ' + escapeHtml(quote.hallName || quote.hall || 'Sin salon') + '</div>' +
  '</button>';
}

function renderSearchBlock(block) {
  return '<button class="mini-item search-result-button" onclick="openSearchBlock(\'' + escapeJs(block.id || '') + '\')">' +
    '<strong>Hab ' + escapeHtml(block.roomNumber || '-') + '</strong>' +
    '<div class="muted">' + escapeHtml(isoToDisplay(block.startDate || '') || '-') + ' al ' + escapeHtml(isoToDisplay(block.endDate || '') || '-') + ' · ' + escapeHtml(block.status || '-') + '</div>' +
    '<div>' + escapeHtml(block.reason || '-') + '</div>' +
  '</button>';
}

function closeGlobalSearchResults() {
  globalSearchResults.classList.add('hidden');
}

function openSearchReservation(isoDate, sourceKey) {
  closeGlobalSearchResults();

  if (isoDate) {
    activeModalIsoDate = isoDate;
  }

  if (sourceKey) {
    openReservationArrivalByKey(sourceKey);
    return;
  }

  const reservation = (dashboardData?.groupReservations || []).find(row =>
    row.sourceKey === sourceKey ||
    (isoDate && (row.dates || [row.fecha]).map(displayToIsoClient).includes(isoDate))
  );
  openSearchDetailModal(
    'Reserva',
    reservation?.nombre || 'Reserva encontrada',
    renderSearchReservationDetail(reservation || {})
  );
}

function openSearchGuest(reservationId) {
  closeGlobalSearchResults();
  fetch('/api/guest-history?q=' + encodeURIComponent(globalSearchInput.value.trim()))
    .then(response => response.json())
    .then(data => {
      const row = (data.history || []).find(item => String(item.reservationId) === String(reservationId)) || (data.history || [])[0];
      openSearchDetailModal(
        'Historial de huesped',
        row?.guestName || 'Huesped',
        renderGuestHistoryDetail(row || {}, data.history || [])
      );
    })
    .catch(error =>
      openSearchDetailModal('Historial de huesped', 'No se pudo cargar', '<div class="muted">' + escapeHtml(error.message || '') + '</div>')
    );
}

function openSearchEvent(eventId) {
  closeGlobalSearchResults();
  openEventDetail(eventId);
}

function openSearchQuote(quotationId) {
  closeGlobalSearchResults();
  const quote = (dashboardData?.quotations || []).find(row => row.id === quotationId);

  if (!quote) {
    openSearchDetailModal('Cotizacion', quotationId || 'Cotizacion', '<div class="muted">No se encontro la cotizacion en memoria. Actualiza el dashboard.</div>');
    return;
  }

  openSearchDetailModal(
    'Cotizacion ' + (quote.id || ''),
    quote.client || quote.eventName || 'Sin cliente',
    renderQuoteDetail(quote)
  );
}

function openSearchBlock(blockId) {
  closeGlobalSearchResults();
  const block = roomBlocks.find(item => String(item.id) === String(blockId));
  openSearchDetailModal(
    'Bloqueo de habitacion',
    block ? 'Habitacion ' + block.roomNumber : 'Bloqueo',
    renderBlockDetail(block || {})
  );
}

function openSearchDetailModal(title, subtitle, bodyHtml) {
  searchDetailTitle.textContent = title;
  searchDetailSubtitle.textContent = subtitle || '';
  searchDetailBody.innerHTML = bodyHtml || '<div class="muted">Sin detalle.</div>';
  searchDetailModalBackdrop.classList.remove('hidden');
  document.body.classList.add('app-modal-open');
}

function closeSearchDetailModal() {
  searchDetailModalBackdrop.classList.add('hidden');
  document.body.classList.remove('app-modal-open');
}

function renderSearchReservationDetail(reservation) {
  return '<div class="event-detail-grid">' +
    renderDetailBox('Huesped', reservation.nombre || reservation.guestName || '-') +
    renderDetailBox('Telefono', reservation.telefono || reservation.phone || '-') +
    renderDetailBox('Fechas', (reservation.dates || [reservation.fecha || reservation.startDate]).filter(Boolean).join(', ') || '-') +
    renderDetailBox('Habitaciones', reservation.habitaciones || reservation.roomsCount || '-') +
    renderDetailBox('Tipo / hora', (reservation.tipo || reservation.roomType || '-') + ' / ' + (reservation.hora || reservation.arrivalTime || '-')) +
    renderDetailBox('Tarifa', getReservationPricingText(reservation)) +
  '</div>' +
  '<div class="event-detail-box"><span>Nota</span><div>' + escapeHtml(reservation.note || reservation.nota || 'Sin nota') + '</div></div>';
}

function renderGuestHistoryDetail(row, historyRows) {
  const history = Array.isArray(historyRows) ? historyRows : [];
  const last = history[0] || row || {};
  const rooms = Array.from(new Set(history.map(item => item.assignedRoom).filter(Boolean))).slice(0, 5);
  const notes = history.map(item => item.note).filter(Boolean).slice(0, 3);
  const recentRows = history.slice(0, 8);

  return '<div class="event-detail-grid">' +
    renderDetailBox('Huesped', row.guestName || '-') +
    renderDetailBox('Telefono', row.phone || '-') +
    renderDetailBox('Estancias encontradas', history.length || (row.reservationId ? 1 : 0)) +
    renderDetailBox('Ultima estancia', last.dates || last.startDate || '-') +
    renderDetailBox('Ultima habitacion', last.assignedRoom || '-') +
    renderDetailBox('Tipos usados', Array.from(new Set(history.map(item => item.roomType).filter(Boolean))).slice(0, 4).join(', ') || row.roomType || '-') +
    renderDetailBox('Habitaciones usadas', rooms.join(', ') || '-') +
    renderDetailBox('Ultima tarifa', last.rate || '-') +
  '</div>' +
  '<div class="event-detail-box"><span>Notas recientes</span><div>' + escapeHtml(notes.join(' | ') || row.note || 'Sin nota') + '</div></div>' +
  '<div class="event-detail-box"><span>Ultimas estancias</span><div>' +
    (recentRows.length
      ? '<table class="report-table"><thead><tr><th>Fechas</th><th>Hab</th><th>Tipo</th><th>Estado</th><th>Folio</th></tr></thead><tbody>' +
        recentRows.map(item =>
          '<tr><td>' + escapeHtml(item.dates || item.startDate || '-') + '</td><td>' + escapeHtml(item.assignedRoom || '-') + '</td><td>' + escapeHtml(item.roomType || '-') + '</td><td>' + escapeHtml(item.status || '-') + '</td><td>' + escapeHtml(item.folio || '-') + '</td></tr>'
        ).join('') +
        '</tbody></table>'
      : '<div class="muted">Sin historial adicional.</div>'
    ) +
  '</div></div>';
}

function renderQuoteDetail(quote) {
  return '<div class="event-detail-grid">' +
    renderDetailBox('Cliente', quote.client || '-') +
    renderDetailBox('Contacto', quote.contact || '-') +
    renderDetailBox('Evento', quote.eventName || quote.headline || '-') +
    renderDetailBox('Fecha', quote.eventDate || '-') +
    renderDetailBox('Salon', quote.hallName || quote.hallCode || 'Sin salon') +
    renderDetailBox('Total', formatMoney(quote.total || 0)) +
  '</div>' +
  '<div class="confirm-actions"><button onclick="openQuotationPdf(\'' + escapeJs(quote.id || '') + '\')">Abrir PDF</button><button class="primary" onclick="closeSearchDetailModal(); openQuoteEventModal(\'' + escapeJs(quote.id || '') + '\')">Apartar salon</button></div>';
}

function renderBlockDetail(block) {
  return '<div class="event-detail-grid">' +
    renderDetailBox('Habitacion', block.roomNumber || '-') +
    renderDetailBox('Fechas', (isoToDisplay(block.startDate || '') || '-') + ' al ' + (isoToDisplay(block.endDate || '') || '-')) +
    renderDetailBox('Estado', block.status || '-') +
    renderDetailBox('Motivo', block.reason || '-') +
  '</div>' +
  '<div class="event-detail-box"><span>Notas</span><div>' + escapeHtml(block.notes || 'Sin notas') + '</div></div>';
}

function renderDetailBox(label, value) {
  return '<div class="event-detail-box"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
}

function getReservationPricingText(reservation) {
  const parts = [
    reservation.tarifa || reservation.rate || '-'
  ];

  if (reservation.mananera) {
    parts.push('Mañanera');
  }

  if (Number(reservation.extraAmount || 0) > 0) {
    parts.push('Extra adulto(s): ' + Number(reservation.extraAdults || 0) + ' / +$' + Number(reservation.extraAmount || 0).toLocaleString('es-MX'));
  }

  return parts.join(' · ');
}

function openQuotationPdf(quotationId) {
  if (!quotationId) {
    return;
  }
  window.open('/api/quotations/' + encodeURIComponent(quotationId) + '/print', '_blank');
}

function displayToIsoClient(value) {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return iso[1] + '-' + iso[2] + '-' + iso[3];
  }
  const display = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!display) {
    return '';
  }
  return display[3] + '-' + display[2] + '-' + display[1];
}

