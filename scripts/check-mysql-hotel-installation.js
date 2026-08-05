const assert = require("assert");
const {
  validateDatabaseName
} = require("../app/infrastructure/mysqlCliConnection");
const {
  createMysqlHotelDatabaseAdmin
} = require("../app/provisioning/mysqlHotelDatabaseAdmin");
const {
  createHotelMigrations
} = require("../app/migrations/hotelMigrations");

async function main() {
  assert.equal(validateDatabaseName("hotelflow_costa_azul"), "hotelflow_costa_azul");
  assert.throws(() => validateDatabaseName("hotel; DROP DATABASE mysql"), /no es válido/);

  const statements = [];
  const admin = createMysqlHotelDatabaseAdmin({
    host: "db.test",
    user: "installer",
    password: "not-exposed",
    serverConnection: { runSql: async sql => statements.push(sql) }
  });
  const connection = await admin.createHotelDatabase({ databaseName: "hotelflow_costa_azul" });
  assert(statements[0].includes("CREATE DATABASE IF NOT EXISTS `hotelflow_costa_azul`"));
  assert.equal(connection.database, "hotelflow_costa_azul");
  assert.equal(connection.host, "db.test");

  const migrations = createHotelMigrations();
  assert.equal(migrations[0].id, "001_initial_hotel_schema");
  assert(migrations[0].source.includes("CREATE TABLE IF NOT EXISTS rooms"));
  console.log("Instalación MySQL por hotel: OK");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
