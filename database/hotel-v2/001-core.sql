-- HotelFlow v2: esquema Core para UNA base de datos individual de hotel.
-- No ejecutar contra una instalación existente sin una migración aprobada.

CREATE TABLE IF NOT EXISTS hotel_settings (
  id TINYINT UNSIGNED NOT NULL,
  legal_name VARCHAR(180) NOT NULL,
  display_name VARCHAR(180) NOT NULL,
  timezone VARCHAR(80) NOT NULL DEFAULT 'America/Mexico_City',
  currency CHAR(3) NOT NULL DEFAULT 'MXN',
  checkin_time TIME NULL,
  checkout_time TIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(60) NOT NULL,
  name VARCHAR(120) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id), UNIQUE KEY ux_app_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS app_permissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(100) NOT NULL,
  module_code VARCHAR(60) NOT NULL,
  name VARCHAR(160) NOT NULL,
  PRIMARY KEY (id), UNIQUE KEY ux_app_permissions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS app_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status ENUM('pending', 'active', 'locked', 'disabled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY ux_app_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS app_user_roles (
  user_id BIGINT UNSIGNED NOT NULL, role_id BIGINT UNSIGNED NOT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_v2_user_roles_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_v2_user_roles_role FOREIGN KEY (role_id) REFERENCES app_roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS app_role_permissions (
  role_id BIGINT UNSIGNED NOT NULL, permission_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_v2_role_permissions_role FOREIGN KEY (role_id) REFERENCES app_roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_v2_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES app_permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, user_id BIGINT UNSIGNED NULL,
  action_code VARCHAR(100) NOT NULL, entity_type VARCHAR(80) NOT NULL, entity_id VARCHAR(120) NOT NULL,
  reason VARCHAR(500) NOT NULL DEFAULT '', before_json JSON NULL, after_json JSON NULL,
  ip_address VARCHAR(64) NOT NULL DEFAULT '', user_agent VARCHAR(500) NOT NULL DEFAULT '', occurred_at DATETIME NOT NULL,
  PRIMARY KEY (id), KEY ix_audit_events_entity (entity_type, entity_id), KEY ix_audit_events_time (occurred_at),
  CONSTRAINT fk_v2_audit_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS room_types (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, code VARCHAR(32) NOT NULL, name VARCHAR(80) NOT NULL,
  capacity INT UNSIGNED NOT NULL, active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id), UNIQUE KEY ux_room_types_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS rooms (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, room_number VARCHAR(20) NOT NULL, floor_number INT NULL,
  room_type_id BIGINT UNSIGNED NULL, sellable TINYINT(1) NOT NULL DEFAULT 1, active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id), UNIQUE KEY ux_rooms_number (room_number),
  CONSTRAINT fk_v2_rooms_type FOREIGN KEY (room_type_id) REFERENCES room_types(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS guests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, full_name VARCHAR(180) NOT NULL,
  document_type VARCHAR(40) NOT NULL DEFAULT '', document_hash CHAR(64) NOT NULL DEFAULT '', company_name VARCHAR(180) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY ix_guests_name (full_name), KEY ix_guests_document_hash (document_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS guest_contacts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, guest_id BIGINT UNSIGNED NOT NULL,
  contact_type ENUM('phone', 'email') NOT NULL, contact_value VARCHAR(180) NOT NULL, normalized_value VARCHAR(180) NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0, verified_at DATETIME NULL,
  PRIMARY KEY (id), UNIQUE KEY ux_guest_contacts_type_value (contact_type, normalized_value), KEY ix_guest_contacts_guest (guest_id),
  CONSTRAINT fk_v2_guest_contacts_guest FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS guest_preferences (
  guest_id BIGINT UNSIGNED NOT NULL, preferences_json JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (guest_id),
  CONSTRAINT fk_v2_guest_preferences_guest FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS guest_consents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, guest_id BIGINT UNSIGNED NOT NULL, consent_type VARCHAR(60) NOT NULL,
  granted TINYINT(1) NOT NULL, recorded_at DATETIME NOT NULL, PRIMARY KEY (id), KEY ix_guest_consents_guest_type (guest_id, consent_type),
  CONSTRAINT fk_v2_guest_consents_guest FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reservations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, folio VARCHAR(80) NOT NULL, source VARCHAR(40) NOT NULL,
  status ENUM('draft', 'quoted', 'confirmed', 'cancelled', 'no_show', 'checked_in', 'completed') NOT NULL,
  primary_guest_id BIGINT UNSIGNED NOT NULL, arrival_date DATE NOT NULL, departure_date DATE NOT NULL,
  adults_count INT UNSIGNED NOT NULL DEFAULT 0, children_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY ux_reservations_folio (folio), KEY ix_reservations_arrival_status (arrival_date, status),
  CONSTRAINT fk_v2_reservations_guest FOREIGN KEY (primary_guest_id) REFERENCES guests(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS reservation_guests (
  reservation_id BIGINT UNSIGNED NOT NULL, guest_id BIGINT UNSIGNED NOT NULL, role_code ENUM('primary', 'companion') NOT NULL DEFAULT 'companion',
  PRIMARY KEY (reservation_id, guest_id),
  CONSTRAINT fk_v2_reservation_guests_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
  CONSTRAINT fk_v2_reservation_guests_guest FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS reservation_nights (
  reservation_id BIGINT UNSIGNED NOT NULL, stay_date DATE NOT NULL, PRIMARY KEY (reservation_id, stay_date),
  CONSTRAINT fk_v2_reservation_nights_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS reservation_room_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, reservation_id BIGINT UNSIGNED NOT NULL,
  room_id BIGINT UNSIGNED NULL, room_type_id BIGINT UNSIGNED NULL,
  assignment_status ENUM('requested', 'preassigned', 'assigned', 'cancelled') NOT NULL DEFAULT 'requested',
  rate_amount DECIMAL(12,2) NOT NULL DEFAULT 0, currency CHAR(3) NOT NULL DEFAULT 'MXN', rate_snapshot JSON NOT NULL,
  PRIMARY KEY (id), KEY ix_reservation_assignments_reservation (reservation_id),
  CONSTRAINT fk_v2_reservation_assignments_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
  CONSTRAINT fk_v2_reservation_assignments_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL,
  CONSTRAINT fk_v2_reservation_assignments_type FOREIGN KEY (room_type_id) REFERENCES room_types(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stays (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, reservation_id BIGINT UNSIGNED NULL, primary_guest_id BIGINT UNSIGNED NOT NULL,
  status ENUM('checked_in', 'checked_out', 'cancelled') NOT NULL DEFAULT 'checked_in', checked_in_at DATETIME NOT NULL, checked_out_at DATETIME NULL,
  guest_snapshot JSON NOT NULL, created_by_user_id BIGINT UNSIGNED NULL, checked_out_by_user_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (id), KEY ix_stays_guest_status (primary_guest_id, status),
  CONSTRAINT fk_v2_stays_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL,
  CONSTRAINT fk_v2_stays_guest FOREIGN KEY (primary_guest_id) REFERENCES guests(id) ON DELETE RESTRICT,
  CONSTRAINT fk_v2_stays_created_by FOREIGN KEY (created_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_v2_stays_checked_out_by FOREIGN KEY (checked_out_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS stay_room_moves (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, stay_id BIGINT UNSIGNED NOT NULL, room_id BIGINT UNSIGNED NOT NULL,
  started_at DATETIME NOT NULL, ended_at DATETIME NULL, reason VARCHAR(300) NOT NULL DEFAULT '', room_snapshot JSON NOT NULL,
  changed_by_user_id BIGINT UNSIGNED NULL, PRIMARY KEY (id), KEY ix_stay_room_moves_active_room (room_id, ended_at),
  CONSTRAINT fk_v2_stay_room_moves_stay FOREIGN KEY (stay_id) REFERENCES stays(id) ON DELETE CASCADE,
  CONSTRAINT fk_v2_stay_room_moves_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE RESTRICT,
  CONSTRAINT fk_v2_stay_room_moves_user FOREIGN KEY (changed_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS folios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, stay_id BIGINT UNSIGNED NOT NULL, folio_number VARCHAR(80) NOT NULL,
  status ENUM('open', 'settled', 'closed') NOT NULL DEFAULT 'open', PRIMARY KEY (id), UNIQUE KEY ux_folios_number (folio_number),
  CONSTRAINT fk_v2_folios_stay FOREIGN KEY (stay_id) REFERENCES stays(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS folio_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, folio_id BIGINT UNSIGNED NOT NULL,
  entry_type ENUM('charge', 'payment', 'refund', 'adjustment', 'discount', 'reversal') NOT NULL,
  balance_direction ENUM('debit', 'credit') NOT NULL, amount DECIMAL(12,2) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'MXN',
  concept VARCHAR(255) NOT NULL,
  fiscal_status ENUM('no_solicitada', 'solicitada', 'pendiente_datos', 'timbrada', 'cancelada') NOT NULL DEFAULT 'no_solicitada',
  tax_snapshot JSON NULL, reverses_entry_id BIGINT UNSIGNED NULL, created_by_user_id BIGINT UNSIGNED NULL, created_at DATETIME NOT NULL,
  PRIMARY KEY (id), KEY ix_folio_entries_folio_time (folio_id, created_at), KEY ix_folio_entries_fiscal_status (fiscal_status),
  CONSTRAINT fk_v2_folio_entries_folio FOREIGN KEY (folio_id) REFERENCES folios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_v2_folio_entries_reversal FOREIGN KEY (reverses_entry_id) REFERENCES folio_entries(id) ON DELETE RESTRICT,
  CONSTRAINT fk_v2_folio_entries_user FOREIGN KEY (created_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS payment_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, folio_entry_id BIGINT UNSIGNED NOT NULL,
  payment_method ENUM('efectivo', 'tarjeta', 'transferencia', 'link', 'ota', 'credito_empresa', 'otro') NOT NULL,
  reference_code VARCHAR(180) NOT NULL DEFAULT '', received_at DATETIME NOT NULL,
  PRIMARY KEY (id), UNIQUE KEY ux_payment_transactions_entry (folio_entry_id), KEY ix_payment_transactions_method_time (payment_method, received_at),
  CONSTRAINT fk_v2_payment_transactions_entry FOREIGN KEY (folio_entry_id) REFERENCES folio_entries(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS operating_days (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, business_date DATE NOT NULL,
  status ENUM('open', 'closing', 'closed', 'reopened') NOT NULL DEFAULT 'open', opened_at DATETIME NOT NULL, closed_at DATETIME NULL,
  opened_by_user_id BIGINT UNSIGNED NULL, closed_by_user_id BIGINT UNSIGNED NULL, close_snapshot JSON NULL,
  PRIMARY KEY (id), UNIQUE KEY ux_operating_days_date (business_date),
  CONSTRAINT fk_v2_operating_days_opened_by FOREIGN KEY (opened_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_v2_operating_days_closed_by FOREIGN KEY (closed_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS room_current_states (
  room_id BIGINT UNSIGNED NOT NULL,
  state ENUM('available', 'reserved', 'occupied', 'dirty', 'clean', 'inspection', 'blocked', 'maintenance', 'out_of_service') NOT NULL,
  active_stay_id BIGINT UNSIGNED NULL, updated_at DATETIME NOT NULL, version INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (room_id), KEY ix_room_current_states_state (state),
  CONSTRAINT fk_v2_room_current_states_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_v2_room_current_states_stay FOREIGN KEY (active_stay_id) REFERENCES stays(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS room_state_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, room_id BIGINT UNSIGNED NOT NULL,
  from_state VARCHAR(40) NOT NULL, to_state VARCHAR(40) NOT NULL, source_event VARCHAR(80) NOT NULL,
  reason VARCHAR(300) NOT NULL DEFAULT '', user_id BIGINT UNSIGNED NULL, occurred_at DATETIME NOT NULL,
  PRIMARY KEY (id), KEY ix_room_state_events_room_time (room_id, occurred_at),
  CONSTRAINT fk_v2_room_state_events_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE RESTRICT,
  CONSTRAINT fk_v2_room_state_events_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cash_drawers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, name VARCHAR(100) NOT NULL,
  fixed_float DECIMAL(12,2) NOT NULL DEFAULT 0, active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id), UNIQUE KEY ux_cash_drawers_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS cash_shifts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, cash_drawer_id BIGINT UNSIGNED NOT NULL, operating_day_id BIGINT UNSIGNED NOT NULL,
  status ENUM('open', 'closed', 'reopened') NOT NULL DEFAULT 'open', opening_float DECIMAL(12,2) NOT NULL,
  counted_cash DECIMAL(12,2) NULL, expected_cash DECIMAL(12,2) NULL, difference_amount DECIMAL(12,2) NULL, deposit_amount DECIMAL(12,2) NULL,
  opened_by_user_id BIGINT UNSIGNED NULL, closed_by_user_id BIGINT UNSIGNED NULL, opened_at DATETIME NOT NULL, closed_at DATETIME NULL,
  PRIMARY KEY (id), KEY ix_cash_shifts_drawer_day (cash_drawer_id, operating_day_id),
  CONSTRAINT fk_v2_cash_shifts_drawer FOREIGN KEY (cash_drawer_id) REFERENCES cash_drawers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_v2_cash_shifts_day FOREIGN KEY (operating_day_id) REFERENCES operating_days(id) ON DELETE RESTRICT,
  CONSTRAINT fk_v2_cash_shifts_opened_by FOREIGN KEY (opened_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_v2_cash_shifts_closed_by FOREIGN KEY (closed_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS cash_count_lines (
  cash_shift_id BIGINT UNSIGNED NOT NULL, denomination DECIMAL(12,2) NOT NULL, quantity INT UNSIGNED NOT NULL,
  PRIMARY KEY (cash_shift_id, denomination),
  CONSTRAINT fk_v2_cash_count_lines_shift FOREIGN KEY (cash_shift_id) REFERENCES cash_shifts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
