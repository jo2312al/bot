const fs = require("fs");
const path = require("path");

const DEFAULT_LOG =
  path.join(
    __dirname,
    "../logs/bot.log"
  );

const LOG_FILE =
  process.argv[2]
    ? path.resolve(process.argv[2])
    : DEFAULT_LOG;

const MODULES = {
  reservas: {
    label: "Reservas",
    completeAt: 10,
    steps: [
      "selecciono reservas",
      "fecha",
      "noches",
      "habitaciones",
      "huespedes",
      "habitacion",
      "telefono",
      "hora",
      "confirmacion",
      "nombre"
    ]
  },
  cotizaciones: {
    label: "Cotizaciones",
    completeAt: 5,
    steps: [
      "selecciono cotizaciones",
      "tipo de evento",
      "fecha",
      "personas",
      "telefono"
    ]
  },
  quejas: {
    label: "Quejas",
    completeAt: 7,
    steps: [
      "selecciono quejas",
      "tipo",
      "area",
      "nombre",
      "dato variable",
      "dato adicional",
      "observaciones"
    ]
  },
  objetos: {
    label: "Objetos extraviados",
    completeAt: 6,
    steps: [
      "selecciono objetos",
      "nombre",
      "habitacion",
      "fecha ingreso",
      "objeto",
      "telefono"
    ]
  },
  agente: {
    label: "Agente",
    completeAt: 2,
    steps: [
      "selecciono agente",
      "confirmacion"
    ]
  },
  callcenter: {
    label: "Call center",
    completeAt: 1,
    steps: [
      "selecciono call center"
    ]
  },
  galeria: {
    label: "Galeria",
    completeAt: 1,
    steps: [
      "selecciono galeria"
    ]
  },
  turismo: {
    label: "Turismo",
    completeAt: 1,
    steps: [
      "selecciono turismo"
    ]
  },
  servicios: {
    label: "Servicios",
    completeAt: 1,
    steps: [
      "selecciono servicios"
    ]
  },
  promociones: {
    label: "Promociones",
    completeAt: 1,
    steps: [
      "selecciono promociones"
    ]
  },
  redes: {
    label: "Redes sociales",
    completeAt: 1,
    steps: [
      "selecciono redes"
    ]
  },
  pelicula: {
    label: "Pelicula",
    completeAt: 1,
    steps: [
      "selecciono pelicula"
    ]
  },
  romanticas: {
    label: "Romanticas",
    completeAt: 1,
    steps: [
      "selecciono romanticas"
    ]
  }
};

const MENU_MODULES = {
  "1": "reservas",
  "2": "cotizaciones",
  "3": "quejas",
  "4": "objetos",
  "5": "galeria",
  "6": "turismo",
  "7": "servicios",
  "8": "promociones",
  "9": "redes",
  "10": "pelicula",
  "11": "callcenter",
  "12": "romanticas",
  "13": "agente"
};

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.:,;()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inc(map, key) {
  map.set(
    key,
    (map.get(key) || 0) + 1
  );
}

function top(map, limit = 10) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit);
}

function parseLogLine(line) {
  const match =
    line.match(
      /^\[(.*?)\] User: (.*?) \| Modulo: (.*?) \| Action: (.*?)(?: \| Paso: (.*?))?(?: \| Estado: (.*?))?$/
    );

  if (!match) {
    return null;
  }

  return {
    time: match[1],
    user: match[2],
    module: match[3],
    action: String(match[4] || "").trim(),
    step: match[5],
    state: match[6]
  };
}

function getStepName(session) {
  const config =
    MODULES[session.module];

  if (!config) {
    return "sin clasificar";
  }

  const index =
    Math.min(
      Math.max(
        session.events.length - 1,
        0
      ),
      config.steps.length - 1
    );

  return config.steps[index] || "sin clasificar";
}

function isComplete(session) {
  const config =
    MODULES[session.module];

  return Boolean(
    config
    &&
    session.events.length >= config.completeAt
  );
}

