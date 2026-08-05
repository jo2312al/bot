const fs = require("fs");
const path = require("path");

let rows = [];
try {
  rows = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/reservationArrivalReminders.json"), "utf8"));
} catch {}

const safe = rows.slice(-20).reverse().map(row => ({
  folio: row.folio,
  phone: String(row.telefono || "").replace(/^\d*(\d{4})$/, "***$1"),
  scheduledFor: row.dueAt,
  sentAt: row.sentAt || null,
  due: Date.parse(row.dueAt) <= Date.now()
}));
process.stdout.write(`${JSON.stringify(safe, null, 2)}\n`);
