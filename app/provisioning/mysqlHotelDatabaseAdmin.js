const {
  createMysqlCliConnection,
  validateDatabaseName
} = require("../infrastructure/mysqlCliConnection");

function createMysqlHotelDatabaseAdmin(options = {}) {
  const serverConnection = options.serverConnection || createMysqlCliConnection({
    host: options.host,
    port: options.port,
    user: options.user,
    password: options.password
  });

  async function createHotelDatabase({ databaseName }) {
    const database = validateDatabaseName(databaseName);
    await serverConnection.runSql(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    return {
      host: options.host || process.env.MYSQL_HOST || "127.0.0.1",
      port: String(options.port || process.env.MYSQL_PORT || "3306"),
      user: options.user || process.env.MYSQL_USER || "root",
      password: options.password || process.env.MYSQL_PASSWORD || "",
      database,
      keyReference: options.keyReference || "CONTROL_PLANE_CONNECTION_KEY"
    };
  }

  return {
    createHotelDatabase
  };
}

module.exports = {
  createMysqlHotelDatabaseAdmin
};
