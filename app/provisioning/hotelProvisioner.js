function normalizeHotelKey(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  if (!/^[a-z0-9][a-z0-9-]{2,59}$/.test(key)) {
    throw new Error("La clave del hotel debe tener entre 3 y 60 caracteres válidos.");
  }

  return key;
}

function databaseNameForHotel(hotelKey) {
  return `hotelflow_${normalizeHotelKey(hotelKey).replace(/-/g, "_")}`;
}

function createHotelProvisioner({ controlPlane, databaseAdmin, hotelMigrator }) {
  if (!controlPlane || !databaseAdmin || !hotelMigrator) {
    throw new Error("HotelProvisioner requiere Control Plane, administrador de DB y migrador.");
  }

  async function provision({ hotelKey, legalName, displayName, planId, requestedBy }) {
    const normalizedKey = normalizeHotelKey(hotelKey);
    const databaseName = databaseNameForHotel(normalizedKey);
    const hotel = await controlPlane.createHotel({
      hotelKey: normalizedKey,
      legalName: String(legalName || "").trim(),
      displayName: String(displayName || legalName || "").trim(),
      planId
    });
    const installation = await controlPlane.createInstallation({ hotelId: hotel.id, requestedBy });

    async function log(level, stepCode, message) {
      await controlPlane.logInstallation({ installationId: installation.id, level, stepCode, message });
    }

    try {
      await controlPlane.updateHotelStatus(hotel.id, "provisioning");
      await log("info", "CREATE_DATABASE", `Creando base ${databaseName}.`);
      const connection = await databaseAdmin.createHotelDatabase({ hotelKey: normalizedKey, databaseName });
      await controlPlane.saveEncryptedDatabaseConnection({ hotelId: hotel.id, databaseKey: databaseName, connection });
      await log("info", "MIGRATE_SCHEMA", "Aplicando esquema y migraciones del hotel.");
      const migrations = await hotelMigrator.install({ hotelId: hotel.id, databaseName, connection });
      await controlPlane.completeInstallation({ installationId: installation.id, hotelId: hotel.id, migrations });
      await controlPlane.updateHotelStatus(hotel.id, "active");
      await log("info", "COMPLETE", "Instalación finalizada.");
      return { hotelId: hotel.id, databaseName, installationId: installation.id, migrations };
    } catch (error) {
      await controlPlane.failInstallation({ installationId: installation.id, hotelId: hotel.id, error: error.message });
      await controlPlane.updateHotelStatus(hotel.id, "failed");
      await log("error", "FAILED", error.message);
      throw error;
    }
  }

  return {
    provision
  };
}

module.exports = {
  createHotelProvisioner,
  databaseNameForHotel,
  normalizeHotelKey
};
