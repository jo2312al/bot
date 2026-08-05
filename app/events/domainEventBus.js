function createDomainEventBus() {
  const subscribers = new Map();

  function subscribe(eventName, handler) {
    if (!String(eventName || "").trim() || typeof handler !== "function") {
      throw new Error("Evento y manejador son requeridos.");
    }
    const handlers = subscribers.get(eventName) || new Set();
    handlers.add(handler);
    subscribers.set(eventName, handlers);
    return () => handlers.delete(handler);
  }

  async function publish(eventName, payload, context) {
    const handlers = [...(subscribers.get(eventName) || [])];
    await Promise.all(handlers.map(handler => handler(payload, context)));
  }

  return {
    publish,
    subscribe
  };
}

module.exports = {
  createDomainEventBus
};
