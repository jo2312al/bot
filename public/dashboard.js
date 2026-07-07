let dashboardData = null;
let calendarDate = new Date();
let selectedStart = "";
let selectedEnd = "";
let pendingDeleteReservation = null;
let pendingEditReservation = null;
let pendingArrivalReservation = null;
let pendingGroupReservations = [];
let pendingRackRoom = null;
let pendingPreassignRoom = null;
let selectedPreassignCandidateKey = "";
let activeModalIsoDate = "";
let reportsData = null;
let quoteSectionsData = [
  {
    title: 'Hospedaje',
    category: 'habitaciones',
    quantity: 1,
    unitPrice: 700,
    includes: 'Recepcion 24 horas\\nEstacionamiento\\nInternet\\nTelevision por cable\\nAgua fria y caliente'
  }
];
let quoteMenuItems = [];
let eventHalls = [];
let eventBookings = [];
let roomBlocks = [];
let pendingQuoteEvent = null;
let pendingEventDetailId = null;
let manualRateLocked = false;
let editRateLocked = false;
const dashboardBootstrap = window.DASHBOARD_BOOTSTRAP || {};
const hotelRateOptions = Array.isArray(dashboardBootstrap.hotelRateOptions)
  ? dashboardBootstrap.hotelRateOptions
  : [];
const hotelAutoRateValues = new Set(['', '$600', '600', '$650', '650', '$700', '700', '$800', '800', '$900', '900', '$1,000', '$1000', '1,000', '1000']);

function renderHotelRateOptions(selectedValue) {
  const selected = String(selectedValue || '').trim();
  const options = hotelRateOptions.map(option =>
    '<option value="' + escapeHtml(option.value) + '"' + (option.value === selected ? ' selected' : '') + '>' + escapeHtml(option.label) + '</option>'
  );

  if (selected && !hotelRateOptions.some(option => option.value === selected)) {
    options.unshift('<option value="' + escapeHtml(selected) + '" selected>' + escapeHtml(selected) + ' (tarifa guardada)</option>');
  }

  return '<option value="">Sin tarifa</option>' + options.join('');
}

function normalizeClientRoomType(value) {
  const clean = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (clean.includes('suite') && clean.includes('king')) return 'Suite King';
  if (clean.includes('suite')) return 'Doble Suite';
  if (clean.includes('king')) return 'King';
  if (clean.includes('doble') || clean.includes('matrimonial') || clean.includes('2 camas')) return 'Doble';
  return String(value || '').trim();
}

function clientAdultsPerRoom(adults, rooms) {
  return Math.ceil(Math.max(Number(adults || 0), 0) / Math.max(Number(rooms || 1), 1));
}

function clientRateBase(value) {
  const text = String(value || '').trim().replace(/,/g, '');

  if (text === '$600' || text === '600') return 600;
  if (text === '$650' || text === '650') return 650;
  if (text === '$750' || text === '750' || text === '$850' || text === '850') return 650;
  return null;
}

function clientIsMananeraRate(value) {
  const text = String(value || '').trim().replace(/,/g, '');
  return text === '$900' || text === '900' || text === '$1000' || text === '1000';
}

function clientMoneyText(amount) {
  return '$' + Number(amount || 0).toLocaleString('en-US');
}

function calculateClientAutoRate(tipo, adultos, habitaciones) {
  const type = normalizeClientRoomType(tipo);
  const selectedBase = clientRateBase(arguments.length > 3 ? arguments[3] : '');

  if (type === 'King') return selectedBase ? clientMoneyText(selectedBase) : '$700';
  if (type === 'Suite King' || type === 'Doble Suite') return selectedBase ? clientMoneyText(selectedBase) : '$800';
  if (type === 'Doble') {
    const perRoom = clientAdultsPerRoom(adultos, habitaciones);
    if (perRoom >= 3) return '$800';
    return clientMoneyText(selectedBase || 700);
  }

  return '';
}

function calculateClientExtraAdults(tipo, adultos, habitaciones) {
  if (normalizeClientRoomType(tipo) !== 'Doble') {
    return { extraAdults: 0, extraAmount: 0 };
  }

  const perRoom = clientAdultsPerRoom(adultos, habitaciones);
  return {
    extraAdults: 0,
    extraAmount: 0
  };
}

function validateClientOccupancy(tipo, adultos, habitaciones) {
  const type = normalizeClientRoomType(tipo);
  const perRoom = clientAdultsPerRoom(adultos, habitaciones);
  const max = type === 'King'
    ? 2
    : (type === 'Doble' || type === 'Suite King' || type === 'Doble Suite' ? 4 : 0);

  return !max || perRoom <= max;
}

function shouldAutoUpdateRate(value, locked) {
  if (clientIsMananeraRate(value)) {
    return false;
  }

  return !locked || hotelAutoRateValues.has(String(value || '').trim());
}

function rememberManualRateChoice() {
  manualRateLocked = clientIsMananeraRate(manualTarifa.value) || !hotelAutoRateValues.has(String(manualTarifa.value || '').trim());
}

function rememberEditRateChoice() {
  editRateLocked = clientIsMananeraRate(editReservationRate.value) || !hotelAutoRateValues.has(String(editReservationRate.value || '').trim());
}

function refreshManualRate() {
  const rate = calculateClientAutoRate(manualTipo.value, manualAdultos.value, manualHabitaciones.value, manualTarifa.value);

  if (rate && shouldAutoUpdateRate(manualTarifa.value, manualRateLocked)) {
    manualTarifa.value = rate;
    manualRateLocked = false;
  }

  if (!validateClientOccupancy(manualTipo.value, manualAdultos.value, manualHabitaciones.value)) {
    manualReservationStatus.textContent = 'La ocupacion excede el maximo para este tipo. Niños no cuentan para extra.';
    return;
  }

  const extra = calculateClientExtraAdults(manualTipo.value, manualAdultos.value, manualHabitaciones.value);
  manualReservationStatus.textContent = extra.extraAmount
    ? 'Extra adulto(s): ' + extra.extraAdults + ' / +$' + extra.extraAmount + '. Se agregara al mensaje y guardado; la tarifa base no cambia.'
    : '';
}

function refreshEditRate() {
  const rate = calculateClientAutoRate(editReservationType.value, editReservationAdults.value, editReservationRooms.value, editReservationRate.value);

  if (rate && shouldAutoUpdateRate(editReservationRate.value, editRateLocked)) {
    editReservationRate.value = rate;
    editRateLocked = false;
  }
}

