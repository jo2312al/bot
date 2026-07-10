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
        'endDate', (
          SELECT DATE_FORMAT(DATE_ADD(MAX(stay.stay_date), INTERVAL 1 DAY), '%Y-%m-%d')
          FROM reservation_dates stay WHERE stay.reservation_id = reservation.id
        ),
        'roomType', COALESCE(room_type.name, ''),
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
      LEFT JOIN room_types room_type ON room_type.id = reservation.room_type_id
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

  function updateCheckin(input) {
    requireDatabase();
    const current = getCheckinByRoom(input.room || input.currentRoom);
    if (!current) throw new Error('No hay un check-in activo para esta habitacion.');

    const checkinId = Number(current.id);
    const guestName = String(input.guestName || current.guestName || '').trim();
    const roomNumber = String(input.newRoom || input.room || current.room || '').replace(/\D/g, '');
    const startDate = normalizeIsoDate(input.startDate || current.startDate);
    const endDate = normalizeIsoDate(input.endDate || current.endDate);
    const pax = Math.max(Number(input.pax || current.pax || 1), 1);
    const rate = String(input.rate ?? current.rate ?? '').trim();
    const notes = String(input.notes ?? current.notes ?? '').trim();

    if (!guestName) throw new Error('El nombre del huesped es requerido.');
    if (!roomNumber) throw new Error('La habitacion es requerida.');

    const rooms = mysql.queryJson(`
      SELECT JSON_OBJECT('id', id, 'roomNumber', room_number)
      FROM rooms WHERE room_number = ${mysql.quote(roomNumber)}
      LIMIT 1;
    `);
    const room = rooms[0];
    if (!room?.id) throw new Error('Habitacion no encontrada.');

    mysql.runSql(`
      UPDATE guests guest
      JOIN checkins checkin ON checkin.guest_id = guest.id
      SET guest.name = ${mysql.quote(guestName)}
      WHERE checkin.id = ${checkinId};
    `);

    mysql.runSql(`
      UPDATE checkins
      SET
        room_id = ${Number(room.id)},
        room_number_snapshot = ${mysql.quote(roomNumber)},
        guest_name_snapshot = ${mysql.quote(guestName)}
      WHERE id = ${checkinId};
    `);

    mysql.runSql(`
      UPDATE account_movements
      SET
        room_id = ${Number(room.id)},
        room_number_snapshot = ${mysql.quote(roomNumber)}
      WHERE checkin_id = ${checkinId};
    `);

    if (current.reservationId) {
      mysql.runSql(`
        UPDATE reservations
        SET
          assigned_room_id = ${Number(room.id)},
          start_date = ${startDate ? mysql.quote(startDate) : "start_date"},
          adults_count = ${pax},
          children_count = 0,
          rate_text = ${mysql.quote(rate)}
        WHERE id = ${Number(current.reservationId)};
      `);

      if (startDate) {
        replaceReservationDates(Number(current.reservationId), startDate, endDate || startDate);
      }

      mysql.runSql(`
        INSERT INTO reservation_notes (
          reservation_key,
          reservation_id,
          note
        )
        SELECT source_key, id, ${mysql.quote(notes)}
        FROM reservations
        WHERE id = ${Number(current.reservationId)}
        ON DUPLICATE KEY UPDATE
          reservation_id = VALUES(reservation_id),
          note = VALUES(note);
      `);
    }

    return getCheckinByRoom(roomNumber);
  }

  function checkout(room) {
    requireDatabase();
    const checkin = getCheckinByRoom(room);
    if (!checkin) return null;
    const balance = Number(checkin.balance || 0);
    if (balance > 0.009) {
      throw new Error('No se puede hacer check-out: la habitacion tiene cargos pendientes por ' + balance.toFixed(2) + '.');
    }

    mysql.runSql(`
      UPDATE checkins
      SET status = 'cerrado', checked_out_at = NOW()
      WHERE id = ${Number(checkin.id)};
    `);

    return checkin;
  }

  function normalizeIsoDate(value) {
    const text = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
  }

  function replaceReservationDates(reservationId, startDate, endDate) {
    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date((endDate || startDate) + 'T00:00:00Z');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;

    mysql.runSql(`DELETE FROM reservation_dates WHERE reservation_id = ${reservationId};`);

    const dates = [];
    const cursor = new Date(start);
    const final = end > start ? end : new Date(start.getTime() + 86400000);
    while (cursor < final && dates.length < 370) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    if (!dates.length) {
      dates.push(startDate);
    }

    mysql.runSql(`
      INSERT INTO reservation_dates (reservation_id, stay_date)
      VALUES ${dates.map(date => `(${reservationId}, ${mysql.quote(date)})`).join(', ')};
    `);
  }

  return { recordCheckin, getCheckinByRoom, addMovement, updateCheckin, checkout };
}

module.exports = { createCheckinLedgerService };
