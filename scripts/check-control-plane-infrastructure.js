const assert = require("assert");
const { createConnectionCrypto } = require("../app/controlPlane/connectionCrypto");
const { createMysqlControlPlaneRepository } = require("../app/controlPlane/mysqlControlPlaneRepository");
const { createHotelMigrationRunner } = require("../app/migrations/hotelMigrationRunner");

async function main() {
  const crypto = createConnectionCrypto("test-key-only-for-local-check");
  assert.deepEqual(crypto.decrypt(crypto.encrypt({ database: "hotelflow_demo", password: "secret" })), { database: "hotelflow_demo", password: "secret" });

  const statements = [];
  const connection = {
    quote: value => `'${String(value).replace(/'/g, "''")}'`,
    runSql: async sql => statements.push(sql),
    queryJson: async sql => sql.includes("FROM hotels") ? [{ id: 3, hotelKey: "demo" }] : sql.includes("FROM installations") ? [{ id: 4 }] : []
  };
  const repository = createMysqlControlPlaneRepository({ connection, crypto });
  const hotel = await repository.createHotel({ hotelKey: "demo", legalName: "Hotel Demo", displayName: "Demo" });
  const installation = await repository.createInstallation({ hotelId: hotel.id });
  await repository.saveEncryptedDatabaseConnection({ hotelId: hotel.id, databaseKey: "hotelflow_demo", connection: { host: "db", keyReference: "K1" } });
  assert.equal(installation.id, 4);
  assert(statements.some(sql => sql.includes("connection_ciphertext")));

  const lifecycle = [];
  const runner = createHotelMigrationRunner({
    controlPlane: { startMigration: async input => lifecycle.push(`start:${input.migrationId}`), finishMigration: async input => lifecycle.push(`finish:${input.migrationId}:${input.error || "ok"}`) },
    migrations: [{ id: "001_initial", source: "CREATE TABLE demo", up: async db => db.runSql("CREATE TABLE demo (id INT);") }]
  });
  assert.deepEqual(await runner.install({ hotelId: 3, connection }), ["001_initial"]);
  assert.deepEqual(lifecycle, ["start:001_initial", "finish:001_initial:ok"]);
  console.log("Infraestructura Control Plane: OK");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