const helpTopics = {
  today: {
    title: 'Vista de hoy',
    body: 'Es el tablero rapido para recepcion. Junta llegadas, ocupacion, eventos del dia, pagos pendientes y habitaciones bloqueadas.\\n\\nUsalo al iniciar turno para saber que se espera hoy sin navegar por todos los tabs.'
  },
  search: {
    title: 'Buscador global',
    body: 'Busca en reservas, historial de huespedes, eventos, cotizaciones y bloqueos.\\n\\nPuedes escribir nombre, telefono, folio, habitacion, salon o clave de cotizacion. Si hay historial en MySQL, tambien muestra estancias anteriores del huesped.'
  },
  whatsapp: {
    title: 'Estado de WhatsApp',
    body: 'Aqui ves si cada bot esta conectado o esperando QR.\\n\\nBot principal: atiende reservas y mensajes normales.\\nBot nocturno: se usa fuera de horario si esta configurado.\\n\\nSi aparece QR, escanealo desde WhatsApp para volver a conectar esa sesion. Si dice conectado, no tienes que hacer nada.'
  },
  overbooking: {
    title: 'Alertas de sobreventa',
    body: 'Te avisa cuando una fecha supera el limite por tipo de habitacion.\\n\\nEjemplo: si hay mas Dobles reservadas que el limite disponible, aparece aqui.\\n\\nUsalo antes de aceptar grupos grandes o importar Excel para detectar fechas peligrosas.'
  },
  arrivals: {
    title: 'Llegadas de hoy',
    body: 'Muestra reservas cuya entrada es hoy.\\n\\nDesde cada reserva puedes registrar llegada y, si quieres, asignar habitacion. Al asignarla, el rack marca esa habitacion como ocupada.\\n\\nNo manda aviso al grupo por llegada; solo actualiza el sistema.'
  },
  rackGlobal: {
    title: 'Rack global',
    body: 'Resume el ultimo rack guardado: ocupadas, vacias limpias, vacias sucias y bloqueadas.\\n\\nLos colores por tipo ayudan a ubicar rapido King, Dobles y Suites.\\n\\nSi el rack no coincide con recepcion, importa el CSV actualizado en el tab Rack.'
  },
  upcoming: {
    title: 'Proximas reservas por fecha',
    body: 'Lista las fechas con reservas proximas y su ocupacion.\\n\\nDa una vista rapida sin abrir todo el calendario. Sirve para revisar fines de semana, grupos o dias con carga alta.'
  },
  calendar: {
    title: 'Calendario de reservas',
    body: 'Cada dia muestra cuantas habitaciones estan reservadas de las 69.\\n\\nDa clic en Ver para abrir el detalle del dia: huespedes, tipo, hora, telefono, tarifa, notas, llegada y habitacion asignada.\\n\\nManual/Excel y Bot se separan para saber de donde vino cada reserva.'
  },
  preassign: {
    title: 'Preasignacion',
    body: 'Usalo antes de un dia lleno. Elige la fecha, da clic en una habitacion y asigna una reserva que llega, una continuacion o un huesped sin reservacion.\\n\\nReglas: King maximo 2 personas; Doble y suites maximo 4 personas. La impresion deja una hoja clara para recepcion.'
  },
  reservations: {
    title: 'Agregar reservas',
    body: 'Captura manual: llena huesped, telefono, entrada, noches, habitaciones, personas, tipo, hora, tarifa y nota.\\n\\nLa salida se calcula automaticamente con entrada + noches. Importar CSV: pega o sube un archivo con reservas; el sistema las convierte al calendario.\\n\\nDespues de agregar, puedes decidir si mandar la reserva al grupo. Si tiene nota, tambien se incluye.'
  },
  reservationList: {
    title: 'Reservas registradas',
    body: 'Aqui aparecen las reservas del bot tradicional.\\n\\nPuedes guardar notas internas, cancelar folios o registrar llegada.\\n\\nLas notas son internas del dashboard y ayudan a recepcion: anticipo, llegada tarde, peticiones, etc.'
  },
  quotes: {
    title: 'Cotizaciones',
    body: 'Sirve para crear documentos de cotizacion listos para imprimir o guardar como PDF.\\n\\n1. Llena cliente/contacto/evento.\\n2. Elige fecha y salon si aplica.\\n3. Agrega apartados: salon, menu, hospedaje u otros.\\n4. Guarda y abre el PDF.\\n\\nSi la cotizacion se confirma, usa Apartar salon para mandarla al tab Eventos.'
  },
  quoteClient: {
    title: 'Datos del cliente en cotizacion',
    body: 'Cliente y contacto identifican a quien se le entrega la cotizacion.\\n\\nFecha evento y Salon son importantes si despues quieres apartar el salon desde esa cotizacion.\\n\\nVigencia indica hasta cuando respetas precios o disponibilidad.'
  },
  quoteDocument: {
    title: 'Presentacion del documento',
    body: 'Visual hotel: formato mas comercial, con estilo de folleto.\\n\\nFormal: mas sobrio, tipo carta/cotizacion.\\n\\nFechas/estancia se imprime como texto visible para el cliente. Personas ayuda a calcular menus por persona.'
  },
  quoteSections: {
    title: 'Apartados de cotizacion',
    body: 'Cada apartado suma al total.\\n\\nHospedaje: habitaciones o noches.\\nSalon: renta o paquete del salon.\\nMenu/persona: alimentos; si activas servicio %, se calcula sobre alimentos.\\nOtro: cargos especiales, extras o descuentos positivos/negativos si los manejas como linea.'
  },
  events: {
    title: 'Eventos y salones',
    body: 'Calendario operativo de Margaritas, Tulipanes y Girasoles.\\n\\nEstados:\\n- En cotizacion: aun no confirmado.\\n- Apartado: fecha/salon reservado con anticipo o confirmacion.\\n- Pago completo: liquidado.\\n\\nLa barra muestra porcentaje pagado contra el total. Los comprobantes quedan guardados en el evento.'
  },
  manualEvent: {
    title: 'Apartar evento desde cero',
    body: 'Usalo cuando el evento no viene de una cotizacion guardada.\\n\\nLlena cliente, fecha, salon, estado, total y pagado.\\n\\nDespues puedes subir imagenes de vouchers o comprobantes. Si ya existe una cotizacion, es mejor apartar desde la cotizacion para que quede vinculada.'
  },
  rack: {
    title: 'Rack',
    body: 'Importa el CSV del sistema para actualizar ocupadas, vacias y bloqueadas.\\n\\nTambien puedes analizar una foto del rack, pero el CSV es mas confiable.\\n\\nCuando registras llegada con habitacion, el sistema puede marcar esa habitacion como ocupada en el ultimo rack.'
  },
  roomBlocks: {
    title: 'Bloqueos de habitacion',
    body: 'Sirve para sacar una habitacion de operacion por mantenimiento, limpieza profunda, clima, pintura o cualquier pendiente.\\n\\nEl bloqueo queda con rango de fechas y notas para que recepcion y mantenimiento sepan por que no debe asignarse.'
  },
  reports: {
    title: 'Reportes',
    body: 'Reportes operativos para administracion.\\n\\nOcupacion diaria: cuartos ocupados por fecha.\\nRotacion: dias ocupados por habitacion en el mes.\\nMantenimiento/notas: limpieza profunda, climas, pintura o pendientes por habitacion.\\n\\nSirve para decidir que habitaciones rotar y cuales requieren mantenimiento.'
  }
};

function openHelp(topic) {
  const help = helpTopics[topic] || {
    title: 'Ayuda',
    body: 'Sin ayuda registrada para esta seccion.'
  };
  helpModalTitle.textContent = help.title;
  helpModalBody.textContent = help.body;
  helpModalBackdrop.classList.remove('hidden');
}

function closeHelp() {
  helpModalBackdrop.classList.add('hidden');
}

async function loadBotStatus() {
  try {
    const response = await fetch('/api/bot-status');
    const status = await response.json();
    renderBotStatuses(status.instances || [status]);
  } catch (error) {
    botStatusList.innerHTML = '<div class="muted">No se pudo leer el estado de WhatsApp: ' + escapeHtml(error.message || '') + '</div>';
  }
}

function renderBotStatuses(instances) {
  const labels = {
    open: 'Conectado',
    qr: 'Esperando escaneo de QR',
    close: 'Desconectado',
    unknown: 'Sin estado'
  };

  botStatusList.innerHTML = instances.map(instance => {
    const connection = instance.connection || 'unknown';
    const availability = instance.availability === 'inactive'
      ? 'Fuera de horario'
      : 'Activo';
    const qr = instance.qrDataUrl
      ? '<div class="qr-box"><img src="' + instance.qrDataUrl + '" alt="QR de ' + escapeHtml(instance.label || instance.id || 'WhatsApp') + '"><div class="muted">Escanea este codigo desde WhatsApp.</div></div>'
      : '';

    return '<div class="bot-status-card">' +
      '<div class="bot-status">' +
        '<div>' +
          '<strong>' + escapeHtml(instance.label || instance.id || 'Bot') + '</strong>' +
          '<div class="status-row"><span class="status-dot ' + escapeHtml(connection) + '"></span><span>' + escapeHtml(labels[connection] || connection) + '</span><span class="pill">' + escapeHtml(availability) + '</span></div>' +
          '<div class="muted">' + escapeHtml(instance.schedule || instance.detail || '') + '</div>' +
          '<div class="muted">' + (instance.updatedAt ? 'Actualizado: ' + escapeHtml(new Date(instance.updatedAt).toLocaleString()) : '') + '</div>' +
        '</div>' +
        qr +
      '</div>' +
    '</div>';
  }).join('');
}

