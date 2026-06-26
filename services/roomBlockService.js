function createRoomBlockService(mysql) {
  function readRoomBlocks() {
    if (!mysql.ensureSchema()) {
      return [];
    }

    return mysql.queryJson(`
      SELECT JSON_OBJECT(
        'id', block.id,
        'roomNumber', room.room_number,
        'startDate', DATE_FORMAT(block.start_date, '%Y-%m-%d'),
        'endDate', DATE_FORMAT(block.end_date, '%Y-%m-%d'),
        'reason', block.reason,
        'notes', block.notes,
        'status', block.status,
        'createdBy', block.created_by,
        'createdAt', DATE_FORMAT(block.created_at, '%Y-%m-%dT%H:%i:%s.000Z')
      )
      FROM room_blocks block
      JOIN rooms room ON room.id = block.room_id
      WHERE block.end_date >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)
      ORDER BY
        block.status = 'activo' DESC,
        block.start_date DESC,
        room.room_number;
    `);
  }

  function saveRoomBlock(input) {
    if (!mysql.ensureSchema()) {
      throw new Error("Activa MySQL para guardar bloqueos de habitaciones");
    }

    const room =
      String(input.roomNumber || "")
        .replace(/\D/g, "");
    const startDate =
      String(input.startDate || "")
        .trim();
    const endDate =
      String(input.endDate || startDate)
        .trim();
    const reason =
      String(input.reason || "")
        .trim();
    const status =
      String(input.status || "activo")
        .trim()
        .toLowerCase();

    if (!room || !startDate || !endDate || !reason) {
      throw new Error("Habitacion, fechas y motivo son requeridos");
    }

    if (endDate < startDate) {
      throw new Error("La fecha final no puede ser menor a la inicial");
    }

    mysql.runSql(`
      INSERT INTO room_blocks (
        room_id,
        start_date,
        end_date,
        reason,
        notes,
        status,
        created_by
      ) VALUES (
        (SELECT id FROM rooms WHERE room_number = ${mysql.quote(room)}),
        ${mysql.quote(startDate)},
        ${mysql.quote(endDate)},
        ${mysql.quote(reason)},
        ${mysql.quote(input.notes || "")},
        ${mysql.quote(status || "activo")},
        ${mysql.quote(input.createdBy || "dashboard")}
      );
    `);

    return {
      ok:
        true
    };
  }

  return {
    readRoomBlocks,
    saveRoomBlock
  };
}

module.exports = {
  createRoomBlockService
};
