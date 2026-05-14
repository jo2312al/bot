const fs = require("fs");
const path = require("path");

const LOG_FILE = "logs/bot.log";

function log(data) {
  const time = new Date().toLocaleString();
  let line = "";

  if (typeof data === "string") {
    line = `[${time}] ${data}\n`;
    console.log(data);
  } else if (typeof data === "object" && data !== null) {
    const { usuario, modulo, accion } = data;
    line = `[${time}] User: ${usuario || 'Unknown'} | Modulo: ${modulo || 'Unknown'} | Action: ${accion || 'Unknown'}\n`;
    console.log(`[LOG] User: ${usuario} | Mod: ${modulo} | Act: ${accion}`);
  } else {
    line = `[${time}] ${JSON.stringify(data)}\n`;
    console.log(data);
  }

  // Ensure logs directory exists
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.appendFileSync(LOG_FILE, line);
}

module.exports = log;
