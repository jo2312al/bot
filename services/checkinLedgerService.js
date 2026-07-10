function createCheckinLedgerService(mysql) {
  function requireDatabase() {
    if (!mysql.ensureSchema()) {
      throw new Error('Activa MySQL para consultar check-ins y movimientos.');
    }
  }

  function recordCheckin({ sourceKey, room }) {
    requireDatabase();
    const key = String(sourceKey || '').trim();
    const roomNumber = String(room || '').replace(/\D/g, '');

    if (!key || !roomNumber) throw new Error('Reserva y habitación son requeridas.');

    mysql.runSql(`
      INSERT INTO checkins (
        reservation_id, guest_id, room_id, guest_name_snapshot, room_number_snapshot
      )
      SELECT reservation.id, reservation.guest_id, room.id, guest.name, room.room_number
      FROM reservations reservation
      JOIN guests guest ON guest.id = reservation.guest_id
      JOIN rooms room ON room.room_number = ${mysql.quote(roomNumber)}
      WHERE reservation.source_key = ${mysql.quote(key)}
      ON DUPLICATE KEY UPDATE
        guest_id = VALUES(guest_id),
        room_id = VALUES(room_id),
        guest_name_snapshot = VALUES(guest_name_snapshot),
        room_number_snapshot = VALUES(room_number_snapshot),
        checked_out_at = NULL,
        status = 'activo';
    `);

    return getCheckinByRoom(roomNumber);
  }

  function getCheckinByRoom(room, allowLegacyLookup = true) {
    requireDatabase();
    const roomNumber = String(room || '').replace(/\D/g, '');
    const rows = mysql.queryJson(`
      SELECT JSON_OBJECT(
        'id', checkin.id,
        'guestName', checkin.guest_name_snapshot,
        'room', checkin.room_number_snapshot,
        'checkedInAt', DATE_FORMAT(checkin.checked_in_at, '%Y-%m-%dT%H:%i:%s'),
        'reservationId', checkin.reservation_id,
        'folio', COALESCE(reservation.folio, ''),
        'rate', COALESCE(reservation.rate_text, ''),
        'startDate', DATE_FORMAT(reservation.start_date, '%Y-%m-%d'),
        'pax', COALESCE(reservation.adults_count, 0) + COALESCE(reservation.children_count, 0),
        'notes', COALESCE(reservation_note.note, ''),
        'balance', (
          SELECT COALESCE(SUM(movement.charge_amount - movement.payment_amount), 0)
          FROM account_movements movement WHERE movement.checkin_id = checkin.id
        ),
        'movements', (
          SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
            'id', movement.id,
            'concept', movement.concept,
            'paymentMethod', movement.payment_method,
            'reference', movement.reference_code,
            'charge', movement.charge_amount,
            'payment', movement.payment_amount,
            'occurredAt', DATE_FORMAT(movement.occurred_at, '%Y-%m-%dT%H:%i:%s')
          )), JSON_ARRAY())
          FROM account_movements movement WHERE movement.checkin_id = checkin.id
        )
      )
      FROM checkins checkin
      LEFT JOIN reservations reservation ON reservation.id = checkin.reservation_id
      LEFT JOIN reservation_notes reservation_note ON reservation_note.reservation_id = reservation.id
      WHERE checkin.room_number_snapshot = ${mysql.quote(roomNumber)}
        AND checkin.status = 'activo'
      ORDER BY checkin.checked_in_at DESC LIMIT 1;
    `);

    if (rows[0] || !allowLegacyLookup) return rows[0] || null;

    mysql.runSql(`
      INSERT INTO checkins (
        reservation_id, guest_id, room_id, guest_name_snapshot, room_number_snapshot
      )
      SELECT reservation.id, reservation.guest_id, room.id, guest.name, room.room_number
      FROM reservations reservation
      JOIN guests guest ON guest.id = reservation.guest_id
      JOIN rooms room ON room.id = reservation.assigned_room_id
      WHERE room.room_number = ${mysql.quote(roomNumber)}
        AND reservation.arrival_at IS NOT NULL
        AND reservation.status != 'cancelada'
      ORDER BY reservation.arrival_at DESC
      LIMIT 1
      ON DUPLICATE KEY UPDATE
        guest_id = VALUES(guest_id), room_id = VALUES(room_id),
        guest_name_snapshot = VALUES(guest_name_snapshot),
        room_number_snapshot = VALUES(room_number_snapshot), status = 'activo', checked_out_at = NULL;
    `);

    return getCheckinByRoom(roomNumber, false);
  }

  function addMovement(input) {
    requireDatabase();
    const checkin = getCheckinByRoom(input.room);
    if (!checkin) throw new Error('No hay un check-in activo para esta habitación.');

    const charge = Math.max(Number(input.charge || 0), 0);
    const payment = Math.max(Number(input.payment || 0), 0);
    if (!charge && !payment) throw new Error('Indica un cargo o un pago mayor a cero.');

    mysql.runSql(`
      INSERT INTO account_movements (
        checkin_id, guest_id, room_id, room_number_snapshot, movement_type,
        payment_method, reference_code, concept, charge_amount, payment_amount
      )
      SELECT checkin.id, checkin.guest_id, checkin.room_id, checkin.room_number_snapshot,
        ${mysql.quote(payment ? 'pago' : 'cargo')},
        ${mysql.quote(input.paymentMethod || '')}, ${mysql.quote(input.reference || '')},
        ${mysql.quote(input.concept || '')}, ${charge}, ${payment}
      FROM checkins checkin WHERE checkin.id = ${Number(checkin.id)};
    `);

    return getCheckinByRoom(input.room);
  }

  function checkout(room) {
    requireDatabase();
    const checkin = getCheckinByRoom(room);
    if (!checkin) return null;

    mysql.runSql(`
      UPDATE checkins
      SET status = 'cerrado', checked_out_at = NOW()
      WHERE id = ${Number(checkin.id)};
    `);

    return checkin;
  }

  return { recordCheckin, getCheckinByRoom, addMovement, checkout };
}

module.exports = { createCheckinLedgerService };
