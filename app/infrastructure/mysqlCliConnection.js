const {
  execFileSync
} = require("child_process");

function validateDatabaseName(value) {
  const database = String(value || "").trim();
  if (!/^[a-z][a-z0-9_]{2,119}$/.test(database)) {
    throw new Error("El nombre de la base de datos no es válido.");
  }
  return database;
}

function quote(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function createMysqlCliConnection(options = {}) {
  const mysqlCli = options.mysqlCli || process.env.MYSQL_CLI || "mysql";
  const database = options.database ? validateDatabaseName(options.database) : "";
  const host = options.host || process.env.MYSQL_HOST || "127.0.0.1";
  const port = String(options.port || process.env.MYSQL_PORT || "3306");
  const user = options.user || process.env.MYSQL_USER || "root";
  const password = options.password || process.env.MYSQL_PASSWORD || "";

  function args(extra = []) {
    const base = [
      "--default-character-set=utf8mb4",
      "--host", host,
      "--port", port,
      "--user", user
    ];
    if (database) base.push(database);
    return [...base, ...extra];
  }

  function execute(extra) {
    return execFileSync(mysqlCli, args(extra), {
      encoding: "utf8",
      env: { ...process.env, MYSQL_PWD: password },
      maxBuffer: 20 * 1024 * 1024
    });
  }

  return {
    database,
    quote,
    runSql: async sql => execute(["--execute", sql]),
    queryJson: async sql => {
      const output = execute(["--batch", "--raw", "--skip-column-names", "--execute", sql]).trim();
      return output ? output.split(/\r?\n/).filter(Boolean).map(JSON.parse) : [];
    }
  };
}

module.exports = {
  createMysqlCliConnection,
  validateDatabaseName
};
