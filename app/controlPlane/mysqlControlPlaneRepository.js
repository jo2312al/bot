const ALLOWED_HOTEL_STATUSES = new Set([
  "draft", "provisioning", "active", "suspended", "failed", "archived"
]);

function createMysqlControlPlaneRepository({ connection, crypto }) {
  if (!connection?.runSql || !connection?.queryJson || !connection?.quote || !crypto?.encrypt) {
    throw new Error("El repositorio requiere conexión SQL y cifrado.");
  }

  async function one(sql) {
    const rows = await connection.queryJson(sql);
    return rows[0] || null;
  }

  async function createHotel({ hotelKey, legalName, displayName, planId = null }) {
    if (!hotelKey || !legalName || !displayName) throw new Error("El hotel requiere clave y nombres.");
    await connection.runSql(`INSERT INTO hotels (hotel_key, legal_name, display_name, plan_id)
      VALUES (${connection.quote(hotelKey)}, ${connection.quote(legalName)}, ${connection.quote(displayName)}, ${planId ? Number(planId) : "NULL"});`);
    return one(`SELECT JSON_OBJECT('id', id, 'hotelKey', hotel_key) FROM hotels WHERE hotel_key = ${connection.quote(hotelKey)} LIMIT 1;`);
  }

  async function createInstallation({ hotelId, requestedBy = "" }) {
    await connection.runSql(`INSERT INTO installations (hotel_id, status, requested_by, started_at)
      VALUES (${Number(hotelId)}, 'running', ${connection.quote(requestedBy)}, NOW());`);
    return one(`SELECT JSON_OBJECT('id', id) FROM installations WHERE hotel_id = ${Number(hotelId)} ORDER BY id DESC LIMIT 1;`);
  }

  async function updateHotelStatus(hotelId, status) {
    if (!ALLOWED_HOTEL_STATUSES.has(status)) throw new Error("Estado de hotel no válido.");
    await connection.runSql(`UPDATE hotels SET status = ${connection.quote(status)} WHERE id = ${Number(hotelId)};`);
  }

  async function logInstallation({ installationId, level, stepCode, message }) {
    await connection.runSql(`INSERT INTO installation_logs (installation_id, level, step_code, message)
      VALUES (${Number(installationId)}, ${connection.quote(level)}, ${connection.quote(stepCode)}, ${connection.quote(message)});`);
  }

  async function saveEncryptedDatabaseConnection({ hotelId, databaseKey, connection: hotelConnection }) {
    const ciphertext = crypto.encrypt(hotelConnection);
    const keyReference = String(hotelConnection.keyReference || "CONTROL_PLANE_CONNECTION_KEY");
    await connection.runSql(`INSERT INTO hotel_database_connections (hotel_id, database_key, connection_ciphertext, key_reference)
      VALUES (${Number(hotelId)}, ${connection.quote(databaseKey)}, FROM_BASE64(${connection.quote(ciphertext)}), ${connection.quote(keyReference)})
      ON DUPLICATE KEY UPDATE database_key = VALUES(database_key), connection_ciphertext = VALUES(connection_ciphertext), key_reference = VALUES(key_reference);`);
  }

  async function completeInstallation({ installationId, migrations = [] }) {
    await connection.runSql(`UPDATE installations SET status = 'completed', completed_at = NOW() WHERE id = ${Number(installationId)};`);
    return migrations;
  }

  async function failInstallation({ installationId }) {
    await connection.runSql(`UPDATE installations SET status = 'failed', completed_at = NOW() WHERE id = ${Number(installationId)};`);
  }

  async function startMigration({ hotelId, migrationId }) {
    await connection.runSql(`INSERT INTO migration_runs (hotel_id, migration_id, status, started_at)
      VALUES (${Number(hotelId)}, ${connection.quote(migrationId)}, 'running', NOW())
      ON DUPLICATE KEY UPDATE status = 'running', started_at = NOW(), completed_at = NULL, error_message = '';`);
  }

  async function finishMigration({ hotelId, migrationId, error = "" }) {
    const success = !error;
    await connection.runSql(`UPDATE migration_runs SET status = ${connection.quote(success ? "completed" : "failed")},
      completed_at = NOW(), error_message = ${connection.quote(error)}
      WHERE hotel_id = ${Number(hotelId)} AND migration_id = ${connection.quote(migrationId)};`);
  }

  return {
    completeInstallation,
    createHotel,
    createInstallation,
    failInstallation,
    finishMigration,
    logInstallation,
    saveEncryptedDatabaseConnection,
    startMigration,
    updateHotelStatus
  };
}

module.exports = {
  createMysqlControlPlaneRepository
};
