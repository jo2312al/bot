function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function createDashboardSearchService({
  mysql,
  getSummary
}) {
  function getGuestHistory(query) {
    const text =
      String(query || "")
        .trim();

    if (!text || text.length < 2 || !mysql.ensureSchema()) {
      return [];
    }

    const like =
      `%${text}%`;

    return mysql.queryJson(`
      SELECT JSON_OBJECT(
        'reservationId', reservation.id,
        'folio', reservation.folio,
        'source', reservation.source,
        'status', reservation.status,
        'guestName', guest.name,
        'phone', IFNULL(NULLIF(reservation.phone_snapshot, ''), guest.phone),
        'startDate', DATE_FORMAT(reservation.start_date, '%d/%m/%Y'),
        'roomType', IFNULL(room_type.name, ''),
        'roomsCount', reservation.rooms_count,
        'adults', reservation.adults_count,
        'children', reservation.children_count,
        'arrivalTime', reservation.arrival_time_text,
        'assignedRoom', IFNULL(room.room_number, ''),
        'rate', reservation.rate_text,
        'note', IFNULL(note.note, ''),
        'dates', IFNULL((
          SELECT GROUP_CONCAT(DATE_FORMAT(date_item.stay_date, '%d/%m/%Y') ORDER BY date_item.stay_date SEPARATOR ', ')
          FROM reservation_dates date_item
          WHERE date_item.reservation_id = reservation.id
        ), '')
      )
      FROM reservations reservation
      JOIN guests guest ON guest.id = reservation.guest_id
      LEFT JOIN room_types room_type ON room_type.id = reservation.room_type_id
      LEFT JOIN rooms room ON room.id = reservation.assigned_room_id
      LEFT JOIN reservation_notes note ON note.reservation_id = reservation.id
      WHERE
        guest.name LIKE ${mysql.quote(like)}
        OR guest.phone LIKE ${mysql.quote(like)}
        OR reservation.phone_snapshot LIKE ${mysql.quote(like)}
        OR reservation.folio LIKE ${mysql.quote(like)}
        OR reservation.raw_text LIKE ${mysql.quote(like)}
      ORDER BY reservation.start_date DESC, reservation.id DESC
      LIMIT 60;
    `);
  }

  function getGlobalSearch(query) {
    const text =
      String(query || "")
        .trim();
    const normalized =
      normalizeText(text);

    if (!normalized || normalized.length < 2) {
      return {
        query:
          text,
        reservations:
          [],
        events:
          [],
        quotations:
          [],
        guests:
          [],
        blocks:
          []
      };
    }

    const summary =
      getSummary();
    const matches =
      value => normalizeText(value).includes(normalized);

    return {
      query:
        text,
      reservations:
        (summary.groupReservations || [])
          .filter(reservation =>
            [
              reservation.nombre,
              reservation.telefono,
              reservation.tarifa,
              reservation.folio,
              reservation.habitacion,
              reservation.habitacionAsignada,
              reservation.tipo,
              reservation.nota
            ].some(matches)
          )
          .slice(0, 20),
      events:
        (summary.eventBookings || [])
          .filter(event =>
            [
              event.client,
              event.contact,
              event.eventName,
              event.hallName,
              event.status,
              event.notes
            ].some(matches)
          )
          .slice(0, 20),
      quotations:
        (summary.quotations || [])
          .filter(quote =>
            [
              quote.id,
              quote.client,
              quote.contact,
              quote.eventName,
              quote.hallName
            ].some(matches)
          )
          .slice(0, 20),
      guests:
        getGuestHistory(text)
          .slice(0, 20),
      blocks:
        (summary.roomBlocks || [])
          .filter(block =>
            [
              block.roomNumber,
              block.reason,
              block.notes,
              block.status
            ].some(matches)
          )
          .slice(0, 20)
    };
  }

  return {
    getGlobalSearch,
    getGuestHistory
  };
}

module.exports = {
  createDashboardSearchService,
  normalizeText
};
