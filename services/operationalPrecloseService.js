function createOperationalPrecloseService(mysql, operationalDay) {
  function requireDay() {
    if (!mysql.ensureSchema()) throw new Error("Activa MySQL para ejecutar el pre-cierre.");
    const day = operationalDay.getOpenDay();
    if (!day) throw new Error("No existe un dia operativo abierto.");
    return day;
  }

  function rows(sql) {
    return mysql.queryJson(sql);
  }

  function issue(severity, code, title, detail) {
    return { severity, code, title, ...detail };
  }

  function getStatus() {
    const day = requireDay();
    const summary = rows(`
      SELECT JSON_OBJECT(
        'totalRooms', COUNT(*),
        'occupiedRooms', SUM(current_status = 'ocupada'),
        'freeRooms', SUM(current_status = 'libre'),
        'blockedRooms', SUM(current_status IN ('bloqueada', 'mantenimiento', 'fuera_servicio')),
        'dirtyRooms', SUM(current_status = 'vacia_sucia')
      ) FROM operational_room_states WHERE operational_day_id = ${Number(day.id)};
    `)[0] || {};
    const ledger = rows(`
      SELECT JSON_OBJECT(
        'charges', COALESCE(SUM(charge_amount), 0),
        'payments', COALESCE(SUM(payment_amount), 0),
        'movements', COUNT(*)
      ) FROM account_movements WHERE operational_day_id = ${Number(day.id)};
    `)[0] || {};
    return { day, rooms: summary, ledger };
  }

  function runPreclose() {
    const status = getStatus();
    const day = status.day;
    const issues = [];

    rows(`SELECT JSON_OBJECT('room', room.room_number, 'checkins', COUNT(*))
      FROM checkins checkin JOIN rooms room ON room.id = checkin.room_id
      WHERE checkin.status = 'activo' GROUP BY checkin.room_id, room.room_number HAVING COUNT(*) > 1;`)
      .forEach(row => issues.push(issue("blocking", "DUPLICATE_ACTIVE_CHECKIN", "Habitacion con mas de un check-in activo", row)));

    rows(`SELECT JSON_OBJECT('room', room.room_number, 'guestName', checkin.guest_name_snapshot, 'checkinId', checkin.id)
      FROM checkins checkin JOIN rooms room ON room.id = checkin.room_id
      LEFT JOIN operational_room_states state ON state.operational_day_id = ${Number(day.id)} AND state.room_id = checkin.room_id
      WHERE checkin.status = 'activo' AND (state.room_id IS NULL OR state.current_status != 'ocupada' OR state.active_checkin_id != checkin.id);`)
      .forEach(row => issues.push(issue("blocking", "CHECKIN_RACK_MISMATCH", "Check-in activo no coincide con el rack SQL", row)));

    rows(`SELECT JSON_OBJECT('room', room.room_number, 'status', state.current_status, 'checkinId', state.active_checkin_id)
      FROM operational_room_states state JOIN rooms room ON room.id = state.room_id
      LEFT JOIN checkins checkin ON checkin.id = state.active_checkin_id AND checkin.status = 'activo'
      WHERE state.operational_day_id = ${Number(day.id)} AND state.current_status = 'ocupada' AND checkin.id IS NULL;`)
      .forEach(row => issues.push(issue("blocking", "OCCUPIED_WITHOUT_CHECKIN", "Habitacion ocupada sin check-in activo", row)));

    rows(`SELECT JSON_OBJECT('room', checkin.room_number_snapshot, 'guestName', checkin.guest_name_snapshot,
        'checkinId', checkin.id, 'rate', COALESCE(reservation.rate_text, ''))
      FROM checkins checkin LEFT JOIN reservations reservation ON reservation.id = checkin.reservation_id
      WHERE checkin.status = 'activo' AND TRIM(COALESCE(reservation.rate_text, '')) = '';`)
      .forEach(row => issues.push(issue("blocking", "MISSING_RATE", "Estancia activa sin tarifa", row)));

    rows(`SELECT JSON_OBJECT('room', checkin.room_number_snapshot, 'guestName', checkin.guest_name_snapshot,
        'checkinId', checkin.id, 'balance', COALESCE(SUM(movement.charge_amount - movement.payment_amount), 0))
      FROM checkins checkin LEFT JOIN account_movements movement ON movement.checkin_id = checkin.id
      WHERE checkin.status = 'activo' GROUP BY checkin.id, checkin.room_number_snapshot, checkin.guest_name_snapshot
      HAVING ABS(COALESCE(SUM(movement.charge_amount - movement.payment_amount), 0)) > 0.009;`)
      .forEach(row => issues.push(issue("warning", "OPEN_BALANCE", "Huesped con saldo abierto", row)));

    rows(`SELECT JSON_OBJECT('movementId', id, 'room', room_number_snapshot, 'amount', payment_amount, 'concept', concept)
      FROM account_movements WHERE operational_day_id = ${Number(day.id)} AND payment_amount > 0 AND TRIM(payment_method) = '';`)
      .forEach(row => issues.push(issue("blocking", "PAYMENT_WITHOUT_METHOD", "Pago sin forma de pago", row)));

    rows(`SELECT JSON_OBJECT('movementId', id, 'room', room_number_snapshot, 'occurredAt', DATE_FORMAT(occurred_at, '%Y-%m-%dT%H:%i:%s'))
      FROM account_movements WHERE DATE(occurred_at) >= ${mysql.quote(day.businessDate)} AND business_date IS NULL LIMIT 100;`)
      .forEach(row => issues.push(issue("warning", "MOVEMENT_WITHOUT_BUSINESS_DATE", "Movimiento reciente sin dia operativo", row)));

    const counts = issues.reduce((result, item) => {
      result[item.severity] = (result[item.severity] || 0) + 1;
      return result;
    }, { blocking: 0, warning: 0 });
    return { ...status, readyToClose: counts.blocking === 0, counts, issues, generatedAt: mysql.mexicoNowSql() };
  }

  return { getStatus, runPreclose };
}

module.exports = { createOperationalPrecloseService };
