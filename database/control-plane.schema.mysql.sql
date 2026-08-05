-- Control Plane de HotelFlow. Esta base NO guarda huéspedes, reservas, pagos ni CFDI.
CREATE TABLE IF NOT EXISTS plans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(60) NOT NULL,
  name VARCHAR(120) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_plans_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS modules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  version VARCHAR(40) NOT NULL,
  is_core TINYINT(1) NOT NULL DEFAULT 0,
  description VARCHAR(500) NOT NULL DEFAULT '',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_modules_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plan_modules (
  plan_id BIGINT UNSIGNED NOT NULL,
  module_id BIGINT UNSIGNED NOT NULL,
  included TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (plan_id, module_id),
  CONSTRAINT fk_plan_modules_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_plan_modules_module FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hotels (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  hotel_key VARCHAR(80) NOT NULL,
  legal_name VARCHAR(180) NOT NULL,
  display_name VARCHAR(180) NOT NULL,
  status ENUM('draft', 'provisioning', 'active', 'suspended', 'failed', 'archived') NOT NULL DEFAULT 'draft',
  plan_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_hotels_hotel_key (hotel_key),
  KEY ix_hotels_status (status),
  CONSTRAINT fk_hotels_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hotel_limits (
  hotel_id BIGINT UNSIGNED NOT NULL,
  room_limit INT UNSIGNED NULL,
  user_limit INT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (hotel_id),
  CONSTRAINT fk_hotel_limits_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hotel_modules (
  hotel_id BIGINT UNSIGNED NOT NULL,
  module_id BIGINT UNSIGNED NOT NULL,
  status ENUM('active', 'disabled', 'pending') NOT NULL DEFAULT 'pending',
  configured_at DATETIME NULL,
  PRIMARY KEY (hotel_id, module_id),
  CONSTRAINT fk_hotel_modules_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE,
  CONSTRAINT fk_hotel_modules_module FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  hotel_id BIGINT UNSIGNED NOT NULL,
  plan_id BIGINT UNSIGNED NULL,
  status ENUM('trial', 'active', 'past_due', 'suspended', 'cancelled') NOT NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_subscriptions_hotel_status (hotel_id, status),
  CONSTRAINT fk_subscriptions_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE,
  CONSTRAINT fk_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscription_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  subscription_id BIGINT UNSIGNED NOT NULL,
  module_id BIGINT UNSIGNED NULL,
  item_type ENUM('plan', 'module', 'service') NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_subscription_items_subscription (subscription_id),
  CONSTRAINT fk_subscription_items_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
  CONSTRAINT fk_subscription_items_module FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hotel_domains (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  hotel_id BIGINT UNSIGNED NOT NULL,
  domain VARCHAR(255) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_hotel_domains_domain (domain),
  CONSTRAINT fk_hotel_domains_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hotel_database_connections (
  hotel_id BIGINT UNSIGNED NOT NULL,
  database_key VARCHAR(120) NOT NULL,
  connection_ciphertext MEDIUMBLOB NOT NULL,
  key_reference VARCHAR(180) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (hotel_id),
  UNIQUE KEY ux_hotel_database_connections_database_key (database_key),
  CONSTRAINT fk_hotel_database_connections_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS installations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  hotel_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending', 'running', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  requested_by VARCHAR(120) NOT NULL DEFAULT '',
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_installations_hotel_status (hotel_id, status),
  CONSTRAINT fk_installations_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS installation_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  installation_id BIGINT UNSIGNED NOT NULL,
  level ENUM('info', 'warning', 'error') NOT NULL,
  step_code VARCHAR(80) NOT NULL,
  message VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_installation_logs_installation (installation_id, id),
  CONSTRAINT fk_installation_logs_installation FOREIGN KEY (installation_id) REFERENCES installations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS migration_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  hotel_id BIGINT UNSIGNED NOT NULL,
  migration_id VARCHAR(120) NOT NULL,
  status ENUM('running', 'completed', 'failed') NOT NULL,
  started_at DATETIME NOT NULL,
  completed_at DATETIME NULL,
  error_message VARCHAR(2000) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY ux_migration_runs_hotel_migration (hotel_id, migration_id),
  CONSTRAINT fk_migration_runs_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
