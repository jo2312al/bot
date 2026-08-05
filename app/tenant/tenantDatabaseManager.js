function createTenantDatabaseManager({ getHotelDatabaseConnection }) {
  if (typeof getHotelDatabaseConnection !== "function") {
    throw new Error("TenantDatabaseManager requiere getHotelDatabaseConnection.");
  }

  async function withDatabase(context, operation) {
    if (!context?.hotelId || !context?.databaseKey) {
      throw new Error("Se requiere un TenantContext para acceder a una base de hotel.");
    }
    if (typeof operation !== "function") {
      throw new Error("Se requiere una operación de base de datos.");
    }

    const connection = await getHotelDatabaseConnection({
      hotelId: context.hotelId,
      databaseKey: context.databaseKey
    });

    if (!connection) {
      throw new Error("No fue posible abrir la base de datos del hotel.");
    }

    return operation(connection, context);
  }

  return {
    withDatabase
  };
}

module.exports = {
  createTenantDatabaseManager
};
