const assert = require("assert");
const {
  createTenantResolver
} = require("../app/tenant/tenantResolver");
const {
  createTenantDatabaseManager
} = require("../app/tenant/tenantDatabaseManager");
const {
  createModuleRegistry
} = require("../app/modules/moduleRegistry");
const {
  createDomainEventBus
} = require("../app/events/domainEventBus");
const {
  createMigrationManager
} = require("../app/migrations/migrationManager");

async function main() {
  const resolver = createTenantResolver({
    findHotelByDomain: async domain => domain === "demo.hotel.test"
      ? { id: "demo", name: "Hotel Demo", status: "active", databaseKey: "demo-db", activeModules: ["reservations"] }
      : null
  });
  const context = await resolver.resolveFromRequest({ headers: { host: "demo.hotel.test:443" } });
  assert.equal(context.hotelId, "demo");

  const database = createTenantDatabaseManager({
    getHotelDatabaseConnection: async input => ({ databaseKey: input.databaseKey })
  });
  assert.equal(await database.withDatabase(context, connection => connection.databaseKey), "demo-db");

  const registry = createModuleRegistry([
    { id: "reservations", core: true },
    { id: "housekeeping", dependencies: ["reservations"] }
  ]);
  assert.deepEqual(registry.resolveActive(["housekeeping"]), ["reservations", "housekeeping"]);

  const bus = createDomainEventBus();
  let observed = false;
  bus.subscribe("StayCheckedOut", (_, eventContext) => { observed = eventContext.hotelId === "demo"; });
  await bus.publish("StayCheckedOut", { stayId: 1 }, context);
  assert.equal(observed, true);

  const migrations = createMigrationManager([
    { id: "001", up: async execute => execute("first") },
    { id: "002", destructive: true, up: async execute => execute("second") }
  ]);
  const executed = [];
  await assert.rejects(() => migrations.apply({ execute: value => executed.push(value) }), /aprobación explícita/);
  assert.deepEqual(await migrations.apply({ approveDestructive: true, execute: value => executed.push(value) }), ["001", "002"]);
  console.log("Fundación HotelFlow: OK");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
