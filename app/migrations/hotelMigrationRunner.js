const crypto = require("crypto");

function checksum(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function createHotelMigrationRunner({ migrations, controlPlane }) {
  const ordered = [...migrations].sort((left, right) => left.id.localeCompare(right.id));

  async function install({ hotelId, connection }) {
    await connection.runSql(`CREATE TABLE IF NOT EXISTS schema_versions (
      migration_id VARCHAR(120) NOT NULL,
      applied_at DATETIME NOT NULL,
      applied_by VARCHAR(120) NOT NULL DEFAULT 'migration-manager',
      checksum CHAR(64) NOT NULL DEFAULT '',
      PRIMARY KEY (migration_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
    const appliedRows = await connection.queryJson("SELECT JSON_OBJECT('id', migration_id) FROM schema_versions;");
    const applied = new Set(appliedRows.map(row => row.id));
    const completed = [];

    for (const migration of ordered) {
      if (applied.has(migration.id)) continue;
      await controlPlane.startMigration({ hotelId, migrationId: migration.id });
      try {
        await migration.up(connection);
        await connection.runSql(`INSERT INTO schema_versions (migration_id, applied_at, checksum)
          VALUES (${connection.quote(migration.id)}, NOW(), ${connection.quote(checksum(migration.source || migration.id))});`);
        await controlPlane.finishMigration({ hotelId, migrationId: migration.id });
        completed.push(migration.id);
      } catch (error) {
        await controlPlane.finishMigration({ hotelId, migrationId: migration.id, error: error.message });
        throw error;
      }
    }
    return completed;
  }

  return {
    install
  };
}

module.exports = {
  createHotelMigrationRunner
};