async function loadDashboard() {
  const response = await fetch('/api/summary');
  const data = await response.json();
  dashboardData = data;

  if (!closeStart.value) {
    closeStart.value = data.today;
    closeEnd.value = data.today;
    selectedStart = data.today;
    selectedEnd = data.today;
    calendarDate = isoToDate(data.today);
  }

  activeCount.textContent = data.totals.active;
  groupReservationCount.textContent = data.totals.groupReservations;
  todayReservationCount.textContent = data.todayReservations?.reservations || 0;
  todayReservationRooms.textContent =
    (data.todayReservations?.occupied || 0) +
    '/' +
    (data.totalRooms || 69) +
    ' habitaciones';
  canceledCount.textContent = data.totals.canceled;
  limits.innerHTML = Object.entries(data.limits)
    .map(([type, limit]) => '<span><b>' + escapeHtml(type) + '</b><b>' + limit + '</b></span>')
    .join('');
  updatedAt.textContent = 'Actualizado: ' + new Date(data.generatedAt).toLocaleString();
  if (!reportMonth.value) {
    reportMonth.value = String(data.today || '').slice(0, 7);
  }
  if (!roomEventDate.value) {
    roomEventDate.value = data.today;
  }
  renderRackDashboard(data.rackStatus);
  renderRackRoomGrid(data.rackStatus);
  overbookingAlerts.innerHTML = renderOverbookingAlerts(data.overbookingAlerts || []);
  todayArrivals.innerHTML = renderTodayArrivals(data.todayArrivals || []);
  quoteMenuItems = Array.isArray(data.quotationMenu) ? data.quotationMenu : [];
  eventHalls = Array.isArray(data.eventHalls) ? data.eventHalls : [];
  eventBookings = Array.isArray(data.eventBookings) ? data.eventBookings : [];
  roomBlocks = Array.isArray(data.roomBlocks) ? data.roomBlocks : [];
  if (!blockStart.value) {
    blockStart.value = data.today;
    blockEnd.value = data.today;
  }
  renderQuoteMenuOptions();
  renderQuoteMenuEditor();
  renderQuoteSections();
  renderQuotationList(data.quotations || []);
  renderHallSelects();
  renderEventAlerts();
  renderEventCalendar();
  renderEventList();
  renderTodayView();
  renderRoomBlocks();
  occupancy.innerHTML = renderOccupancy(data.occupancy);
  reservations.innerHTML = renderReservations(data.reservations);
  renderManualCheckoutPreview();
  updateSelectionSummary();
  renderCalendar();
  renderGroupReservationDetail(closeStart.value || data.today);
  renderPreassignmentBoard();
}

function renderTodayView() {
  if (!dashboardData) {
    todayView.innerHTML = '<div class="muted">Cargando vista de hoy...</div>';
    return;
  }

  const todayIso = dashboardData.today;
  const todayDisplay = isoToDisplay(todayIso);
  const arrivals = dashboardData.todayArrivals || [];
  const departures = getDeparturesForIsoDate(todayIso);
  const todayEvents = eventBookings.filter(event => event.eventDate === todayIso);
  const activeBlocks = roomBlocks.filter(block =>
    block.status === 'activo' &&
    block.startDate <= todayIso &&
    block.endDate >= todayIso
  );
  const paymentAlerts = eventBookings
    .filter(event =>
      event.status !== 'pago_completo' &&
      Number(event.totalAmount || 0) > Number(event.paidAmount || 0)
    )
    .sort((a, b) => String(a.eventDate || '').localeCompare(String(b.eventDate || '')))
    .slice(0, 6);

  todayView.innerHTML =
    '<div class="report-kpis">' +
      renderReportKpi('Fecha', todayDisplay) +
      renderReportKpi('Llegadas', arrivals.length) +
      renderReportKpi('Salidas', departures.length) +
      renderReportKpi('Ocupacion calendario', (dashboardData.todayReservations?.occupied || 0) + '/' + (dashboardData.totalRooms || 69)) +
      renderReportKpi('Eventos hoy', todayEvents.length) +
    '</div>' +
    '<div class="today-grid">' +
      renderTodayCard('Llegadas de hoy', arrivals.length ? arrivals.slice(0, 8).map(renderArrivalMiniItem).join('') : '<div class="muted">Sin llegadas registradas para hoy.</div>') +
      renderTodayCard('Salidas de hoy', departures.length ? departures.slice(0, 10).map(renderDepartureMiniItem).join('') : '<div class="muted">Sin salidas calculadas para hoy.</div>') +
      renderTodayCard('Eventos de hoy', todayEvents.length ? todayEvents.map(renderEventMiniItem).join('') : '<div class="muted">Sin eventos hoy.</div>') +
      renderTodayCard('Pagos pendientes', paymentAlerts.length ? paymentAlerts.map(renderPaymentMiniItem).join('') : '<div class="muted">Sin saldos pendientes importantes.</div>') +
      renderTodayCard('Bloqueos activos', activeBlocks.length ? activeBlocks.map(renderBlockMiniItem).join('') : '<div class="muted">Sin habitaciones bloqueadas hoy.</div>') +
    '</div>';
}

function renderTodayCard(title, body) {
  return '<div class="today-card"><h3>' + escapeHtml(title) + '</h3><div class="mini-list">' + body + '</div></div>';
}

function renderArrivalMiniItem(reservation) {
  return '<div class="mini-item">' +
    '<strong>' + escapeHtml(reservation.nombre || reservation.name || 'Reserva') + '</strong>' +
    '<div class="muted">' + escapeHtml(reservation.habitaciones || 1) + ' hab · ' + escapeHtml(reservation.tipo || '-') + ' · ' + escapeHtml(reservation.hora || '-') + '</div>' +
    '<div>' + escapeHtml(reservation.telefono || '') + '</div>' +
  '</div>';
}

function getReservationCheckoutIso(reservation) {
  const dates = Array.isArray(reservation?.dates)
    ? reservation.dates
    : [reservation?.fecha].filter(Boolean);
  const lastDisplay = dates[dates.length - 1] || '';
  const lastIso = displayToIsoClient(lastDisplay) || displayToIsoClient(reservation?.fecha || '');

  if (!lastIso) {
    return '';
  }

  const checkout = isoToDate(lastIso);
  checkout.setDate(checkout.getDate() + 1);
  return dateToIso(checkout);
}

function getDeparturesForIsoDate(isoDate) {
  return (dashboardData?.groupReservations || [])
    .filter(reservation =>
      reservation.status !== 'cancelada'
      &&
      getReservationCheckoutIso(reservation) === isoDate
    )
    .sort((left, right) =>
      String(left.roomNumber || '').localeCompare(String(right.roomNumber || ''))
      ||
      String(left.nombre || '').localeCompare(String(right.nombre || ''))
    );
}

function renderDepartureMiniItem(reservation) {
  const checkoutIso = getReservationCheckoutIso(reservation);
  return '<div class="mini-item">' +
    '<strong>' + escapeHtml(reservation.nombre || 'Sin nombre') + '</strong>' +
    '<div class="muted">Salida ' + escapeHtml(isoToDisplay(checkoutIso) || '-') + ' Â· Hab ' + escapeHtml(reservation.roomNumber || '-') + ' Â· ' + escapeHtml(reservation.tipo || '-') + '</div>' +
    '<div>' + escapeHtml(reservation.telefono || '') + (reservation.note ? ' Â· ' + escapeHtml(reservation.note) : '') + '</div>' +
  '</div>';
}

function renderEventMiniItem(event) {
  return '<div class="mini-item">' +
    '<strong>' + escapeHtml(event.eventName || event.client || 'Evento') + '</strong>' +
    '<div class="muted">' + escapeHtml(event.hallName || '-') + ' · ' + escapeHtml(event.status || '-') + '</div>' +
    '<div>' + formatMoney(event.paidAmount || 0) + ' / ' + formatMoney(event.totalAmount || 0) + '</div>' +
  '</div>';
}

function renderPaymentMiniItem(event) {
  const pending = Math.max(Number(event.totalAmount || 0) - Number(event.paidAmount || 0), 0);
  return '<div class="mini-item">' +
    '<strong>' + escapeHtml(event.eventName || event.client || 'Evento') + '</strong>' +
    '<div class="muted">' + escapeHtml(isoToDisplay(event.eventDate || '') || '-') + ' · ' + escapeHtml(event.hallName || '-') + '</div>' +
    '<div>Pendiente: <strong>' + formatMoney(pending) + '</strong></div>' +
  '</div>';
}

