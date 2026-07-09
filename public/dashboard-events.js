// Dashboard frontend module: events
function eventStatusLabel(status) {
  return {
    cotizacion: 'En cotizacion',
    apartado: 'Apartado',
    pago_completo: 'Pago completo'
  }[status] || status || 'En cotizacion';
}

function eventPercent(event) {
  if (event.paymentPercent !== undefined && event.paymentPercent !== null) {
    return Math.max(0, Math.min(100, Number(event.paymentPercent || 0)));
  }
  return event.totalAmount
    ? Math.max(0, Math.min(100, Number(event.paidAmount || 0) / Number(event.totalAmount || 1) * 100))
    : 0;
}

function findEventConflict(eventDateValue, hallCode, excludeId) {
  if (!eventDateValue || !hallCode) {
    return null;
  }

  return eventBookings.find(event =>
    String(event.id) !== String(excludeId || '')
    &&
    event.eventDate === eventDateValue
    &&
    event.hallCode === hallCode
    &&
    ['apartado', 'pago_completo'].includes(event.status)
  ) || null;
}

function renderEventAvailability(scope, excludeId) {
  const isQuote =
    scope === 'quote';
  const target =
    isQuote ? quoteEventAvailability : eventAvailability;
  const dateValue =
    isQuote ? quoteEventModalDate.value : eventDate.value;
  const hallCode =
    isQuote ? quoteEventModalHall.value : eventHall.value;
  const conflict =
    findEventConflict(dateValue, hallCode, excludeId);

  if (!target) {
    return null;
  }

  if (!dateValue || !hallCode) {
    target.textContent = '';
    target.className = 'muted';
    return null;
  }

  if (conflict) {
    target.textContent = 'No disponible: ya existe ' + (conflict.eventName || conflict.client || 'otro evento') + ' en ese salon y fecha.';
    target.className = 'availability-bad';
    return conflict;
  }

  target.textContent = 'Disponible: no hay otro evento apartado/pagado en ese salon y fecha.';
  target.className = 'availability-ok';
  return null;
}

