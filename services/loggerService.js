const fs = require("fs");

const LOG_FILE =
  "logs/bot.log";

function log(message) {

  const time =
    new Date()
      .toLocaleString();

  const line =
    `[${time}] ${message}\n`;

  console.log(message);

  fs.appendFileSync(
    LOG_FILE,
    line
  );

}

module.exports = log;