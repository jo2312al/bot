const ROOM_STATES = Object.freeze([
  "available",
  "reserved",
  "occupied",
  "dirty",
  "clean",
  "inspection",
  "blocked",
  "maintenance",
  "out_of_service"
]);

const TRANSITIONS = Object.freeze({
  available: ["reserved", "occupied", "blocked", "maintenance", "out_of_service"],
  reserved: ["available", "occupied", "blocked", "maintenance", "out_of_service"],
  occupied: ["dirty", "maintenance", "out_of_service"],
  dirty: ["clean", "maintenance", "out_of_service"],
  clean: ["inspection", "available", "maintenance", "out_of_service"],
  inspection: ["available", "dirty", "maintenance", "out_of_service"],
  blocked: ["available", "clean", "maintenance", "out_of_service"],
  maintenance: ["clean", "blocked", "out_of_service"],
  out_of_service: ["maintenance", "clean", "blocked"]
});

function normalizeState(value) {
  const state = String(value || "").trim().toLowerCase();
  if (!ROOM_STATES.includes(state)) throw new Error(`Estado de habitación no reconocido: ${value}`);
  return state;
}

function assertTransition(fromState, toState) {
  const from = normalizeState(fromState);
  const to = normalizeState(toState);
  if (from === to) throw new Error("La habitación ya se encuentra en ese estado.");
  if (!TRANSITIONS[from].includes(to)) {
    const error = new Error(`No se permite cambiar de ${from} a ${to}.`);
    error.code = "INVALID_ROOM_TRANSITION";
    error.statusCode = 422;
    throw error;
  }
  return { from, to };
}

module.exports = {
  ROOM_STATES,
  TRANSITIONS,
  assertTransition,
  normalizeState
};