function renderEventAlerts() {
  if (!eventAlerts) {
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const next30 = new Date();
  next30.setDate(next30.getDate() + 30);
  const next30Iso = next30.toISOString().slice(0, 10);
  const alerts = eventBookings
    .filter(event =>
      event.eventDate >= today
      &&
      event.eventDate <= next30Iso
      &&
      ['apartado', 'pago_completo'].includes(event.status)
      &&
      Number(event.totalAmount || 0) > Number(event.paidAmount || 0)
    )
    .sort((left, right) => String(left.eventDate).localeCompare(String(right.eventDate)))
    .slice(0, 6);

  eventAlerts.innerHTML = alerts.length
    ? alerts.map(event =>
      '<div class="event-alert ' + (event.eventDate <= today ? 'danger' : '') + '">' +
        '<strong>Pago pendiente: ' + escapeHtml(event.eventDate || '') + ' · ' + escapeHtml(event.hallName || '') + '</strong>' +
        '<div>' + escapeHtml(event.eventName || event.client || 'Evento') + ' · Saldo ' + formatMoney(Math.max(Number(event.totalAmount || 0) - Number(event.paidAmount || 0), 0)) + '</div>' +
      '</div>'
    ).join('')
    : '<div class="muted">Sin alertas de pagos pendientes en los proximos 30 dias.</div>';
}

function renderEventCalendar() {
  if (!eventCalendar) {
    return;
  }

  const month = eventMonth?.value || new Date().toISOString().slice(0, 7);
  const start = new Date(month + '-01T00:00:00');
  const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const firstWeekday = start.getDay();
  const todayIso = new Date().toISOString().slice(0, 10);
  const cells = [];

  for (let index = 0; index < firstWeekday; index++) {
    cells.push('<div class="event-day empty"></div>');
  }

  for (let day = 1; day <= days; day++) {
    const iso = month + '-' + String(day).padStart(2, '0');
    const events = eventBookings.filter(event => event.eventDate === iso);
    cells.push(
      '<div class="event-day ' + (iso === todayIso ? 'today' : '') + '">' +
        '<div class="event-date-label">' + day + '</div>' +
        (events.length
          ? events.map(event =>
            '<div class="event-pill ' + escapeHtml(event.status || 'cotizacion') + '" onclick="openEventDetail(\'' + escapeHtml(event.id) + '\')">' +
              '<strong>' + escapeHtml(event.hallName || event.hallCode || '') + '</strong>' +
              '<div>' + escapeHtml(event.eventName || event.client || 'Evento') + '</div>' +
              '<div class="muted">' + eventStatusLabel(event.status) + ' · ' + Math.round(eventPercent(event)) + '%</div>' +
              '<div class="payment-bar"><span style="width:' + eventPercent(event) + '%"></span></div>' +
            '</div>'
          ).join('')
          : '<div class="muted">Libre</div>') +
      '</div>'
    );
  }

  eventCalendar.innerHTML = cells.join('');
}

function renderEventList() {
  if (!eventList) {
    return;
  }

  if (!eventBookings.length) {
    eventList.innerHTML = '<div class="muted">Sin eventos registrados.</div>';
    return;
  }

  eventList.innerHTML = eventBookings.slice(0, 20).map(event =>
    '<div class="event-card" onclick="openEventDetail(\'' + escapeHtml(event.id) + '\')">' +
      '<div class="event-card-head">' +
        '<div>' +
          '<strong>' + escapeHtml(event.eventDate || '') + ' · ' + escapeHtml(event.hallName || event.hallCode || '') + '</strong>' +
          '<div>' + escapeHtml(event.eventName || event.client || 'Evento') + '</div>' +
          '<div class="muted">' + escapeHtml(event.client || '') + ' · ' + eventStatusLabel(event.status) + '</div>' +
        '</div>' +
        '<div style="min-width:160px">' +
          '<div class="muted">' + formatMoney(event.paidAmount || 0) + ' / ' + formatMoney(event.totalAmount || 0) + '</div>' +
          '<div class="payment-bar"><span style="width:' + eventPercent(event) + '%"></span></div>' +
        '</div>' +
      '</div>' +
      '<div class="summary-chips" style="margin-top:8px">' +
        (event.vouchers || []).map(voucher =>
          '<a class="chip" target="_blank" href="' + escapeHtml(voucher.url || '#') + '">Comprobante ' + escapeHtml(voucher.id || '') + '</a>'
        ).join('') +
      '</div>' +
      '<div class="voucher-row">' +
        '<input id="voucherFile_' + escapeHtml(event.id) + '" type="file" accept="image/*,application/pdf" multiple onclick="event.stopPropagation()">' +
        '<input id="voucherAmount_' + escapeHtml(event.id) + '" type="number" min="0" step="0.01" placeholder="Monto" onclick="event.stopPropagation()">' +
        '<input id="voucherNotes_' + escapeHtml(event.id) + '" placeholder="Nota del comprobante" onclick="event.stopPropagation()">' +
        '<button onclick="event.stopPropagation(); uploadEventVoucher(\'' + escapeHtml(event.id) + '\')">Subir comprobante(s)</button>' +
      '</div>' +
    '</div>'
  ).join('');
}

function openEventDetail(eventId) {
  const event = eventBookings.find(item => String(item.id) === String(eventId));
  if (!event) {
    return;
  }

  const percent = eventPercent(event);
  pendingEventDetailId = event.id;
  eventDetailTitle.textContent = event.eventName || event.client || 'Evento';
  eventDetailSubtitle.textContent = (event.eventDate || '-') + ' · ' + (event.hallName || event.hallCode || '-') + ' · ' + eventStatusLabel(event.status);
  eventDetailBody.innerHTML =
    '<div class="event-detail-grid">' +
      '<div class="event-detail-box"><span>Cliente</span><strong>' + escapeHtml(event.client || '-') + '</strong></div>' +
      '<div class="event-detail-box"><span>Contacto</span><strong>' + escapeHtml(event.contact || '-') + '</strong></div>' +
      '<div class="event-detail-box"><span>Fecha</span><strong>' + escapeHtml(event.eventDate || '-') + '</strong></div>' +
      '<div class="event-detail-box"><span>Salon</span><strong>' + escapeHtml(event.hallName || event.hallCode || '-') + '</strong></div>' +
      '<div class="event-detail-box"><span>Estado</span><strong>' + escapeHtml(eventStatusLabel(event.status)) + '</strong></div>' +
      '<div class="event-detail-box"><span>Cotizacion</span><strong>' + escapeHtml(event.quotationId || '-') + '</strong></div>' +
      '<div class="event-detail-box"><span>Total</span><strong>' + formatMoney(event.totalAmount || 0) + '</strong></div>' +
      '<div class="event-detail-box"><span>Pagado</span><strong>' + formatMoney(event.paidAmount || 0) + ' (' + Math.round(percent) + '%)</strong><div class="payment-bar"><span style="width:' + percent + '%"></span></div></div>' +
    '</div>' +
    '<div class="event-detail-box"><span>Notas</span><div>' + escapeHtml(event.notes || 'Sin notas') + '</div></div>' +
    '<h3 style="margin:16px 0 8px">Editar evento</h3>' +
    '<div class="reservation-edit-grid">' +
      '<label>Cliente<input id="eventEditClient" value="' + escapeHtml(event.client || '') + '"></label>' +
      '<label>Contacto<input id="eventEditContact" value="' + escapeHtml(event.contact || '') + '"></label>' +
      '<label>Evento<input id="eventEditName" value="' + escapeHtml(event.eventName || '') + '"></label>' +
      '<label>Fecha<input id="eventEditDate" type="date" value="' + escapeHtml(event.eventDate || '') + '" onchange="renderEventEditAvailability()"></label>' +
      '<label>Salon<select id="eventEditHall" onchange="renderEventEditAvailability()">' + eventHalls.map(hall => '<option value="' + escapeHtml(hall.code) + '"' + (hall.code === event.hallCode ? ' selected' : '') + '>' + escapeHtml(hall.name) + '</option>').join('') + '</select></label>' +
      '<label>Estado<select id="eventEditStatus" onchange="renderEventEditAvailability()">' +
        '<option value="cotizacion"' + (event.status === 'cotizacion' ? ' selected' : '') + '>En cotizacion</option>' +
        '<option value="apartado"' + (event.status === 'apartado' ? ' selected' : '') + '>Apartado</option>' +
        '<option value="pago_completo"' + (event.status === 'pago_completo' ? ' selected' : '') + '>Pago completo</option>' +
      '</select></label>' +
      '<label>Total<input id="eventEditTotal" type="number" min="0" step="0.01" value="' + escapeHtml(event.totalAmount || 0) + '"></label>' +
      '<label>Pagado<input id="eventEditPaid" type="number" min="0" step="0.01" value="' + escapeHtml(event.paidAmount || 0) + '"></label>' +
      '<label class="wide">Notas<textarea id="eventEditNotes" rows="3">' + escapeHtml(event.notes || '') + '</textarea></label>' +
    '</div>' +
    '<div id="eventEditAvailability" class="muted" style="margin-top:10px"></div>' +
    '<div id="eventEditStatusText" class="muted" style="margin-top:10px"></div>' +
    '<div class="confirm-actions"><button class="primary" onclick="saveEventDetailEdit()">Guardar cambios</button></div>' +
    '<h3 style="margin:16px 0 8px">Comprobantes</h3>' +
    ((event.vouchers || []).length
      ? '<div class="voucher-list">' + (event.vouchers || []).map(voucher =>
        '<div class="voucher-item">' +
          '<div><strong>' + escapeHtml(voucher.fileName || ('Comprobante ' + voucher.id)) + '</strong><div class="muted">' + formatMoney(voucher.amount || 0) + ' · ' + escapeHtml(voucher.notes || '') + '</div></div>' +
          '<a class="chip" target="_blank" href="' + escapeHtml(voucher.url || '#') + '">Ver</a>' +
        '</div>'
      ).join('') + '</div>'
      : '<div class="muted">Sin comprobantes guardados.</div>');

  eventDetailModalBackdrop.classList.remove('hidden');
  document.body.classList.add('app-modal-open');
  renderEventEditAvailability();
}

function renderEventEditAvailability() {
  const target = document.getElementById('eventEditAvailability');
  if (!target) {
    return null;
  }
  const conflict = findEventConflict(
    eventEditDate.value,
    eventEditHall.value,
    pendingEventDetailId
  );
  if (
    ['apartado', 'pago_completo'].includes(eventEditStatus.value)
    &&
    conflict
  ) {
    target.textContent = 'No disponible: ya existe ' + (conflict.eventName || conflict.client || 'otro evento') + ' en ese salon y fecha.';
    target.className = 'availability-bad';
    return conflict;
  }
  target.textContent = 'Disponible para este estado/fecha/salon.';
  target.className = 'availability-ok';
  return null;
}

async function saveEventDetailEdit() {
  const event = eventBookings.find(item => String(item.id) === String(pendingEventDetailId));
  if (!event) {
    return;
  }
  const statusText = document.getElementById('eventEditStatusText');
  if (
    ['apartado', 'pago_completo'].includes(eventEditStatus.value)
    &&
    renderEventEditAvailability()
  ) {
    statusText.textContent = 'No se puede guardar: salon no disponible.';
    return;
  }
  statusText.textContent = 'Guardando cambios...';
  try {
    await saveEventPayload({
      id: event.id,
      quotationId: event.quotationId,
      client: eventEditClient.value.trim(),
      contact: eventEditContact.value.trim(),
      eventName: eventEditName.value.trim(),
      eventDate: eventEditDate.value,
      hallCode: eventEditHall.value,
      status: eventEditStatus.value,
      totalAmount: Number(eventEditTotal.value || 0),
      paidAmount: Number(eventEditPaid.value || 0),
      notes: eventEditNotes.value.trim()
    });
    closeEventDetailModal();
  } catch (error) {
    statusText.textContent = error.message || 'No se pudo guardar.';
  }
}

function closeEventDetailModal() {
  eventDetailModalBackdrop.classList.add('hidden');
  pendingEventDetailId = null;

  if (
    dayModalBackdrop.classList.contains('hidden') &&
    quoteMenuModalBackdrop.classList.contains('hidden') &&
    quoteEventModalBackdrop.classList.contains('hidden') &&
    helpModalBackdrop.classList.contains('hidden')
  ) {
    document.body.classList.remove('app-modal-open');
  }
}

async function saveEventPayload(payload) {
  const response = await fetch('/api/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.error || 'No se pudo guardar el evento.');
  }
  await loadDashboard();
  showView('events');
  return data.event;
}

async function saveManualEvent() {
  try {
    eventStatusText.textContent = 'Guardando evento...';
    if (
      ['apartado', 'pago_completo'].includes(eventStatus.value)
      &&
      renderEventAvailability('manual')
    ) {
      eventStatusText.textContent = 'No se puede guardar: el salon no esta disponible.';
      return;
    }
    await saveEventPayload({
      client: eventClient.value.trim(),
      contact: eventContact.value.trim(),
      eventName: eventName.value.trim(),
      eventDate: eventDate.value,
      hallCode: eventHall.value,
      status: eventStatus.value,
      totalAmount: Number(eventTotal.value || 0),
      paidAmount: Number(eventPaid.value || 0),
      notes: eventNotes.value.trim()
    });
    eventStatusText.textContent = 'Evento guardado.';
    eventClient.value = '';
    eventContact.value = '';
    eventName.value = '';
    eventDate.value = '';
    eventTotal.value = '';
    eventPaid.value = '';
    eventNotes.value = '';
  } catch (error) {
    eventStatusText.textContent = error.message || 'No se pudo guardar.';
  }
}

function createEventFromQuotation(quotationId) {
  const quote = (dashboardData?.quotations || []).find(row => row.id === quotationId);
  if (!quote) {
    alert('No encontre la cotizacion.');
    return;
  }

  pendingQuoteEvent = quote;
  renderHallSelects();
  quoteEventModalTitle.textContent = 'Apartar salon: ' + quote.id;
  quoteEventModalSubtitle.textContent = (quote.client || 'Sin cliente') + ' · ' + (quote.eventName || quote.headline || 'Sin evento');
  quoteEventModalDate.value = quote.eventDate || quoteEventDate.value || '';
  quoteEventModalHall.value = quote.hallCode || quoteHall.value || '';
  quoteEventModalStatus.value = quote.eventDate || quote.hallCode ? 'apartado' : 'cotizacion';
  quoteEventModalTotal.value = Number(quote.total || 0);
  quoteEventModalPaid.value = 0;
  quoteEventModalNotes.value = quote.notes || '';
  quoteEventModalStatusText.textContent = '';
  renderEventAvailability('quote');
  quoteEventModalBackdrop.classList.remove('hidden');
  document.body.classList.add('app-modal-open');
}

function closeQuoteEventModal() {
  quoteEventModalBackdrop.classList.add('hidden');
  pendingQuoteEvent = null;

  if (
    dayModalBackdrop.classList.contains('hidden') &&
    quoteMenuModalBackdrop.classList.contains('hidden') &&
    helpModalBackdrop.classList.contains('hidden')
  ) {
    document.body.classList.remove('app-modal-open');
  }
}

async function saveQuoteEventFromModal() {
  const quote = pendingQuoteEvent;
  if (!quote) {
    closeQuoteEventModal();
    return;
  }

  if (!quoteEventModalDate.value || !quoteEventModalHall.value) {
    quoteEventModalStatusText.textContent = 'Selecciona salon y fecha para apartar.';
    return;
  }

  if (
    ['apartado', 'pago_completo'].includes(quoteEventModalStatus.value)
    &&
    renderEventAvailability('quote')
  ) {
    quoteEventModalStatusText.textContent = 'No se puede apartar: el salon no esta disponible.';
    return;
  }

  quoteEventModalStatusText.textContent = 'Guardando evento...';
  try {
    await saveEventPayload({
      quotationId: quote.id,
      client: quote.client,
      contact: quote.contact,
      eventName: quote.eventName || quote.headline,
      eventDate: quoteEventModalDate.value,
      hallCode: quoteEventModalHall.value,
      status: quoteEventModalStatus.value,
      totalAmount: Number(quoteEventModalTotal.value || quote.total || 0),
      paidAmount: Number(quoteEventModalPaid.value || 0),
      notes: quoteEventModalNotes.value.trim()
    });
    closeQuoteEventModal();
  } catch (error) {
    quoteEventModalStatusText.textContent = error.message || 'No se pudo apartar.';
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadEventVoucher(eventId) {
  const fileInput = document.getElementById('voucherFile_' + eventId);
  const amountInput = document.getElementById('voucherAmount_' + eventId);
  const notesInput = document.getElementById('voucherNotes_' + eventId);
  const files = Array.from(fileInput?.files || []);
  if (!files.length) {
    alert('Selecciona una o varias imagenes/comprobantes.');
    return;
  }

  for (const file of files) {
    const dataUrl = await readFileAsDataUrl(file);
    const response = await fetch('/api/events/vouchers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        eventId,
        fileName: file.name,
        dataUrl,
        amount: Number(amountInput?.value || 0),
        notes: notesInput?.value || ''
      })
    });
    const data = await response.json();
    if (!data.ok) {
      alert(data.error || 'No se pudo subir el comprobante ' + file.name + '.');
      return;
    }
  }

  await loadDashboard();
  showView('events');
}

