const ACTIVE_STATUSES = ["opening", "open", "closing", "reopened"];

function normalizeBusinessDate(value) {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("Fecha operativa invalida.");
  return text;
}

function addDays(isoDate, days) {
  const date = new Date(`${normalizeBusinessDate(isoDate)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function createOperationalDayService(mysql, options = {}) {
  const propertyKey = String(options.propertyKey || "villa-margaritas").trim();

  function requireDatabase() {
    if (!mysql.ensureSchema()) throw new Error("Activa MySQL para usar el dia operativo.");
  }

  function getOpenDay() {
    requireDatabase();
    const rows = mysql.queryJson(`
      SELECT JSON_OBJECT(
        'id', id,
        'propertyKey', property_key,
        'businessDate', DATE_FORMAT(business_date, '%Y-%m-%d'),
        'status', status,
        'openedAt', DATE_FORMAT(opened_at, '%Y-%m-%dT%H:%i:%s'),
        'closeVersion', close_version
      )
      FROM operational_days
      WHERE property_key = ${mysql.quote(propertyKey)}
        AND status IN (${ACTIVE_STATUSES.map(mysql.quote).join(",")})
      ORDER BY business_date LIMIT 1;
    `);
    return rows[0] || null;
  }

  function getDay(businessDate) {
    requireDatabase();
    const date = normalizeBusinessDate(businessDate);
    const rows = mysql.queryJson(`
      SELECT JSON_OBJECT(
        'id', id, 'propertyKey', property_key,
        'businessDate', DATE_FORMAT(business_date, '%Y-%m-%d'),
        'status', status,
        'openedAt', DATE_FORMAT(opened_at, '%Y-%m-%dT%H:%i:%s'),
        'closedAt', IFNULL(DATE_FORMAT(closed_at, '%Y-%m-%dT%H:%i:%s'), ''),
        'closeVersion', close_version
      )
      FROM operational_days
      WHERE property_key = ${mysql.quote(propertyKey)} AND business_date = ${mysql.quote(date)}
      LIMIT 1;
    `);
    return rows[0] || null;
  }

  function openDay({ businessDate, userId = null } = {}) {
    requireDatabase();
    const date = normalizeBusinessDate(businessDate);
    const now = mysql.mexicoNowSql();
    const userSql = userId ? Number(userId) : "NULL";

    mysql.runSql(`
      START TRANSACTION;

      INSERT INTO operational_days (
        property_key, business_date, status, opened_at, opened_by_user_id, close_notes
      ) VALUES (
        ${mysql.quote(propertyKey)}, ${mysql.quote(date)}, 'opening', ${mysql.quote(now)}, ${userSql}, ''
      );

      SET @operational_day_id = LAST_INSERT_ID();

      INSERT INTO operational_room_states (
        operational_day_id, room_id, opening_status, current_status,
        active_checkin_id, source, updated_by_user_id
      )
      SELECT
        @operational_day_id,
        room.id,
        CASE WHEN active_checkin.id IS NULL THEN 'libre' ELSE 'ocupada' END,
        CASE WHEN active_checkin.id IS NULL THEN 'libre' ELSE 'ocupada' END,
        active_checkin.id,
        'opening',
        ${userSql}
      FROM rooms room
      LEFT JOIN checkins active_checkin
        ON active_checkin.id = (
          SELECT candidate.id
          FROM checkins candidate
          WHERE candidate.room_id = room.id AND candidate.status = 'activo'
          ORDER BY candidate.checked_in_at DESC, candidate.id DESC
          LIMIT 1
        );

      SET @snapshot_payload = (
        SELECT JSON_OBJECT(
          'businessDate', ${mysql.quote(date)},
          'snapshotType', 'opening',
          'createdAt', ${mysql.quote(now)},
          'rooms', COALESCE((
            SELECT JSON_ARRAYAGG(JSON_OBJECT(
              'roomId', state.room_id,
              'room', room.room_number,
              'status', state.current_status,
              'checkinId', state.active_checkin_id
            ))
            FROM operational_room_states state
            JOIN rooms room ON room.id = state.room_id
            WHERE state.operational_day_id = @operational_day_id
          ), JSON_ARRAY())
        )
      );

      INSERT INTO operational_day_snapshots (
        operational_day_id, snapshot_type, version, payload_json, checksum, created_by_user_id
      ) VALUES (
        @operational_day_id, 'opening', 1, @snapshot_payload,
        SHA2(CAST(@snapshot_payload AS CHAR CHARACTER SET utf8mb4), 256), ${userSql}
      );

      UPDATE operational_days SET status = 'open' WHERE id = @operational_day_id;
      COMMIT;
    `);

    return getDay(date);
  }

  function getOrOpenDay({ businessDate, userId = null } = {}) {
    const current = getOpenDay();
    if (current) return current;
    return openDay({ businessDate, userId });
  }

  function getNextDate(day) {
    return addDays(day?.businessDate || day, 1);
  }

  function closeDay({ userId = null, userName = "dashboard", notes = "", totals = {} } = {}) {
    const day = getOpenDay();
    if (!day) throw new Error("No existe un dia operativo abierto.");
    const nextDate = addDays(day.businessDate, 1);
    const now = mysql.mexicoNowSql();
    const userSql = userId ? Number(userId) : "NULL";
    const version = Number(day.closeVersion || 0) + 1;
    mysql.runSql(`
      START TRANSACTION;
      UPDATE operational_days SET status = 'closing' WHERE id = ${Number(day.id)} AND status IN ('open', 'reopened');
      UPDATE operational_room_states SET closing_status = current_status WHERE operational_day_id = ${Number(day.id)};
      SET @closing_payload = (SELECT JSON_OBJECT(
        'businessDate', ${mysql.quote(day.businessDate)}, 'snapshotType', 'closing',
        'createdAt', ${mysql.quote(now)}, 'totals', CAST(${mysql.quote(JSON.stringify(totals))} AS JSON),
        'rooms', COALESCE((SELECT JSON_ARRAYAGG(JSON_OBJECT('roomId', state.room_id, 'room', room.room_number,
          'status', state.current_status, 'checkinId', state.active_checkin_id))
          FROM operational_room_states state JOIN rooms room ON room.id = state.room_id
          WHERE state.operational_day_id = ${Number(day.id)}), JSON_ARRAY())
      ));
      INSERT INTO operational_day_snapshots (operational_day_id, snapshot_type, version, payload_json, checksum, created_by_user_id)
      VALUES (${Number(day.id)}, 'closing', ${version}, @closing_payload,
        SHA2(CAST(@closing_payload AS CHAR CHARACTER SET utf8mb4), 256), ${userSql});
      UPDATE operational_days SET status = 'closed', closed_at = ${mysql.quote(now)}, closed_by_user_id = ${userSql},
        close_notes = ${mysql.quote(notes)}, close_version = ${version}, totals_json = CAST(${mysql.quote(JSON.stringify(totals))} AS JSON)
      WHERE id = ${Number(day.id)};
      INSERT INTO daily_closures (closed_date, closed_at, closed_by, notes)
      VALUES (${mysql.quote(day.businessDate)}, ${mysql.quote(now)}, ${mysql.quote(userName)}, ${mysql.quote(notes)})
      ON DUPLICATE KEY UPDATE closed_at = VALUES(closed_at), closed_by = VALUES(closed_by), notes = VALUES(notes);
      INSERT INTO operational_days (property_key, business_date, status, opened_at, opened_by_user_id, close_notes)
      VALUES (${mysql.quote(propertyKey)}, ${mysql.quote(nextDate)}, 'opening', ${mysql.quote(now)}, ${userSql}, '');
      SET @next_day_id = LAST_INSERT_ID();
      INSERT INTO operational_room_states (operational_day_id, room_id, opening_status, current_status, active_checkin_id, source, updated_by_user_id)
      SELECT @next_day_id, room_id,
        CASE WHEN active_checkin_id IS NOT NULL THEN 'ocupada' ELSE current_status END,
        CASE WHEN active_checkin_id IS NOT NULL THEN 'ocupada' ELSE current_status END,
        active_checkin_id, 'carry_forward', ${userSql}
      FROM operational_room_states WHERE operational_day_id = ${Number(day.id)};
      UPDATE operational_days SET status = 'open' WHERE id = @next_day_id;
      COMMIT;
    `);
    return { date: day.businessDate, nextDate, day: getDay(day.businessDate), nextDay: getDay(nextDate) };
  }

  return { closeDay, getDay, getNextDate, getOpenDay, getOrOpenDay, openDay };
}

module.exports = { addDays, createOperationalDayService, normalizeBusinessDate };
