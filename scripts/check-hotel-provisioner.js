const assert = require("assert");
const {
  createHotelProvisioner,
  databaseNameForHotel
} = require("../app/provisioning/hotelProvisioner");

async function main() {
  const records = { logs: [], statuses: [] };
  const controlPlane = {
    createHotel: async input => ({ ...input, id: 7 }),
    createInstallation: async () => ({ id: 9 }),
    updateHotelStatus: async (_, status) => records.statuses.push(status),
    logInstallation: async input => records.logs.push(input),
    saveEncryptedDatabaseConnection: async input => { records.connection = input; },
    completeInstallation: async input => { records.completed = input; },
    failInstallation: async input => { records.failed = input; }
  };
  const provisioner = createHotelProvisioner({
    controlPlane,
    databaseAdmin: {
      createHotelDatabase: async input => ({ encrypted: true, databaseName: input.databaseName })
    },
    hotelMigrator: {
      install: async () => ["001_initial", "002_core"]
    }
  });
  const result = await provisioner.provision({
    hotelKey: "Costa Azul", legalName: "Hotel Costa Azul SA", planId: 3, requestedBy: "admin"
  });

  assert.equal(databaseNameForHotel("Costa Azul"), "hotelflow_costa_azul");
  assert.equal(result.databaseName, "hotelflow_costa_azul");
  assert.deepEqual(result.migrations, ["001_initial", "002_core"]);
  assert.deepEqual(records.statuses, ["provisioning", "active"]);
  assert.equal(records.connection.connection.encrypted, true);
  console.log("Provisionador de hotel: OK");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
