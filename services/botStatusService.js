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

function defaultStatus() {
  return {
    connection: "unknown",
    qr: null,
    updatedAt: null,
    detail: "Sin estado registrado"
  };
}

function readStatusFile() {
  try {
    return JSON.parse(
      fs.readFileSync(
        STATUS_FILE,
        "utf8"
      )
    );
  } catch {
    return null;
  }
}

function readBotStatuses() {
  const stored =
    readStatusFile();

  if (stored?.instances) {
    return {
      principal:
        stored.instances.principal || defaultStatus(),
      nocturno:
        stored.instances.nocturno || defaultStatus()
    };
  }

  return {
    principal:
      stored || defaultStatus(),
    nocturno:
      defaultStatus()
  };
}

function readBotStatus(instanceId = "principal") {
  return readBotStatuses()[instanceId] || defaultStatus();
}

function writeBotStatus(instanceId, status) {
  if (typeof instanceId === "object") {
    status = instanceId;
    instanceId = "principal";
  }

  ensureStateDir();

  const instances =
    readBotStatuses();

  fs.writeFileSync(
    STATUS_FILE,
    JSON.stringify(
      {
        instances: {
          ...instances,
          [instanceId]: {
            ...instances[instanceId],
            ...status,
            updatedAt:
              new Date()
                .toISOString()
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );
}

module.exports = {
  readBotStatus,
  readBotStatuses,
  writeBotStatus
};
