const {
  createMysqlCliConnection
} = require("../infrastructure/mysqlCliConnection");
const {
  createHotelMigrationRunner
} = require("../migrations/hotelMigrationRunner");
const {
  createHotelV2Migrations
} = require("../migrations/hotelV2Migrations");

function createHotelV2Migrator({ controlPlane, connectionFactory = createMysqlCliConnection } = {}) {
  if (!controlPlane) {
    throw new Error("HotelV2Migrator requiere Control Plane.");
  }

  const runner = createHotelMigrationRunner({
    controlPlane,
    migrations: createHotelV2Migrations()
  });

  async function install({ hotelId, connection }) {
    if (!connection?.database) {
      throw new Error("La instalación requiere una conexión de base de datos individual.");
    }

    const hotelConnection = connectionFactory(connection);
    return runner.install({
      hotelId,
      connection: hotelConnection
    });
  }

  return {
    install
  };
}

module.exports = {
  createHotelV2Migrator
};
