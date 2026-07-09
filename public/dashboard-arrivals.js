// Dashboard frontend module: arrivals
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
      const reservationKey =
        getReservationClientKey(row);

      return '<button class="arrival-item ' + arrival.className + '" onclick="openReservationArrivalByKey(\'' + escapeJs(reservationKey) + '\')">' +
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
      '</button>';
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