function renderBlockMiniItem(block) {
  return '<div class="mini-item">' +
    '<strong>Hab ' + escapeHtml(block.roomNumber || '-') + '</strong>' +
    '<div class="muted">' + escapeHtml(isoToDisplay(block.startDate || '') || '-') + ' al ' + escapeHtml(isoToDisplay(block.endDate || '') || '-') + '</div>' +
    '<div>' + escapeHtml(block.reason || '-') + '</div>' +
  '</div>';
}

function showView(name) {
  ['today', 'main', 'calendar', 'preassign', 'reservations', 'quotes', 'events', 'rack', 'reports'].forEach(view => {
    const panel = document.getElementById('view-' + view);
    const tab = document.getElementById('tab-' + view);

    if (panel) {
      panel.classList.toggle('hidden', view !== name);
    }

    if (tab) {
      tab.classList.toggle('active', view === name);
    }
  });

  if (name === 'reports') {
    loadReports();
  }
  if (name === 'preassign') {
    renderPreassignmentBoard();
  }
}

function handleGlobalSearchKey(event) {
  if (event.key === 'Enter') {
    runGlobalSearch();
  }
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

  const response = await fetch('/api/search?q=' + encodeURIComponent(query));
  const data = await response.json();

  if (!data.ok) {
    globalSearchResults.innerHTML = '<div class="muted">' + escapeHtml(data.error || 'No se pudo buscar') + '</div>';
    return;
  }

  renderGlobalSearchResults(data.results || {});
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

async function loadReports() {
  const month = reportMonth.value || String(dashboardData?.today || '').slice(0, 7);
  const response = await fetch('/api/reports?month=' + encodeURIComponent(month));
  const data = await response.json();

  if (!data.ok) {
    reportMode.textContent = data.error || 'No se pudieron cargar reportes.';
    return;
  }

  reportsData = data.reports;
  renderReports(reportsData);
}

function renderReports(report) {
  const daily = report.dailyOccupancy || [];
  const totalOccupied = daily.reduce((total, row) => total + Number(row.occupiedRooms || 0), 0);
  const avgOccupancy = daily.length
    ? Math.round(daily.reduce((total, row) => total + Number(row.occupancyPercent || 0), 0) / daily.length)
    : 0;
  const topRoom = (report.roomRotation || [])[0];
  const dueCount = (report.serviceDue || []).filter(row =>
    Number(row.daysSinceDeepClean || 0) >= 30 || Number(row.daysSinceAcMaintenance || 0) >= 90
  ).length;

  reportMode.textContent = report.mode === 'mysql'
    ? 'Datos desde MySQL normalizado.'
    : 'Modo parcial: activa MySQL para historial exacto por habitacion y mantenimiento.';
  reportKpis.innerHTML =
    renderReportKpi('Dias con ocupacion', daily.length) +
    renderReportKpi('Room nights mes', totalOccupied) +
    renderReportKpi('Ocupacion promedio', avgOccupancy + '%') +
    renderReportKpi('Cuartos por revisar', dueCount);

  dailyOccupancyReport.innerHTML = renderDailyOccupancyTable(daily);
  roomRotationReport.innerHTML = renderRoomRotationTable(report.roomRotation || []);
  serviceDueReport.innerHTML = renderServiceDueTable(report.serviceDue || []);
  sourceReport.innerHTML = renderSourceReport(report.reservationsBySource || []);
  eventReport.innerHTML = renderEventReport(report.eventSummary || [], report.events || []);
  roomEventsReport.innerHTML = renderRoomEventsTable(report.roomEvents || []);
  renderRoomEventOptions(report);
}

function renderReportKpi(label, value) {
  return '<div class="report-kpi"><span class="muted">' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
}

function renderDailyOccupancyTable(rows) {
  if (!rows.length) {
    return '<div class="muted">Sin ocupacion para este mes.</div>';
  }

  return '<table class="report-table"><thead><tr><th>Fecha</th><th>Ocupadas</th><th>%</th></tr></thead><tbody>' +
    rows.map(row =>
      '<tr><td>' + escapeHtml(row.date) + '</td><td>' + escapeHtml(row.occupiedRooms || 0) + '</td><td>' + escapeHtml(row.occupancyPercent || 0) + '%</td></tr>'
    ).join('') +
  '</tbody></table>';
}

function renderRoomRotationTable(rows) {
  if (!rows.length) {
    return '<div class="muted">Sin habitaciones asignadas en este mes. El historico exacto se llena cuando se registra llegada con habitacion.</div>';
  }

  return '<table class="report-table"><thead><tr><th>Hab</th><th>Tipo</th><th>Noches</th><th>Ultima ocupacion</th><th>Limpieza profunda</th><th>Clima</th><th>Mantenimiento</th></tr></thead><tbody>' +
    rows.map(row =>
      '<tr>' +
        '<td><strong>' + escapeHtml(row.roomNumber || '-') + '</strong></td>' +
        '<td>' + escapeHtml(row.roomType || '-') + '</td>' +
        '<td>' + escapeHtml(row.occupiedNights || 0) + '</td>' +
        '<td>' + escapeHtml(row.lastOccupiedDate || '-') + '</td>' +
        '<td>' + escapeHtml(row.lastDeepCleanDate || '-') + '</td>' +
        '<td>' + escapeHtml(row.lastAcMaintenanceDate || '-') + '</td>' +
        '<td>' + escapeHtml(row.lastMaintenanceDate || '-') + '</td>' +
      '</tr>'
    ).join('') +
  '</tbody></table>';
}

function renderServiceDueTable(rows) {
  if (!rows.length) {
    return '<div class="muted">Sin datos de habitaciones.</div>';
  }

  return '<table class="report-table"><thead><tr><th>Hab</th><th>30 dias</th><th>Clima</th><th>Uso 30d</th></tr></thead><tbody>' +
    rows.slice(0, 18).map(row => {
      const deep = row.daysSinceDeepClean === null || row.daysSinceDeepClean === undefined
        ? '-'
        : row.daysSinceDeepClean + ' dias';
      const ac = row.daysSinceAcMaintenance === null || row.daysSinceAcMaintenance === undefined
        ? '-'
        : row.daysSinceAcMaintenance + ' dias';
      return '<tr>' +
        '<td><strong>' + escapeHtml(row.roomNumber || '-') + '</strong><br><span class="muted">' + escapeHtml(row.roomType || '') + '</span></td>' +
        '<td>' + escapeHtml(deep) + '<br><span class="muted">' + escapeHtml(row.lastDeepCleanDate || 'Sin fecha') + '</span></td>' +
        '<td>' + escapeHtml(ac) + '<br><span class="muted">' + escapeHtml(row.lastAcMaintenanceDate || 'Sin fecha') + '</span></td>' +
        '<td>' + escapeHtml(row.occupiedNightsLast30Days || 0) + '</td>' +
      '</tr>';
    }).join('') +
  '</tbody></table>';
}

function renderSourceReport(rows) {
  if (!rows.length) {
    return '<div class="muted">Sin datos de fuentes.</div>';
  }

  return '<table class="report-table"><thead><tr><th>Fuente</th><th>Reservas</th><th>Habs</th><th>Huespedes</th></tr></thead><tbody>' +
    rows.map(row =>
      '<tr><td>' + escapeHtml(row.source || '-') + '</td><td>' + escapeHtml(row.reservationsCount || 0) + '</td><td>' + escapeHtml(row.roomsReserved || 0) + '</td><td>' + escapeHtml(Number(row.adultsCount || 0) + Number(row.childrenCount || 0)) + '</td></tr>'
    ).join('') +
  '</tbody></table>';
}

function renderRoomEventsTable(rows) {
  if (!rows.length) {
    return '<div class="muted">Sin eventos registrados en este mes.</div>';
  }

  return '<table class="report-table"><thead><tr><th>Fecha</th><th>Hab</th><th>Tipo</th><th>Detalle</th></tr></thead><tbody>' +
    rows.map(row =>
      '<tr>' +
        '<td>' + escapeHtml(row.eventDate || '-') + '</td>' +
        '<td><strong>' + escapeHtml(row.roomNumber || '-') + '</strong></td>' +
        '<td>' + escapeHtml(row.eventType || row.eventCode || '-') + '</td>' +
        '<td><strong>' + escapeHtml(row.title || '-') + '</strong><br><span class="muted">' + escapeHtml(row.notes || '') + '</span></td>' +
      '</tr>'
    ).join('') +
  '</tbody></table>';
}

function renderEventReport(summaryRows, eventRows) {
  const summary =
    summaryRows.length
      ? '<table class="report-table"><thead><tr><th>Salon</th><th>Eventos</th><th>Cotiz.</th><th>Apart.</th><th>Pagados</th><th>Total</th><th>Pagado</th><th>Pendiente</th></tr></thead><tbody>' +
        summaryRows.map(row =>
          '<tr>' +
            '<td><strong>' + escapeHtml(row.hallName || '-') + '</strong></td>' +
            '<td>' + escapeHtml(row.eventsCount || 0) + '</td>' +
            '<td>' + escapeHtml(row.quotationCount || 0) + '</td>' +
            '<td>' + escapeHtml(row.bookedCount || 0) + '</td>' +
            '<td>' + escapeHtml(row.paidCount || 0) + '</td>' +
            '<td>' + formatMoney(row.totalAmount || 0) + '</td>' +
            '<td>' + formatMoney(row.paidAmount || 0) + '</td>' +
            '<td>' + formatMoney(row.pendingAmount || 0) + '</td>' +
          '</tr>'
        ).join('') +
        '</tbody></table>'
      : '<div class="muted">Sin eventos para este mes.</div>';

  const details =
    eventRows.length
      ? '<table class="report-table"><thead><tr><th>Fecha</th><th>Salon</th><th>Evento</th><th>Estado</th><th>Saldo</th></tr></thead><tbody>' +
        eventRows.map(row =>
          '<tr>' +
            '<td>' + escapeHtml(row.date || '-') + '</td>' +
            '<td>' + escapeHtml(row.hallName || '-') + '</td>' +
            '<td><strong>' + escapeHtml(row.eventName || row.client || '-') + '</strong><br><span class="muted">' + escapeHtml(row.client || '') + '</span></td>' +
            '<td>' + escapeHtml(eventStatusLabel(row.status)) + '</td>' +
            '<td>' + formatMoney(row.pendingAmount || 0) + '</td>' +
          '</tr>'
        ).join('') +
        '</tbody></table>'
      : '';

  return summary + details;
}

function renderRoomEventOptions(report) {
  roomEventRoomOptions.innerHTML = (report.rooms || [])
    .map(room => '<option value="' + escapeHtml(room.roomNumber || '') + '"></option>')
    .join('');
  const previousType = roomEventType.value;
  roomEventType.innerHTML = (report.roomEventTypes || [])
    .map(type => '<option value="' + escapeHtml(type.code || '') + '">' + escapeHtml(type.name || type.code || '') + '</option>')
    .join('');
  if (previousType) {
    roomEventType.value = previousType;
  }
}

async function saveRoomEvent() {
  roomEventStatus.textContent = 'Guardando...';
  const response = await fetch('/api/rooms/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      roomNumber: roomEventRoom.value,
      eventCode: roomEventType.value,
      eventDate: roomEventDate.value,
      title: roomEventTitle.value,
      notes: roomEventNotes.value,
      cost: roomEventCost.value
    })
  });
  const data = await response.json();

  if (!data.ok) {
    roomEventStatus.textContent = data.error || 'No se pudo guardar. Requiere MySQL activo.';
    return;
  }

  roomEventTitle.value = '';
  roomEventNotes.value = '';
  roomEventCost.value = '';
  roomEventStatus.textContent = 'Evento guardado.';
  await loadReports();
}

