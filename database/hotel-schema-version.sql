-- Esta tabla vive dentro de CADA base individual de hotel.
CREATE TABLE IF NOT EXISTS schema_versions (
  migration_id VARCHAR(120) NOT NULL,
  applied_at DATETIME NOT NULL,
  applied_by VARCHAR(120) NOT NULL DEFAULT 'migration-manager',
  checksum CHAR(64) NOT NULL DEFAULT '',
  PRIMARY KEY (migration_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
