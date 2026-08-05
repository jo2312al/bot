const assert = require("assert");
const {
  assertTransition
} = require("../app/core/rooms/roomStateMachine");
const {
  createRoomStateService
} = require("../app/core/rooms/roomStateService");
const {
  createDomainEventBus
} = require("../app/events/domainEventBus");

async function main() {
  assert.deepEqual(assertTransition("occupied", "dirty"), { from: "occupied", to: "dirty" });
  assert.throws(() => assertTransition("available", "dirty"), /No se permite/);

  let state = { state: "occupied", version: 4 };
  let emitted = null;
  const bus = createDomainEventBus();
  bus.subscribe("RoomStatusChanged", event => { emitted = event; });
  const service = createRoomStateService({
    eventBus: bus,
    repository: {
      getCurrentState: async () => state,
      applyTransition: async input => {
        assert.equal(input.expectedVersion, 4);
        state = { state: input.toState, version: 5 };
        return state;
      }
    }
  });
  const result = await service.transition({ roomId: 12, toState: "dirty", sourceEvent: "StayCheckedOut" });
  assert.equal(result.state, "dirty");
  assert.equal(emitted.sourceEvent, "StayCheckedOut");
  console.log("Máquina de estados de habitación: OK");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