function isMenuStart(event) {
  const normalized =
    normalize(event.action);

  return MENU_MODULES[normalized] === event.module;
}

function buildSessions(events) {
  const sessions = [];
  const activeByUser = new Map();

  for (const event of events) {
    if (!MODULES[event.module]) {
      continue;
    }

    const active =
      activeByUser.get(event.user);

    const startsNew =
      !active
      ||
      active.module !== event.module
      ||
      (
        isMenuStart(event)
        &&
        active.events.length > 0
      )
      ||
      isComplete(active);

    if (startsNew) {
      if (active) {
        sessions.push(active);
      }

      activeByUser.set(event.user, {
        user: event.user,
        module: event.module,
        startedAt: event.time,
        lastAt: event.time,
        events: [event]
      });

      continue;
    }

    active.events.push(event);
    active.lastAt = event.time;
  }

  for (const session of activeByUser.values()) {
    sessions.push(session);
  }

  return sessions;
}

function printTable(title, rows) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));

  if (!rows.length) {
    console.log("Sin datos");
    return;
  }

  for (const row of rows) {
    console.log(row.join(" | "));
  }
}

if (!fs.existsSync(LOG_FILE)) {
  console.error(`No existe el log: ${LOG_FILE}`);
  process.exit(1);
}

const rawLines =
  fs.readFileSync(LOG_FILE, "utf8")
    .split(/\r?\n/)
    .filter(Boolean);

const events =
  rawLines
    .map(parseLogLine)
    .filter(Boolean)
    .filter(event => event.user !== "Sistema");

const privateEvents =
  events.filter(event => event.module === "Chat Privado");

const routeEvents =
  events.filter(event => MODULES[event.module]);

const sessions =
  buildSessions(routeEvents);

const abandoned =
  sessions.filter(session => !isComplete(session));

const moduleCounts = new Map();
const completedCounts = new Map();
const abandonedCounts = new Map();
const stopCounts = new Map();
const lastMessageCounts = new Map();
const privateMessageCounts = new Map();

for (const session of sessions) {
  inc(moduleCounts, session.module);

  if (isComplete(session)) {
    inc(completedCounts, session.module);
  } else {
    inc(abandonedCounts, session.module);
    inc(
      stopCounts,
      `${session.module}: ${getStepName(session)}`
    );
    inc(
      lastMessageCounts,
      normalize(session.events.at(-1)?.action)
      || "(vacio)"
    );
  }
}

for (const event of privateEvents) {
  inc(
    privateMessageCounts,
    normalize(event.action)
    || "(vacio)"
  );
}

console.log(`Log: ${LOG_FILE}`);
console.log(`Eventos privados: ${privateEvents.length}`);
console.log(`Usuarios privados: ${new Set(privateEvents.map(event => event.user)).size}`);
console.log(`Sesiones detectadas: ${sessions.length}`);
console.log(`Sesiones completas probables: ${sessions.length - abandoned.length}`);
console.log(`Abandonos probables: ${abandoned.length}`);

printTable(
  "Menus mas usados",
  top(moduleCounts, 20)
    .map(([module, total]) => {
      const complete =
        completedCounts.get(module) || 0;
      const dropped =
        abandonedCounts.get(module) || 0;
      const rate =
        total
          ? Math.round((dropped / total) * 100)
          : 0;

      return [
        MODULES[module]?.label || module,
        `total ${total}`,
        `completas ${complete}`,
        `abandonos ${dropped}`,
        `abandono ${rate}%`
      ];
    })
);

printTable(
  "Donde se detienen mas",
  top(stopCounts, 20)
    .map(([key, total]) => [
      key,
      `${total} usuarios/sesiones`
    ])
);

printTable(
  "Ultimo mensaje antes de detenerse",
  top(lastMessageCounts, 20)
    .map(([message, total]) => [
      message,
      `${total} veces`
    ])
);

printTable(
  "Mensajes libres mas comunes",
  top(privateMessageCounts, 30)
    .map(([message, total]) => [
      message,
      `${total} veces`
    ])
);
