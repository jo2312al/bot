CREATE TABLE IF NOT EXISTS room_types (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(80) NOT NULL,
  room_limit INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_room_types_code (code),
  UNIQUE KEY ux_room_types_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rooms (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_number VARCHAR(12) NOT NULL,
  floor_number INT UNSIGNED NOT NULL,
  room_type_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_rooms_room_number (room_number),
  CONSTRAINT fk_rooms_room_type
    FOREIGN KEY (room_type_id) REFERENCES room_types(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS guests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  guest_key CHAR(40) NOT NULL,
  name VARCHAR(180) NOT NULL,
  phone VARCHAR(60) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_guests_guest_key (guest_key),
  KEY ix_guests_phone (phone),
  KEY ix_guests_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reservations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_key VARCHAR(255) NOT NULL,
  source VARCHAR(40) NOT NULL,
  folio VARCHAR(80) NOT NULL DEFAULT '',
  guest_id BIGINT UNSIGNED NOT NULL,
  group_id VARCHAR(120) NOT NULL DEFAULT '',
  message_timestamp VARCHAR(80) NOT NULL DEFAULT '',
  start_date DATE NOT NULL,
  rooms_count INT UNSIGNED NOT NULL DEFAULT 1,
  adults_count INT UNSIGNED NOT NULL DEFAULT 0,
  children_count INT UNSIGNED NOT NULL DEFAULT 0,
  room_type_id BIGINT UNSIGNED NULL,
  rate_text VARCHAR(120) NOT NULL DEFAULT '',
  phone_snapshot VARCHAR(60) NOT NULL DEFAULT '',
  arrival_time_text VARCHAR(120) NOT NULL DEFAULT '',
  raw_text TEXT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'activa',
  arrival_at DATETIME NULL,
  assigned_room_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_reservations_source_key (source_key),
  KEY ix_reservations_folio (folio),
  KEY ix_reservations_start_date (start_date),
  KEY ix_reservations_status (status),
  KEY ix_reservations_source (source),
  CONSTRAINT fk_reservations_guest
    FOREIGN KEY (guest_id) REFERENCES guests(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_reservations_room_type
    FOREIGN KEY (room_type_id) REFERENCES room_types(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_reservations_assigned_room
    FOREIGN KEY (assigned_room_id) REFERENCES rooms(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reservation_dates (
  reservation_id BIGINT UNSIGNED NOT NULL,
  stay_date DATE NOT NULL,
  PRIMARY KEY (reservation_id, stay_date),
  KEY ix_reservation_dates_stay_date (stay_date),
  CONSTRAINT fk_reservation_dates_reservation
    FOREIGN KEY (reservation_id) REFERENCES reservations(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reservation_room_nights (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_id BIGINT UNSIGNED NOT NULL,
  room_id BIGINT UNSIGNED NOT NULL,
  stay_date DATE NOT NULL,
  occupancy_status VARCHAR(30) NOT NULL DEFAULT 'ocupada',
  source VARCHAR(40) NOT NULL DEFAULT 'arrival',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_reservation_room_nights_room_date (room_id, stay_date),
  KEY ix_reservation_room_nights_reservation_id (reservation_id),
  KEY ix_reservation_room_nights_stay_date (stay_date),
  KEY ix_reservation_room_nights_status (occupancy_status),
  CONSTRAINT fk_reservation_room_nights_reservation
    FOREIGN KEY (reservation_id) REFERENCES reservations(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_reservation_room_nights_room
    FOREIGN KEY (room_id) REFERENCES rooms(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reservation_notes (
  reservation_key VARCHAR(255) NOT NULL,
  reservation_id BIGINT UNSIGNED NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (reservation_key),
  KEY ix_reservation_notes_reservation_id (reservation_id),
  CONSTRAINT fk_reservation_notes_reservation
    FOREIGN KEY (reservation_id) REFERENCES reservations(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS closed_dates (
  closed_date DATE NOT NULL,
  reason VARCHAR(160) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (closed_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS room_event_types (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  affects_rotation TINYINT(1) NOT NULL DEFAULT 1,
  default_interval_days INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_room_event_types_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS room_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_id BIGINT UNSIGNED NOT NULL,
  event_type_id BIGINT UNSIGNED NOT NULL,
  event_date DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'hecho',
  title VARCHAR(160) NOT NULL DEFAULT '',
  notes TEXT NOT NULL,
  cost DECIMAL(12,2) NULL,
  created_by VARCHAR(120) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_room_events_room_date (room_id, event_date),
  KEY ix_room_events_type_date (event_type_id, event_date),
  KEY ix_room_events_status (status),
  CONSTRAINT fk_room_events_room
    FOREIGN KEY (room_id) REFERENCES rooms(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_room_events_type
    FOREIGN KEY (event_type_id) REFERENCES room_event_types(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_messages (
  message_key VARCHAR(255) NOT NULL,
  group_id VARCHAR(120) NOT NULL,
  message_timestamp VARCHAR(80) NOT NULL DEFAULT '',
  text MEDIUMTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_key),
  KEY ix_group_messages_group_id (group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reservation_group_notifications (
  id CHAR(36) NOT NULL,
  origin VARCHAR(40) NOT NULL DEFAULT 'dashboard',
  reservations_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY ix_reservation_group_notifications_sent_at (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rack_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_date DATE NULL,
  report_time TIME NULL,
  uploaded_at DATETIME NOT NULL,
  uploaded_by VARCHAR(120) NOT NULL DEFAULT '',
  file_name VARCHAR(255) NOT NULL DEFAULT '',
  payload_json JSON NOT NULL,
  PRIMARY KEY (id),
  KEY ix_rack_snapshots_uploaded_at (uploaded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rack_snapshot_rooms (
  rack_snapshot_id BIGINT UNSIGNED NOT NULL,
  room_id BIGINT UNSIGNED NOT NULL,
  room_status VARCHAR(20) NOT NULL,
  status_label VARCHAR(80) NOT NULL DEFAULT '',
  room_type_snapshot VARCHAR(80) NOT NULL DEFAULT '',
  PRIMARY KEY (rack_snapshot_id, room_id),
  KEY ix_rack_snapshot_rooms_status (room_status),
  CONSTRAINT fk_rack_snapshot_rooms_snapshot
    FOREIGN KEY (rack_snapshot_id) REFERENCES rack_snapshots(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_rack_snapshot_rooms_room
    FOREIGN KEY (room_id) REFERENCES rooms(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotation_menu_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(180) NOT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_quotation_menu_items_title (title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotations (
  id VARCHAR(80) NOT NULL,
  client VARCHAR(180) NOT NULL,
  contact VARCHAR(120) NOT NULL DEFAULT '',
  event_name VARCHAR(180) NOT NULL DEFAULT '',
  event_date DATE NULL,
  hall_id BIGINT UNSIGNED NULL,
  template VARCHAR(40) NOT NULL DEFAULT 'visual',
  headline VARCHAR(220) NOT NULL DEFAULT '',
  stay_dates VARCHAR(180) NOT NULL DEFAULT '',
  people_count INT UNSIGNED NOT NULL DEFAULT 0,
  check_in_text VARCHAR(60) NOT NULL DEFAULT '',
  check_out_text VARCHAR(60) NOT NULL DEFAULT '',
  valid_until VARCHAR(40) NOT NULL DEFAULT '',
  notes TEXT NOT NULL,
  service_charge_percent DECIMAL(6,2) NOT NULL DEFAULT 0,
  service_charge_base DECIMAL(12,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  service_charge DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  sections_json JSON NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_quotations_updated_at (updated_at),
  KEY ix_quotations_event_date (event_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_halls (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_event_halls_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quote_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  quotation_id VARCHAR(80) NULL,
  hall_id BIGINT UNSIGNED NOT NULL,
  event_date DATE NOT NULL,
  client VARCHAR(180) NOT NULL DEFAULT '',
  contact VARCHAR(120) NOT NULL DEFAULT '',
  event_name VARCHAR(180) NOT NULL DEFAULT '',
  status ENUM('cotizacion', 'apartado', 'pago_completo') NOT NULL DEFAULT 'cotizacion',
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_quote_events_date_hall (event_date, hall_id),
  KEY ix_quote_events_status (status),
  KEY ix_quote_events_quotation (quotation_id),
  CONSTRAINT fk_quote_events_quotation
    FOREIGN KEY (quotation_id) REFERENCES quotations(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_quote_events_hall
    FOREIGN KEY (hall_id) REFERENCES event_halls(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_payment_vouchers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  quote_event_id BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(220) NOT NULL,
  mime_type VARCHAR(120) NOT NULL DEFAULT '',
  file_path VARCHAR(500) NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL,
  uploaded_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_event_payment_vouchers_event (quote_event_id),
  CONSTRAINT fk_event_payment_vouchers_event
    FOREIGN KEY (quote_event_id) REFERENCES quote_events(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE OR REPLACE VIEW report_daily_occupancy AS
SELECT
  d.stay_date,
  COUNT(*) AS occupied_room_nights,
  COUNT(DISTINCT d.room_id) AS occupied_rooms,
  ROUND(COUNT(DISTINCT d.room_id) / NULLIF((SELECT COUNT(*) FROM rooms), 0) * 100, 2) AS occupancy_percent
FROM reservation_room_nights d
JOIN reservations r ON r.id = d.reservation_id
WHERE r.status != 'cancelada'
  AND d.occupancy_status = 'ocupada'
GROUP BY d.stay_date;

CREATE OR REPLACE VIEW report_monthly_room_rotation AS
SELECT
  DATE_FORMAT(d.stay_date, '%Y-%m-01') AS month_start,
  room.room_number,
  rt.name AS room_type,
  COUNT(d.id) AS occupied_nights,
  MAX(d.stay_date) AS last_occupied_date,
  MAX(CASE WHEN ret.code = 'DEEP_CLEAN' THEN re.event_date END) AS last_deep_clean_date,
  MAX(CASE WHEN ret.code = 'AC_MAINTENANCE' THEN re.event_date END) AS last_ac_maintenance_date,
  MAX(CASE WHEN ret.code = 'MAINTENANCE' THEN re.event_date END) AS last_maintenance_date
FROM rooms room
LEFT JOIN room_types rt ON rt.id = room.room_type_id
LEFT JOIN reservation_room_nights d ON d.room_id = room.id
LEFT JOIN room_events re ON re.room_id = room.id
LEFT JOIN room_event_types ret ON ret.id = re.event_type_id
GROUP BY DATE_FORMAT(d.stay_date, '%Y-%m-01'), room.id, room.room_number, rt.name;

CREATE OR REPLACE VIEW report_room_service_due AS
SELECT
  room.room_number,
  rt.name AS room_type,
  MAX(CASE WHEN ret.code = 'DEEP_CLEAN' THEN re.event_date END) AS last_deep_clean_date,
  DATEDIFF(CURDATE(), MAX(CASE WHEN ret.code = 'DEEP_CLEAN' THEN re.event_date END)) AS days_since_deep_clean,
  MAX(CASE WHEN ret.code = 'AC_MAINTENANCE' THEN re.event_date END) AS last_ac_maintenance_date,
  DATEDIFF(CURDATE(), MAX(CASE WHEN ret.code = 'AC_MAINTENANCE' THEN re.event_date END)) AS days_since_ac_maintenance,
  COUNT(DISTINCT CASE WHEN rn.stay_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN rn.id END) AS occupied_nights_last_30_days
FROM rooms room
LEFT JOIN room_types rt ON rt.id = room.room_type_id
LEFT JOIN room_events re ON re.room_id = room.id
LEFT JOIN room_event_types ret ON ret.id = re.event_type_id
LEFT JOIN reservation_room_nights rn ON rn.room_id = room.id
GROUP BY room.id, room.room_number, rt.name;

CREATE OR REPLACE VIEW report_reservations_by_source_month AS
SELECT
  DATE_FORMAT(start_date, '%Y-%m-01') AS month_start,
  source,
  COUNT(*) AS reservations_count,
  SUM(rooms_count) AS rooms_reserved,
  SUM(adults_count) AS adults_count,
  SUM(children_count) AS children_count
FROM reservations
WHERE status != 'cancelada'
GROUP BY DATE_FORMAT(start_date, '%Y-%m-01'), source;

CREATE OR REPLACE VIEW report_today_occupancy AS
SELECT
  room.room_number,
  rt.name AS room_type,
  CASE
    WHEN r.id IS NOT NULL THEN 'ocupada'
    ELSE 'libre'
  END AS occupancy_status,
  r.folio,
  g.name AS guest_name,
  r.arrival_at
FROM rooms room
LEFT JOIN room_types rt ON rt.id = room.room_type_id
LEFT JOIN reservation_room_nights rn
  ON rn.room_id = room.id
  AND rn.stay_date = CURDATE()
LEFT JOIN reservations r
  ON r.id = rn.reservation_id
  AND r.status != 'cancelada'
LEFT JOIN guests g ON g.id = r.guest_id;
