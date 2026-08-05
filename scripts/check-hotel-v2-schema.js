const assert = require("assert");
const { createHotelV2Migrations } = require("../app/migrations/hotelV2Migrations");
const migrations = createHotelV2Migrations();
assert.equal(migrations.length, 2);
assert.equal(migrations[0].id, "001-core");
["guests", "guest_contacts", "reservations", "stays", "folios", "folio_entries", "payment_transactions", "operating_days", "cash_shifts", "room_current_states", "room_state_events"].forEach(table => assert(migrations[0].source.includes(`CREATE TABLE IF NOT EXISTS ${table}`)));
assert(migrations[0].source.includes("fiscal_status"));
assert(migrations[0].source.includes("deposit_amount"));
console.log("Esquema hotel v2: OK");
