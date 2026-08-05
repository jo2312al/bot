const assert = require("assert");
const {
  createHotelV2Migrator
} = require("../app/provisioning/hotelV2Migrator");

async function main() {
  const statements = [];
  const lifecycle = [];
  const migrator = createHotelV2Migrator({
    controlPlane: {
      startMigration: async input => lifecycle.push(`start:${input.migrationId}`),
      finishMigration: async input => lifecycle.push(`finish:${input.migrationId}:${input.error || "ok"}`)
    },
    connectionFactory: input => ({
      quote: value => `'${String(value).replace(/'/g, "''")}'`,
      runSql: async sql => statements.push(sql),
      queryJson: async () => []
    })
  });

  const applied = await migrator.install({
    hotelId: 8,
    connection: { database: "hotelflow_demo" }
  });

  assert.deepEqual(applied, ["001-core", "002-core-seed"]);
  assert.equal(lifecycle.length, 4);
  assert(statements.some(sql => sql.includes("CREATE TABLE IF NOT EXISTS hotel_settings")));
  assert(statements.some(sql => sql.includes("INSERT INTO app_roles")));
  console.log("Instalador HotelFlow v2: OK");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