function renderRoomBlocks() {
  if (!roomBlocksList) {
    return;
  }

  if (!roomBlocks.length) {
    roomBlocksList.innerHTML = '<div class="muted">Sin bloqueos recientes.</div>';
    return;
  }

  roomBlocksList.innerHTML =
    '<table class="report-table"><thead><tr><th>Hab</th><th>Fechas</th><th>Motivo</th><th>Estado</th></tr></thead><tbody>' +
    roomBlocks.map(block =>
      '<tr>' +
        '<td><strong>' + escapeHtml(block.roomNumber || '-') + '</strong></td>' +
        '<td>' + escapeHtml(isoToDisplay(block.startDate || '') || '-') + ' al ' + escapeHtml(isoToDisplay(block.endDate || '') || '-') + '</td>' +
        '<td><strong>' + escapeHtml(block.reason || '-') + '</strong><br><span class="muted">' + escapeHtml(block.notes || '') + '</span></td>' +
        '<td><span class="pill">' + escapeHtml(block.status || '-') + '</span></td>' +
      '</tr>'
    ).join('') +
    '</tbody></table>';
}

async function saveRoomBlock() {
  roomBlockStatus.textContent = 'Guardando bloqueo...';
  const response = await fetch('/api/room-blocks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      roomNumber: blockRoom.value,
      startDate: blockStart.value,
      endDate: blockEnd.value,
      reason: blockReason.value,
      notes: blockNotes.value,
      status: blockStatus.value
    })
  });
  const data = await response.json();

  if (!data.ok) {
    roomBlockStatus.textContent = data.error || 'No se pudo guardar el bloqueo.';
    return;
  }

  blockReason.value = '';
  blockNotes.value = '';
  roomBlockStatus.textContent = 'Bloqueo guardado.';
  await loadDashboard();
}

function downloadReportCsv(type) {
  const month = reportMonth.value || String(dashboardData?.today || '').slice(0, 7);
  window.location.href = '/api/reports/export-csv?month=' + encodeURIComponent(month) + '&type=' + encodeURIComponent(type || 'all');
}

function renderOverbookingAlerts(alerts) {
  if (!alerts.length) {
    return '<div class="muted">Sin sobreventas detectadas.</div>';
  }

  return '<div class="alert-list">' +
    alerts.map(alert =>
      '<div class="alert-item">' +
        '<strong>' + escapeHtml(alert.date) + ' / ' + escapeHtml(alert.type) + '</strong>' +
        '<div class="muted">' + alert.used + '/' + alert.limit + ' habitaciones. Exceso: ' + alert.excess + '.</div>' +
      '</div>'
    ).join('') +
  '</div>';
}

function renderTodayArrivals(rows) {
  if (!rows.length) {
    return '<div class="muted">Sin llegadas registradas para hoy.</div>';
  }

  return '<div class="arrival-list">' +
    rows.map(row => {
      const arrival = getReservationArrivalState(row);
      return '<div class="arrival-item ' + arrival.className + '">' +
        '<div>' +
          '<strong>' + escapeHtml(row.nombre || 'Sin nombre') + '</strong>' +
          '<div class="muted">' +
            escapeHtml(row.habitaciones || 1) + ' hab(s)' +
            (row.tipo ? ' / ' + escapeHtml(row.tipo) : '') +
            (row.hora ? ' / ' + escapeHtml(getReservationTimeDisplay(row.hora)) : '') +
          '</div>' +
          (row.note ? '<div class="muted">Nota: ' + escapeHtml(row.note) + '</div>' : '') +
        '</div>' +
        '<span class="pill ' + arrival.className + '">' + arrival.label + '</span>' +
      '</div>';
    }).join('') +
  '</div>';
}

function getReservationArrivalState(reservation) {
  if (reservation.arrivalAt) {
    return { className: 'arrived', label: 'Llegó' };
  }

  const dates = reservation.dates || [reservation.fecha];
  const reservationDate = dates[0] || reservation.fecha;
  const today = dashboardData ? isoToDisplay(dashboardData.today) : dateToDisplay(new Date());

  const toDate = value => {
    const [day, month, year] = String(value || '').split('/').map(Number);
    return new Date(year, month - 1, day).getTime();
  };

  if (toDate(reservationDate) < toDate(today)) {
    return { className: 'delayed', label: 'Retrasada' };
  }

  if (toDate(reservationDate) !== toDate(today) || !reservation.hora) {
    return { className: 'pending', label: 'Pendiente' };
  }

  const arrivalTime = parseReservationArrivalTime(reservation.hora);

  if (!arrivalTime) {
    return { className: 'pending', label: 'Pendiente' };
  }

  const [day, month, year] = reservationDate.split('/').map(Number);
  const expected = new Date(year, month - 1, day, arrivalTime.hours, arrivalTime.minutes);

  return new Date() > expected
    ? { className: 'delayed', label: 'Retrasada' }
    : { className: 'pending', label: 'Pendiente' };
}

