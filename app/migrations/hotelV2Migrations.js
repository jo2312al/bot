const fs = require("fs");
const path = require("path");

function createHotelV2Migrations(options = {}) {
  const directory = options.directory || path.join(__dirname, "../../database/hotel-v2");
  return fs.readdirSync(directory)
    .filter(file => /^\d{3}-.+\.sql$/.test(file))
    .sort()
    .map(file => {
      const source = fs.readFileSync(path.join(directory, file), "utf8");
      return { id: file.replace(/\.sql$/, ""), source, up: async connection => connection.runSql(source) };
    });
}

module.exports = { createHotelV2Migrations };
