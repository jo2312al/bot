const fs = require("fs");
const path = require("path");

const folio = String(process.argv[2] || "").trim().toUpperCase();
if (!/^[A-Z0-9][A-Z0-9-]{2,29}$/.test(folio)) throw new Error("Folio invalido");
const file = path.join(__dirname, "../data/reservationArrivalReminders.json");
const rows = JSON.parse(fs.readFileSync(file, "utf8"));
let changed = false;
for (const row of rows) {
  if (String(row.folio || "").toUpperCase() === folio) {
    row.sentAt = null;
    changed = true;
  }
}
if (!changed) throw new Error("Recordatorio no encontrado");
fs.writeFileSync(file, JSON.stringify(rows, null, 2), "utf8");
process.stdout.write("Recordatorio reencolado\n");