function parseReservationArrivalTime(value) {
  const original = String(value || '').trim();

  if (!original) {
    return null;
  }

  const normalized = original
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\ba\.?\s*m\.?\b/g, 'am')
    .replace(/\bp\.?\s*m\.?\b/g, 'pm')
    .replace(/\bhrs?\b|\bhoras?\b/g, '')
    .replace(/\s+/g, ' ');

  const match =
    normalized.match(/(?:llegada|ingresa|entrada|a las|alas)\D{0,24}(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)
    ||
    normalized.match(/\b(\d{1,2})(?::(\d{2}))\s*(am|pm)?\b/)
    ||
    normalized.match(/\b(\d{1,2})\s*(am|pm)\b/);

  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutesText = /^\d+$/.test(match[2] || '') ? match[2] : '0';
  const minutes = Number(minutesText);
  const meridiem = match[3] || (/^(am|pm)$/.test(match[2] || '') ? match[2] : '');

  if (minutes > 59 || hours > 23) {
    return null;
  }

  if (meridiem) {
    if (hours < 1 || hours > 12) {
      return null;
    }
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
  }

  return {
    hours,
    minutes,
    display:
      String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0')
  };
}

function getReservationTimeDisplay(value) {
  const parsed = parseReservationArrivalTime(value);

  if (!value) {
    return '-';
  }

  return parsed
    ? value + ' (sistema ' + parsed.display + ')'
    : value + ' (hora no detectada)';
}

function renderQuoteSections() {
  quoteSections.innerHTML = quoteSectionsData.map((section, index) =>
    '<div class="quote-section">' +
      '<label>Titulo<input value="' + escapeHtml(section.title || '') + '" oninput="updateQuoteSection(' + index + ', \'title\', this.value)"></label>' +
      '<label>Tipo<select onchange="updateQuoteSection(' + index + ', \'category\', this.value)">' +
        '<option value="habitaciones"' + (section.category === 'habitaciones' ? ' selected' : '') + '>Habitaciones</option>' +
        '<option value="salon"' + (section.category === 'salon' ? ' selected' : '') + '>Salon</option>' +
        '<option value="alimentos"' + (section.category === 'alimentos' ? ' selected' : '') + '>Alimentos/Menu</option>' +
        '<option value="otro"' + (section.category === 'otro' ? ' selected' : '') + '>Otro</option>' +
      '</select></label>' +
      '<label>' + escapeHtml(getQuoteQuantityLabel(section.category)) + '<input type="number" min="0" value="' + escapeHtml(section.quantity || 0) + '" oninput="updateQuoteSection(' + index + ', \'quantity\', this.value)"></label>' +
      '<label>' + escapeHtml(getQuotePriceLabel(section.category)) + '<input type="number" min="0" value="' + escapeHtml(section.unitPrice || 0) + '" oninput="updateQuoteSection(' + index + ', \'unitPrice\', this.value)"></label>' +
      '<button class="danger" onclick="removeQuoteSection(' + index + ')">Quitar</button>' +
      '<textarea placeholder="Que incluye este apartado" oninput="updateQuoteSection(' + index + ', \'includes\', this.value)">' + escapeHtml(section.includes || '') + '</textarea>' +
    '</div>'
  ).join('');
  renderQuoteTotals();
}

function getQuoteQuantityLabel(category) {
  if (category === 'habitaciones') {
    return 'Habitaciones';
  }

  if (category === 'alimentos') {
    return 'Personas';
  }

  return 'Cantidad';
}

function getQuotePriceLabel(category) {
  if (category === 'habitaciones') {
    return 'Precio por habitacion';
  }

  if (category === 'alimentos') {
    return 'Precio por persona';
  }

  return 'Precio unitario';
}

function renderQuoteMenuOptions() {
  if (!quoteMenuSelect) {
    return;
  }

  const previousValue = quoteMenuSelect.value;
  quoteMenuSelect.innerHTML = quoteMenuItems.map((item, index) =>
    '<option value="' + index + '">' + escapeHtml(item.title) + ' - ' + formatMoney(item.price) + ' p/p</option>'
  ).join('');
  if (previousValue && quoteMenuSelect.options[Number(previousValue)]) {
    quoteMenuSelect.value = previousValue;
  }
  renderQuoteMenuPreview();
}

function renderQuoteMenuEditor() {
  if (!quoteMenuEditor) {
    return;
  }

  quoteMenuEditor.innerHTML = quoteMenuItems.map((item, index) =>
    '<div class="quote-menu-row">' +
      '<input value="' + escapeHtml(item.title || '') + '" placeholder="Platillo" oninput="updateQuoteMenuItem(' + index + ', \'title\', this.value)">' +
      '<input type="number" min="0" value="' + escapeHtml(item.price || 0) + '" oninput="updateQuoteMenuItem(' + index + ', \'price\', this.value)">' +
      '<input value="' + escapeHtml(item.description || '') + '" placeholder="Descripcion" oninput="updateQuoteMenuItem(' + index + ', \'description\', this.value)">' +
      '<button class="danger compact" onclick="removeQuoteMenuItem(' + index + ')">Quitar</button>' +
    '</div>'
  ).join('');
}

function updateQuoteMenuItem(index, field, value) {
  quoteMenuItems[index][field] = field === 'price'
    ? Number(value || 0)
    : value;
  renderQuoteMenuOptions();
}

function addQuoteMenuEditorRow() {
  quoteMenuItems.push({
    title: 'Nuevo platillo',
    price: 0,
    description: ''
  });
  renderQuoteMenuEditor();
  renderQuoteMenuOptions();
}

function removeQuoteMenuItem(index) {
  quoteMenuItems.splice(index, 1);

  if (!quoteMenuItems.length) {
    addQuoteMenuEditorRow();
    return;
  }

  renderQuoteMenuEditor();
  renderQuoteMenuOptions();
}

async function saveQuoteMenuCatalog() {
  quoteMenuStatus.textContent = 'Guardando catalogo...';
  const response = await fetch('/api/quotation-menu', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      items: quoteMenuItems
    })
  });
  const data = await response.json();

  if (!data.ok) {
    quoteMenuStatus.textContent = data.error || 'No se pudo guardar el catalogo.';
    return;
  }

  quoteMenuItems = data.menu;
  quoteMenuStatus.textContent = 'Catalogo guardado.';
  renderQuoteMenuEditor();
  renderQuoteMenuOptions();
}

function openQuoteMenuModal() {
  renderQuoteMenuEditor();
  quoteMenuModalBackdrop.classList.remove('hidden');
  document.body.classList.add('app-modal-open');
}

function closeQuoteMenuModal() {
  quoteMenuModalBackdrop.classList.add('hidden');

  if (
    dayModalBackdrop.classList.contains('hidden') &&
    confirmDeleteBackdrop.classList.contains('hidden') &&
    confirmRackBackdrop.classList.contains('hidden')
  ) {
    document.body.classList.remove('app-modal-open');
  }
}

function getMenuModifierPrice() {
  return (quoteAddWater?.checked ? 30 : 0) + (quoteAddCoffee?.checked ? 30 : 0);
}

function getMenuModifierText() {
  const modifiers = [];

  if (quoteAddWater?.checked) {
    modifiers.push('Agua +$30');
  }

  if (quoteAddCoffee?.checked) {
    modifiers.push('Cafe +$30');
  }

  return modifiers;
}

function renderQuoteMenuPreview() {
  if (!quoteMenuSelect || !quoteMenuPreview) {
    return;
  }

  const item = quoteMenuItems[Number(quoteMenuSelect.value || 0)];
  const totalPrice = item ? item.price + getMenuModifierPrice() : 0;
  const modifiers = getMenuModifierText();

  quoteMenuPreview.textContent = item
    ? item.description + (modifiers.length ? ' / ' + modifiers.join(' / ') : '') + ' / ' + formatMoney(totalPrice) + ' por persona'
    : '';
}

