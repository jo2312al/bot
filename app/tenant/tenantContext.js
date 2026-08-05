function normalizeHotelId(value) {
  const hotelId = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  if (!hotelId) {
    throw new Error("El contexto requiere un hotel válido.");
  }

  return hotelId;
}

function createTenantContext(hotel) {
  if (!hotel || typeof hotel !== "object") {
    throw new Error("No se encontró la configuración del hotel.");
  }

  const databaseKey = String(hotel.databaseKey || "").trim();
  if (!databaseKey) {
    throw new Error("El hotel no tiene una base de datos asignada.");
  }

  return Object.freeze({
    hotelId: normalizeHotelId(hotel.id),
    hotelName: String(hotel.name || "").trim(),
    databaseKey,
    planId: String(hotel.planId || "").trim(),
    activeModules: Object.freeze([...(hotel.activeModules || [])]),
    limits: Object.freeze({ ...(hotel.limits || {}) })
  });
}

module.exports = {
  createTenantContext,
  normalizeHotelId
};
