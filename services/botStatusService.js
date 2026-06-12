const fs = require("fs");
const path = require("path");

const STATUS_FILE =
  path.join(
    __dirname,
    "../state/botStatus.json"
  );

function ensureStateDir() {
  const dir =
    path.dirname(STATUS_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {
      recursive: true
    });
  }
}

function readBotStatus() {
  try {
    return JSON.parse(
      fs.readFileSync(
        STATUS_FILE,
        "utf8"
      )
    );
  } catch {
    return {
      connection: "unknown",
      qr: null,
      updatedAt: null,
      detail: "Sin estado registrado"
    };
  }
}

function writeBotStatus(status) {
  ensureStateDir();

  const current =
    readBotStatus();

  fs.writeFileSync(
    STATUS_FILE,
    JSON.stringify(
      {
        ...current,
        ...status,
        updatedAt:
          new Date()
            .toISOString()
      },
      null,
      2
    ),
    "utf8"
  );
}

module.exports = {
  readBotStatus,
  writeBotStatus
};
