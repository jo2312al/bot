function createMigrationManager(migrations = []) {
  const ordered = [...migrations]
    .map(migration => ({
      id: String(migration.id || "").trim(),
      destructive: Boolean(migration.destructive),
      up: migration.up
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  if (ordered.some(migration => !migration.id || typeof migration.up !== "function")) {
    throw new Error("Cada migración requiere id y función up.");
  }

  async function apply({ currentVersion = "", approveDestructive = false, execute }) {
    if (typeof execute !== "function") throw new Error("MigrationManager requiere execute.");
    const pending = ordered.filter(migration => migration.id > currentVersion);

    for (const migration of pending) {
      if (migration.destructive && !approveDestructive) {
        throw new Error(`La migración ${migration.id} requiere aprobación explícita.`);
      }
      await migration.up(execute);
    }

    return pending.map(migration => migration.id);
  }

  return {
    apply,
    list: () => [...ordered]
  };
}

module.exports = {
  createMigrationManager
};
