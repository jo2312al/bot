const { readCalendarReservations } = require("../services/reservationDatabaseService");

const rows = readCalendarReservations()
  .filter(row => row.source === "manual")
  .filter(row => row.fecha === "01/08/2026" || row.fecha === "1/08/2026")
  .sort((left, right) => {
    const leftStamp = Number(String(left.sourceKey || "").split(":")[1] || 0);
    const rightStamp = Number(String(right.sourceKey || "").split(":")[1] || 0);
    return rightStamp - leftStamp;
  })
  .slice(0, 15)
  .map(row => ({
  folio: row.folio,
  source: row.source,
  sourceKey: row.sourceKey,
  date: row.fecha,
  time: row.hora,
  phone: String(row.telefono || "").replace(/^\d*(\d{4})$/, "***$1"),
  hasPhone: String(row.telefono || "").replace(/\D/g, "").length >= 10
}));

process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
