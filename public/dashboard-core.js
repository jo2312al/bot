// Dashboard frontend module: core
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
let dashboardLoading = false;
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

function toggleDashboardTheme() {
  const root = document.documentElement;
  const isDark = root.classList.toggle('dark-mode');

  try {
    localStorage.setItem('dashboardTheme', isDark ? 'dark' : 'light');
  } catch {}

  updateDashboardThemeControls(isDark);
}

function updateDashboardThemeControls(isDark) {
  document.querySelectorAll('[onclick="toggleDashboardTheme()"]').forEach(button => {
    const icon = button.querySelector('.material-symbols-outlined');
    if (icon) icon.textContent = isDark ? 'light_mode' : 'dark_mode';
    button.title = isDark ? 'Usar modo claro' : 'Usar modo nocturno';
    button.setAttribute('aria-label', button.title);
  });
}

function toggleDashboardSidebar() {
  const root = document.documentElement;
  const collapsed = root.classList.toggle('sidebar-collapsed');

  try {
    localStorage.setItem('dashboardSidebarCollapsed', collapsed ? 'true' : 'false');
  } catch {}

  updateDashboardSidebarControl(collapsed);
}

function updateDashboardSidebarControl(collapsed) {
  const button = document.querySelector('.sidebar-collapse-toggle');
  if (!button) return;
  const icon = button.querySelector('.material-symbols-outlined');
  const label = button.querySelector('span:not(.material-symbols-outlined)');
  const title = collapsed ? 'Expandir menú' : 'Contraer menú';
  if (icon) icon.textContent = collapsed ? 'left_panel_open' : 'left_panel_close';
  if (label) label.textContent = collapsed ? 'Expandir' : 'Contraer';
  button.title = title;
  button.setAttribute('aria-label', title);
  button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

document.addEventListener('DOMContentLoaded', () => {
  updateDashboardThemeControls(document.documentElement.classList.contains('dark-mode'));
  updateDashboardSidebarControl(document.documentElement.classList.contains('sidebar-collapsed'));
});

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
  checkin: {
    title: 'Check-in',
    body: 'Selecciona una llegada del dia o llena el formulario para un huesped sin reservacion.\\n\\nGuardar check-in registra la llegada y puede marcar la habitacion ocupada en el rack. Si no habia reserva, crea una reserva manual para que quede guardada.\\n\\nImprimir comprobacion abre un formato tipo recepcion con reservacion, huesped, habitacion, tarifa, deposito, cargos y observaciones.'
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

function setDashboardRefreshState(isLoading, message) {
  dashboardLoading = isLoading;
  document.querySelectorAll('[data-dashboard-refresh]').forEach(button => {
    button.disabled = isLoading;
    button.classList.toggle('is-loading', isLoading);
  });

  if (typeof updatedAt !== 'undefined' && updatedAt) {
    updatedAt.textContent = message || (isLoading ? 'Actualizando...' : updatedAt.textContent);
  }
}

async function loadDashboard() {
  if (dashboardLoading) {
    return;
  }

  setDashboardRefreshState(true, 'Actualizando...');

  try {
    const response = await fetch('/api/summary');
    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }
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
    if (typeof reportAuditDate !== 'undefined' && !reportAuditDate.value) {
      reportAuditDate.value = data.operationalDate || data.today;
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
    renderCheckinBoard();
  } catch (error) {
    setDashboardRefreshState(false, 'No se pudo actualizar: ' + (error.message || 'error desconocido'));
  } finally {
    setDashboardRefreshState(false);
  }
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
  const reservationKey =
    getReservationClientKey(reservation);

  return '<button class="mini-item search-result-button" onclick="openReservationArrivalByKey(\'' + escapeJs(reservationKey) + '\')">' +
    '<strong>' + escapeHtml(reservation.nombre || reservation.name || 'Reserva') + '</strong>' +
    '<div class="muted">' + escapeHtml(reservation.habitaciones || 1) + ' hab · ' + escapeHtml(reservation.tipo || '-') + ' · ' + escapeHtml(reservation.hora || '-') + '</div>' +
    '<div>' + escapeHtml(reservation.telefono || '') + '</div>' +
  '</button>';
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
  ['today', 'main', 'calendar', 'preassign', 'checkin', 'reservations', 'quotes', 'events', 'rack', 'reports'].forEach(view => {
    const panel = document.getElementById('view-' + view);
    const tab = document.getElementById('tab-' + view);

    if (panel) {
      panel.classList.toggle('hidden', view !== name);
    }

    if (tab) {
      tab.classList.toggle('active', view === name);
    }
  });

  const pageCopy = {
    today: ['Vista de hoy', 'Resumen rapido para recepcion: llegadas, salidas, eventos, pagos y bloqueos activos.'],
    main: ['Vista Principal', 'Resumen de operaciones y estado actual del hotel.'],
    calendar: ['Calendario de reservas', 'Ocupacion diaria, cierres de fechas y desglose operativo por dia.'],
    preassign: ['Preasignacion de habitaciones', 'Prepara llegadas, continuaciones y huespedes sin reservacion antes de recibirlos.'],
    checkin: ['Check-in', 'Registro de entrada e impresion de comprobacion de reservacion.'],
    reservations: ['Reservas', 'Captura manual, importacion CSV, notas internas y cancelacion de folios.'],
    quotes: ['Cotizaciones', 'Documentos visuales o formales para grupos, salones, menus y hospedaje.'],
    events: ['Eventos', 'Calendario de salones, pagos, comprobantes y seguimiento de eventos.'],
    rack: ['Rack de habitaciones', 'Lectura de rack, habitaciones por piso y bloqueos operativos.'],
    reports: ['Reportes operativos', 'Ocupacion, rotacion, mantenimiento, fuentes y eventos del mes.']
  };
  const [title, subtitle] = pageCopy[name] || pageCopy.main;

  if (typeof pageTitle !== 'undefined') {
    pageTitle.textContent = title;
  }

  if (typeof pageSubtitle !== 'undefined') {
    pageSubtitle.textContent = subtitle;
  }

  if (name === 'reports') {
    loadReports();
  }
  if (name === 'preassign') {
    renderPreassignmentBoard();
  }
  if (name === 'checkin') {
    renderCheckinBoard();
  }
}
