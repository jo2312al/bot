function normalizeModuleId(value) {
  const id = String(value || "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error("El id del módulo no es válido.");
  return id;
}

function createModuleRegistry(definitions = []) {
  const modules = new Map();

  definitions.forEach(definition => {
    const id = normalizeModuleId(definition.id);
    if (modules.has(id)) throw new Error(`El módulo ${id} está duplicado.`);
    modules.set(id, Object.freeze({
      id,
      name: String(definition.name || id).trim(),
      version: String(definition.version || "1.0.0").trim(),
      core: Boolean(definition.core),
      dependencies: Object.freeze([...(definition.dependencies || []).map(normalizeModuleId)]),
      permissions: Object.freeze([...(definition.permissions || [])])
    }));
  });

  function get(id) {
    return modules.get(normalizeModuleId(id)) || null;
  }

  function resolveActive(moduleIds = []) {
    const requested = new Set(moduleIds.map(normalizeModuleId));
    modules.forEach(module => {
      if (module.core) requested.add(module.id);
    });

    const resolved = new Set();
    const resolving = new Set();

    function include(id) {
      if (resolved.has(id)) return;
      if (resolving.has(id)) throw new Error(`Dependencia circular en el módulo ${id}.`);
      const module = get(id);
      if (!module) throw new Error(`El módulo ${id} no está registrado.`);
      resolving.add(id);
      module.dependencies.forEach(include);
      resolving.delete(id);
      resolved.add(id);
    }

    requested.forEach(include);
    return [...resolved];
  }

  return {
    get,
    list: () => [...modules.values()],
    resolveActive
  };
}

module.exports = {
  createModuleRegistry
};
