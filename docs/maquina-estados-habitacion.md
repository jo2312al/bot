# Máquina de estados de habitación

Estados canónicos del Core v2: `available`, `reserved`, `occupied`, `dirty`, `clean`, `inspection`, `blocked`, `maintenance`, `out_of_service`.

| Desde | Transiciones permitidas |
| --- | --- |
| available | reserved, occupied, blocked, maintenance, out_of_service |
| reserved | available, occupied, blocked, maintenance, out_of_service |
| occupied | dirty, maintenance, out_of_service |
| dirty | clean, maintenance, out_of_service |
| clean | inspection, available, maintenance, out_of_service |
| inspection | available, dirty, maintenance, out_of_service |
| blocked | available, clean, maintenance, out_of_service |
| maintenance | clean, blocked, out_of_service |
| out_of_service | maintenance, clean, blocked |

Eventos origen sugeridos: `ReservationConfirmed`, `StayCheckedIn`, `StayCheckedOut`, `HousekeepingCompleted`, `RoomInspected`, `RoomBlocked`, `MaintenanceStarted` y `MaintenanceCompleted`.

El repositorio debe aplicar el cambio de estado actual y crear `room_state_events` en la misma transacción, usando la versión esperada para evitar que dos usuarios sobrescriban el mismo rack.
