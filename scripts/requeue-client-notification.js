const mysql = require("../services/mysqlCliService");

const id = String(process.argv[2] || "").trim();
if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Notification id invalido");
if (!mysql.ensureSchema()) throw new Error("MySQL no disponible");

mysql.runSql(`
  UPDATE reservation_group_notifications
  SET sent_at = NULL
  WHERE id = ${mysql.quote(id)}
    AND origin LIKE 'client:%';
`);
process.stdout.write("Notificacion reencolada\n");