function addSelectedMenuItem() {
  const item = quoteMenuItems[Number(quoteMenuSelect.value || 0)];

  if (!item) {
    return;
  }

  const modifiers = getMenuModifierText();

  quoteSectionsData.push({
    title: item.title,
    category: 'alimentos',
    quantity: Number(quotePeople.value || 1),
    unitPrice: item.price + getMenuModifierPrice(),
    includes: item.description + (modifiers.length ? '\\n' + modifiers.join('\\n') : '')
  });
  renderQuoteSections();
}

function addQuoteSection() {
  quoteSectionsData.push({
    title: 'Nuevo apartado',
    category: 'otro',
    quantity: 1,
    unitPrice: 0,
    includes: ''
  });
  renderQuoteSections();
}

function addQuotePreset(type) {
  const presets = {
    habitaciones: {
      title: 'Habitacion doble',
      category: 'habitaciones',
      quantity: Number(quotePeople.value || 1),
      unitPrice: 700,
      includes: 'Habitacion\\nIVA incluido\\nRecepcion 24 horas\\nEstacionamiento\\nInternet'
    },
    salon: {
      title: 'Salon para evento',
      category: 'salon',
      quantity: 1,
      unitPrice: 0,
      includes: 'Uso de salon\\nMontaje basico\\nMesas y sillas'
    },
    alimentos: {
      title: 'Coffee Break',
      category: 'alimentos',
      quantity: Number(quotePeople.value || 1),
      unitPrice: 180,
      includes: 'Coffee break por persona'
    }
  };

  quoteSectionsData.push(presets[type] || {
    title: 'Nuevo apartado',
    category: 'otro',
    quantity: 1,
    unitPrice: 0,
    includes: ''
  });
  renderQuoteSections();
}

function removeQuoteSection(index) {
  quoteSectionsData.splice(index, 1);

  if (!quoteSectionsData.length) {
    addQuoteSection();
    return;
  }

  renderQuoteSections();
}

function updateQuoteSection(index, field, value) {
  quoteSectionsData[index][field] =
    field === 'quantity' || field === 'unitPrice'
      ? Number(value || 0)
      : value;
  renderQuoteTotals();
}

function getQuoteSubtotal() {
  return quoteSectionsData.reduce((total, section) =>
    total + Number(section.quantity || 0) * Number(section.unitPrice || 0),
    0
  );
}

function getQuoteFoodSubtotal() {
  return quoteSectionsData.reduce((total, section) =>
    section.category === 'alimentos'
      ? total + Number(section.quantity || 0) * Number(section.unitPrice || 0)
      : total,
    0
  );
}

function getQuoteServiceCharge() {
  return getQuoteFoodSubtotal() * Number(quoteServiceCharge?.value || 0) / 100;
}

function getQuoteTotal() {
  return getQuoteSubtotal() + getQuoteServiceCharge();
}

function renderQuoteTotals() {
  const subtotal = getQuoteSubtotal();
  const foodSubtotal = getQuoteFoodSubtotal();
  const service = getQuoteServiceCharge();
  quoteSubtotalLine.innerHTML = '<span>Subtotal</span><strong>' + formatMoney(subtotal) + '</strong>';
  quoteServiceLine.innerHTML = '<span>Servicio ' + Number(quoteServiceCharge?.value || 0) + '% alimentos <small>(' + formatMoney(foodSubtotal) + ')</small></span><strong>' + formatMoney(service) + '</strong>';
  quoteTotal.textContent = formatMoney(subtotal + service);
}

function renderHallSelects() {
  const options = eventHalls.map(hall =>
    '<option value="' + escapeHtml(hall.code) + '">' + escapeHtml(hall.name) + '</option>'
  ).join('');

  if (quoteHall && quoteHall.options.length <= 1) {
    quoteHall.innerHTML = '<option value="">Sin salon</option>' + options;
  }

  if (eventHall && !eventHall.options.length) {
    eventHall.innerHTML = options;
  }

  if (quoteEventModalHall && !quoteEventModalHall.options.length) {
    quoteEventModalHall.innerHTML = options;
  }

  if (eventMonth && !eventMonth.value) {
    eventMonth.value = new Date().toISOString().slice(0, 7);
  }
}

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

function renderQuotationList(rows) {
  if (!rows.length) {
    quoteList.innerHTML = '<div class="muted">Sin cotizaciones guardadas.</div>';
    return;
  }

  quoteList.innerHTML = rows.slice(0, 8).map(row =>
    '<div class="quote-item">' +
      '<strong>' + escapeHtml(row.id) + '</strong>' +
      '<div>' + escapeHtml(row.client || '') + '</div>' +
      '<div class="muted">' + escapeHtml(row.headline || row.eventName || 'Sin evento') + ' / ' + formatMoney(row.total || 0) + '</div>' +
      '<div class="muted">' + escapeHtml(row.eventDate || 'Sin fecha') + ' · ' + escapeHtml(row.hallName || row.hallCode || 'Sin salon') + '</div>' +
      '<div class="muted">Formato: ' + escapeHtml(row.template === 'formal' ? 'Formal' : 'Visual hotel') + '</div>' +
      '<div class="summary-chips">' +
        '<button class="compact" onclick="window.open(\'/api/quotations/' + encodeURIComponent(row.id) + '/print\', \'_blank\')">Abrir PDF</button>' +
        '<button class="compact" onclick="createEventFromQuotation(\'' + escapeHtml(row.id) + '\')">Apartar salon</button>' +
      '</div>' +
    '</div>'
  ).join('');
}

async function saveQuotation() {
  const payload = {
    client: quoteClient.value.trim(),
    contact: quoteContact.value.trim(),
    eventName: quoteEventName.value.trim(),
    eventDate: quoteEventDate.value,
    hallCode: quoteHall.value,
    template: document.querySelector('input[name="quoteTemplate"]:checked')?.value || 'visual',
    headline: quoteHeadline.value.trim(),
    stayDates: quoteStayDates.value.trim(),
    people: Number(quotePeople.value || 0),
    checkIn: quoteCheckIn.value.trim(),
    checkOut: quoteCheckOut.value.trim(),
    validUntil: quoteValidUntil.value,
    notes: quoteNotes.value.trim(),
    serviceChargePercent: Number(quoteServiceCharge.value || 0),
    sections: quoteSectionsData
  };

  if (!payload.client) {
    alert('Escribe el cliente de la cotizacion.');
    return;
  }

  quoteStatus.textContent = 'Guardando cotizacion...';
  const response = await fetch('/api/quotations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();

  if (!data.ok) {
    quoteStatus.textContent = data.error || 'No se pudo guardar.';
    return;
  }

  quoteStatus.innerHTML =
    'Guardada: ' + escapeHtml(data.quotation.id) +
    ' <button class="compact" onclick="window.open(\'/api/quotations/' + encodeURIComponent(data.quotation.id) + '/print\', \'_blank\')">Abrir PDF</button>';
  quoteClient.value = '';
  quoteContact.value = '';
  quoteEventName.value = '';
  quoteEventDate.value = '';
  quoteHall.value = '';
  quoteHeadline.value = '';
  quoteStayDates.value = '';
  quotePeople.value = '';
  quoteCheckIn.value = '';
  quoteCheckOut.value = '';
  quoteServiceCharge.value = '0';
  quoteValidUntil.value = '';
  quoteNotes.value = '';
  document.querySelector('input[name="quoteTemplate"][value="visual"]').checked = true;
  quoteSectionsData = [
    {
      title: 'Hospedaje',
      category: 'habitaciones',
      quantity: 1,
      unitPrice: 700,
      includes: 'Recepcion 24 horas\\nEstacionamiento\\nInternet\\nTelevision por cable\\nAgua fria y caliente'
    }
  ];
  await loadDashboard();
  showView('quotes');
}

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

function isIsoWithinSelection(isoDate) {
  const start = closeStart.value;
  const end = closeEnd.value || start;

  if (!start) {
    return false;
  }

  return isoDate >= start && isoDate <= end;
}

function updateSelectionSummary() {
  const start = closeStart.value;
  const end = closeEnd.value || start;

  if (!start) {
    selectionSummary.textContent = 'Selecciona una fecha en el calendario.';
    return;
  }

  selectionSummary.textContent = start === end
    ? 'Seleccionado: ' + isoToDisplay(start)
    : 'Rango seleccionado: ' + isoToDisplay(start) + ' al ' + isoToDisplay(end);
}

async function analyzeRack() {
  const file = rackImage.files[0];

  if (!file) {
    alert('Selecciona una foto del rack.');
    return;
  }

  rackResult.value = 'Leyendo rack... puede tardar hasta 90 segundos.';
  analyzeRackButton.disabled = true;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const dataUrl = await fileToCompressedDataUrl(file);
    const imageBase64 = dataUrl.split(',')[1];

    const response = await fetch('/api/rack/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        imageBase64,
        mimeType: 'image/jpeg'
      })
    });

    const data = await response.json();

    rackResult.value = data.ok
      ? data.message + (data.ocrPreview ? '\\n\\n--- OCR detectado ---\\n' + data.ocrPreview : '')
      : data.error || 'No se pudo analizar el rack.';
  } catch (error) {
    rackResult.value = error.name === 'AbortError'
      ? 'La lectura tardo demasiado. Intenta con una foto mas derecha, bien iluminada y tomada de frente.'
      : 'No se pudo analizar el rack: ' + (error.message || 'error desconocido');
  } finally {
    clearTimeout(timeout);
    analyzeRackButton.disabled = false;
  }
}

