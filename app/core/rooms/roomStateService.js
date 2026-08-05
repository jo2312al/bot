const {
  assertTransition
} = require("./roomStateMachine");

function createRoomStateService({ repository, eventBus }) {
  if (!repository?.getCurrentState || !repository?.applyTransition) {
    throw new Error("RoomStateService requiere un repositorio de estados de habitación.");
  }
  if (!eventBus?.publish) {
    throw new Error("RoomStateService requiere un bus de eventos.");
  }

  async function transition({ roomId, toState, userId = null, reason = "", sourceEvent, expectedVersion = null, context }) {
    const current = await repository.getCurrentState(roomId);
    if (!current) throw new Error("No existe estado actual para la habitación.");
    const states = assertTransition(current.state, toState);
    const result = await repository.applyTransition({
      roomId,
      fromState: states.from,
      toState: states.to,
      userId,
      reason: String(reason || "").trim(),
      sourceEvent: String(sourceEvent || "manual").trim(),
      expectedVersion: expectedVersion === null ? current.version : expectedVersion
    });
    await eventBus.publish("RoomStatusChanged", {
      roomId,
      fromState: states.from,
      toState: states.to,
      sourceEvent: String(sourceEvent || "manual").trim(),
      reason: String(reason || "").trim(),
      version: result.version
    }, context);
    return result;
  }

  return {
    transition
  };
}

module.exports = {
  createRoomStateService
};
