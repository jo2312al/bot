const fs = require("fs");
const path = require("path");

function createHotelMigrations(options = {}) {
  const schemaFile = options.schemaFile || path.join(__dirname, "../../database/schema.mysql.sql");
  const source = fs.readFileSync(schemaFile, "utf8");

  return [
    {
      id: "001_initial_hotel_schema",
      source,
      up: async connection => connection.runSql(source)
    }
  ];
}

module.exports = {
  createHotelMigrations
};