async function analyzeRackCsvFile() {
  const file = rackCsv.files[0];

  if (!file) {
    alert('Selecciona el CSV exportado del rack.');
    return;
  }

  rackResult.value = 'Leyendo CSV del rack...';
  analyzeRackCsvButton.disabled = true;

  try {
    const csvText = await file.text();

    const response = await fetch('/api/rack/analyze-csv', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        csvText,
        fileName: file.name
      })
    });

    const data = await response.json();

    rackResult.value = data.ok
      ? data.message + (data.saved ? '\\n\\nGuardado como ultimo rack.' : '\\n\\nNo se guardo porque ya existe un rack mas reciente.')
      : data.error || 'No se pudo analizar el CSV.';

    if (data.ok) {
      await loadDashboard();
    }
  } catch (error) {
    rackResult.value = 'No se pudo analizar el CSV: ' + (error.message || 'error desconocido');
  } finally {
    analyzeRackCsvButton.disabled = false;
  }
}

let activeFileInputId = '';

function setupFileDropzones() {
  document.querySelectorAll('[data-file-zone]').forEach(zone => {
    const input = document.getElementById(zone.dataset.fileZone);

    if (!input) {
      return;
    }

    zone.addEventListener('focusin', () => setActiveFileZone(zone));
    zone.addEventListener('mouseenter', () => setActiveFileZone(zone));
    zone.addEventListener('click', () => setActiveFileZone(zone));
    zone.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        input.click();
      }
    });

    input.addEventListener('change', () => updateFileZone(input));

    ['dragenter', 'dragover'].forEach(type => {
      zone.addEventListener(type, event => {
        event.preventDefault();
        setActiveFileZone(zone);
        zone.classList.add('dragging');
      });
    });

    ['dragleave', 'drop'].forEach(type => {
      zone.addEventListener(type, () => {
        zone.classList.remove('dragging');
      });
    });

    zone.addEventListener('drop', event => {
      event.preventDefault();
      setFileInputFiles(input, event.dataTransfer.files);
    });
  });

  document.addEventListener('paste', event => {
    const files = Array.from(event.clipboardData?.files || []);

    if (!files.length) {
      return;
    }

    const zone = findPasteTarget(files);

    if (!zone) {
      return;
    }

    const input = document.getElementById(zone.dataset.fileZone);

    if (input && setFileInputFiles(input, files)) {
      event.preventDefault();
      setActiveFileZone(zone);
    }
  });
}

function setActiveFileZone(zone) {
  activeFileInputId = zone.dataset.fileZone || activeFileInputId;
  document.querySelectorAll('[data-file-zone]').forEach(item => {
    item.classList.toggle('active', item === zone);
  });
}

function findPasteTarget(files) {
  const zones = Array.from(document.querySelectorAll('[data-file-zone]'));
  const activeZone = zones.find(zone => zone.dataset.fileZone === activeFileInputId);

  if (activeZone && files.some(file => fileMatchesInput(file, document.getElementById(activeZone.dataset.fileZone)))) {
    return activeZone;
  }

  return zones.find(zone => {
    const input = document.getElementById(zone.dataset.fileZone);
    const isVisible = zone.offsetParent !== null;
    return isVisible && files.some(file => fileMatchesInput(file, input));
  });
}

function setFileInputFiles(input, files) {
  const compatible = Array.from(files || [])
    .filter(file => fileMatchesInput(file, input));

  if (!compatible.length) {
    return false;
  }

  const transfer = new DataTransfer();
  transfer.items.add(compatible[0]);
  input.files = transfer.files;
  updateFileZone(input);
  return true;
}

function fileMatchesInput(file, input) {
  if (!file || !input) {
    return false;
  }

  const accept = String(input.getAttribute('accept') || '').split(',').map(item => item.trim()).filter(Boolean);

  if (!accept.length) {
    return true;
  }

  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();

  return accept.some(rule => {
    const normalized = rule.toLowerCase();

    if (normalized.endsWith('/*')) {
      return type.startsWith(normalized.slice(0, -1));
    }

    if (normalized.startsWith('.')) {
      return name.endsWith(normalized);
    }

    return type === normalized || (normalized === 'text/csv' && name.endsWith('.csv'));
  });
}

function updateFileZone(input) {
  const label = document.getElementById(input.id + 'Name');
  const file = input.files?.[0];

  if (!label) {
    return;
  }

  label.textContent = file ? file.name : label.id === 'rackImageName'
    ? 'Arrastra, pega o elige imagen'
    : 'Arrastra, pega o elige archivo';
}

function fileToCompressedDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSide = 1800;
        const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * ratio));
        const height = Math.max(1, Math.round(image.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isoToDate(value) {
  const parts = value.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function isoToDisplay(value) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(value || ''))) {
    return '';
  }
  return dateToDisplay(isoToDate(value));
}

function dateToIso(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return date.getFullYear() + '-' + month + '-' + day;
}

function dateToDisplay(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return day + '/' + month + '/' + date.getFullYear();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeJs(value) {
  return JSON.stringify(String(value))
    .slice(1, -1)
    .split("'")
    .join("\\\'");
}

function escapeJsArg(value) {
  return "'" + escapeJs(value || '') + "'";
}

setupFileDropzones();
loadBotStatus();
loadDashboard();
setInterval(loadBotStatus, 5000);
document.addEventListener('click', event => {
  const searchPanel = document.querySelector('.global-search-panel');

  if (
    searchPanel &&
    !searchPanel.contains(event.target) &&
    !globalSearchResults.classList.contains('hidden')
  ) {
    closeGlobalSearchResults();
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (!globalSearchResults.classList.contains('hidden')) {
      closeGlobalSearchResults();
    } else if (!confirmRackBackdrop.classList.contains('hidden')) {
      closeRackConfirm();
    } else if (!searchDetailModalBackdrop.classList.contains('hidden')) {
      closeSearchDetailModal();
    } else if (!eventDetailModalBackdrop.classList.contains('hidden')) {
      closeEventDetailModal();
    } else if (!quoteEventModalBackdrop.classList.contains('hidden')) {
      closeQuoteEventModal();
    } else if (!quoteMenuModalBackdrop.classList.contains('hidden')) {
      closeQuoteMenuModal();
    } else if (!groupSendConfirmBackdrop.classList.contains('hidden')) {
      closeGroupSendConfirm();
    } else if (!reservationArrivalBackdrop.classList.contains('hidden')) {
      closeReservationArrival();
    } else if (!preassignModalBackdrop.classList.contains('hidden')) {
      closePreassignModal();
    } else if (!confirmDeleteBackdrop.classList.contains('hidden')) {
      closeDeleteConfirm();
    } else {
      closeDayModal();
    }
  }
});
