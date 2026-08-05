const {
  createTenantContext
} = require("./tenantContext");

function normalizeHost(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/^www\./, "");
}

function createTenantResolver({ findHotelByDomain }) {
  if (typeof findHotelByDomain !== "function") {
    throw new Error("TenantResolver requiere findHotelByDomain.");
  }

  async function resolveFromRequest(request) {
    const host = normalizeHost(request?.headers?.host || request?.host);
    if (!host) throw new Error("No se recibió un dominio de hotel.");

    const hotel = await findHotelByDomain(host);
    if (!hotel || hotel.status !== "active") {
      const error = new Error("Hotel no disponible para este dominio.");
      error.code = "HOTEL_NOT_AVAILABLE";
      error.statusCode = 404;
      throw error;
    }

    return createTenantContext(hotel);
  }

  return {
    resolveFromRequest
  };
}

module.exports = {
  createTenantResolver,
  normalizeHost
};
