# Plan de seguridad y operacion administrativa

Estado: diseño previo a implementación.

## 1. Objetivo

Sustituir el acceso compartido y las reglas de emergencia por un sistema donde cada accion administrativa:

- pertenezca a una persona identificada;
- se autorice mediante un permiso explicito;
- quede vinculada a una propiedad y un dia operativo;
- genere evidencia de auditoria;
- no permita alterar silenciosamente un cierre, saldo o estancia.

La autorizacion se aplicara en el servidor. La interfaz solamente ocultara o deshabilitara acciones que el usuario no puede ejecutar.

## 2. Principios

1. SQL sera la fuente oficial de usuarios, estancias, movimientos, habitaciones y cierres.
2. Los JSON seran snapshots inmutables de apertura, cierre o importaciones; nunca una segunda fuente editable.
3. Ningun movimiento financiero se elimina. Las correcciones se realizan mediante reversos relacionados.
4. Un dia cerrado es inmutable. La reapertura sera excepcional, autorizada y auditada.
5. Una habitacion con check-in activo no se puede liberar ni editar directamente desde el rack.
6. El saldo controla el check-out; el check-in activo controla la ocupacion.
7. Cada accion sensible requiere usuario, fecha operativa, hora real y motivo cuando corresponda.
8. Los permisos se asignan a roles; las excepciones directas por usuario se reservaran para una etapa posterior.

## 3. Identidad y sesiones

### Usuarios

Cada usuario tendra:

- id interno;
- propiedad a la que pertenece;
- nombre visible;
- nombre de acceso unico dentro de la propiedad;
- hash de contraseña, nunca contraseña reversible;
- estado: pendiente, activo, bloqueado o deshabilitado;
- rol;
- intentos fallidos y bloqueo temporal;
- ultimo acceso y ultimo cambio de contraseña;
- fecha de creacion y usuario creador.

### Sesiones

- Cookie `HttpOnly`, `Secure` en produccion y `SameSite=Lax`.
- Token aleatorio; en SQL solo se conserva su hash.
- Caducidad por inactividad y caducidad absoluta.
- Cierre de una sesion o de todas las sesiones del usuario.
- Renovacion del identificador al iniciar sesion y al elevar privilegios.
- Proteccion CSRF para operaciones de escritura.
- La API no aceptara identidad enviada por el cliente en campos como `closedBy` o `createdBy`; la tomara de la sesion.

La credencial Basic actual se mantendra solo como compatibilidad temporal y se retirara despues de crear al primer administrador.

## 4. Roles iniciales

### Administrador

Configura usuarios, roles, catalogos, propiedad y reglas. Puede autorizar reaperturas y operaciones excepcionales. No debe usar esta cuenta para la operacion diaria.

### Gerencia

Consulta toda la operacion, autoriza ajustes, descuentos, cortesias, reembolsos, credito y reaperturas segun politica. Puede cerrar el dia.

### Auditor nocturno

Ejecuta validaciones, carga de rentas, revisa excepciones, genera reportes y cierra el dia. No administra usuarios ni modifica configuracion fiscal.

### Recepcion

Gestiona reservas, check-in, cambios de habitacion permitidos, cargos ordinarios, pagos y check-out con saldo resuelto. No autoriza sus propios ajustes sensibles.

### Caja

Registra pagos, abre y cierra su caja, consulta sus movimientos y realiza conciliacion. No modifica estancias ni tarifas.

### Ventas

Gestiona clientes, cotizaciones, reservas, grupos, eventos y anticipos; no opera habitaciones ni cierra dias.

### Contabilidad

Consulta movimientos y cierres, gestiona cuentas por cobrar y facturacion. No cambia rack ni estancias activas.

### Consulta

Acceso de solo lectura a los modulos expresamente habilitados.

## 5. Catalogo inicial de permisos

Los codigos seran estables y se validaran en cada endpoint.

| Modulo | Permisos |
| --- | --- |
| Usuarios | `users.view`, `users.create`, `users.update`, `users.disable`, `roles.manage` |
| Reservas | `reservations.view`, `reservations.create`, `reservations.update`, `reservations.cancel` |
| Estancias | `stays.view`, `stays.checkin`, `stays.update`, `stays.move_room`, `stays.checkout` |
| Rack | `rack.view`, `rack.update_manual_state`, `rack.block`, `rack.unblock` |
| Cuentas | `ledger.view`, `ledger.charge`, `ledger.payment`, `ledger.transfer`, `ledger.adjust` |
| Autorizaciones | `ledger.authorize_discount`, `ledger.authorize_refund`, `ledger.authorize_credit` |
| Caja | `cash.open`, `cash.view_own`, `cash.view_all`, `cash.close`, `cash.reconcile` |
| Dia operativo | `business_day.view`, `business_day.audit`, `business_day.close`, `business_day.reopen` |
| Reportes | `reports.operational`, `reports.financial`, `reports.export`, `reports.closed_snapshot` |
| Facturacion | `invoices.view`, `invoices.draft`, `invoices.issue`, `invoices.cancel`, `invoices.configure` |
| Auditoria | `audit.view`, `audit.export` |

## 6. Matriz inicial por rol

La matriz completa se sembrara en SQL. Estas son las decisiones de negocio principales:

| Accion | Admin | Gerencia | Auditor | Recepcion | Caja | Ventas | Contabilidad | Consulta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Crear/modificar usuarios | Si | No | No | No | No | No | No | No |
| Check-in y cambio de habitacion | Si | Si | Consulta | Si | No | No | No | No |
| Cargo ordinario | Si | Si | Si | Si | No | No | No | No |
| Registrar pago | Si | Si | Si | Si | Si | Anticipo | Si | No |
| Ajuste/descuento/reembolso | Si | Autoriza | No | Solicita | Solicita | Solicita | Autoriza | No |
| Check-out | Si | Si | Si | Si | No | No | No | No |
| Cierre de caja propia | Si | Si | Si | No | Si | No | No | No |
| Cierre de dia | Si | Si | Si | No | No | No | No | No |
| Reabrir dia | Si | Si con motivo | No | No | No | No | No | No |
| Emitir factura | Si | Si | No | Solicita | No | Solicita | Si | No |
| Cancelar factura | Si | Autoriza | No | No | No | No | Si | No |
| Ver reportes financieros | Si | Si | Si | Limitado | Propios | No | Si | Configurable |

No se permitira que una persona solicite y autorice su propio ajuste cuando el importe supere el limite configurado.

## 7. Dia operativo

### Apertura

- El primer dia se abre desde las `00:00:00` de su fecha.
- Solo puede existir un dia operativo abierto por propiedad.
- Al abrir se crea una fila por cada habitacion activa en `operational_room_states`.
- Las habitaciones que continúan heredan su estancia y estado ocupado.
- Se genera un snapshot JSON de apertura con checksum.

### Durante el dia

Cada check-in, cargo, pago, ajuste, cambio de habitacion y evento guardara:

- `business_date`: dia operativo abierto;
- `occurred_at`: hora real en la zona de la propiedad;
- `created_by_user_id`;
- entidad y cuenta relacionadas;
- origen de la operacion;
- identificador idempotente cuando aplique.

La medianoche no cambia automaticamente el dia operativo. El dia siguiente comienza cuando el anterior se cierra.

### Pre-cierre

El sistema comprobara:

- rack contra check-ins activos;
- habitaciones ocupadas sin estancia;
- estancias sin habitacion;
- dobles ocupaciones;
- bloqueos incompatibles;
- habitaciones sin tarifa numerica;
- rentas faltantes o duplicadas;
- salidas vencidas;
- pagos sin forma o referencia requerida;
- cajas abiertas o sin conciliar;
- anticipos sin aplicar;
- ajustes pendientes de autorizacion;
- snapshots pendientes.

Las excepciones se clasificaran como bloqueantes o advertencias.

### Cierre

Una transaccion de cierre:

1. bloquea el dia para impedir nuevas escrituras;
2. vuelve a ejecutar las validaciones;
3. carga rentas faltantes de forma idempotente;
4. calcula totales y conciliaciones;
5. genera los reportes oficiales;
6. crea el snapshot JSON de cierre;
7. guarda checksum y totales de control;
8. marca el dia cerrado;
9. abre el siguiente dia y crea sus estados de habitacion.

Si falla cualquier paso, el cierre completo se revierte.

### Reapertura

- Solo administrador o gerencia.
- Motivo obligatorio.
- No borra el cierre anterior: crea una version de reapertura.
- Invalida de forma visible los reportes anteriores.
- Registra usuario, hora, motivo y nueva version.

## 8. Reglas de rack y estancia

1. El rack se deriva de estancias, bloqueos y limpieza; no es autoridad independiente.
2. Check-in activo implica habitacion ocupada, incluso con saldo cero.
3. Una habitacion ocupada no admite cambio manual de estado.
4. El cambio de habitacion se realiza como una operacion de estancia y conserva asignacion anterior, fechas y movimientos.
5. El check-out requiere saldo cero o una autorizacion registrada de credito, cortesia o ajuste.
6. Una reserva de varias habitaciones crea varias estancias relacionadas con la reserva principal.
7. Una habitacion bloqueada no admite check-in hasta un desbloqueo autorizado.

## 9. Reportes oficiales del cierre

Se conservaran los tres reportes solicitados:

1. Sabana de rentas y extras.
2. Huespedes con saldos actuales.
3. Cargos y creditos por concepto y forma de pago.

El paquete diario agregara:

4. Resumen ejecutivo del dia.
5. Estado inicial y final de habitaciones.
6. Llegadas, salidas y continuaciones.
7. Corte y conciliacion por caja y forma de pago.
8. Anticipos recibidos, aplicados y pendientes.
9. Excepciones de auditoria.
10. Ajustes, descuentos, cortesias, reversos y reembolsos.

Cada reporte cerrado tendra version, fecha de generacion, usuario, datos JSON normalizados y checksum. Imprimir nuevamente un cierre consultara ese snapshot, no recalculara informacion actual.

## 10. Modelo SQL propuesto

### Seguridad

- `app_users`
- `app_roles`
- `app_permissions`
- `app_user_roles`
- `app_role_permissions`
- `app_sessions`
- `audit_log`

### Operacion

- `operational_days`
- `operational_room_states`
- `stays`
- `stay_room_assignments`
- `guest_accounts`
- ampliacion de `account_movements`
- `movement_links` para reversos y transferencias
- `cash_sessions`
- `cash_counts`
- `authorization_requests`
- `operational_day_snapshots`
- `closed_report_snapshots`

Las tablas actuales se migraran gradualmente. No se eliminaran `checkins`, `account_movements` ni `daily_closures` hasta validar equivalencia y completar dos cierres paralelos satisfactorios.

## 11. Auditoria

La bitacora registrara:

- usuario y rol efectivo;
- propiedad;
- accion y permiso utilizado;
- entidad y registro afectados;
- dia operativo;
- fecha/hora real;
- valores anteriores y posteriores para campos permitidos;
- motivo y autorizador;
- IP y agente del cliente;
- resultado: exitoso o rechazado.

Contraseñas, tokens, CSD y secretos fiscales nunca se incluyen en la bitacora.

## 12. Etapas de implementacion

### Etapa A - Fundacion de seguridad

1. Crear tablas de usuarios, roles, permisos, sesiones y auditoria.
2. Sembrar roles y matriz inicial.
3. Crear primer administrador mediante comando local de un solo uso.
4. Implementar login, logout, sesion y middleware de permisos.
5. Sustituir `closedBy` y `createdBy` enviados por el navegador por identidad de sesion.

### Etapa B - Dia operativo

1. Crear `operational_days` y estados diarios de todas las habitaciones.
2. Asignar explicitamente `business_date` a movimientos nuevos.
3. Implementar apertura, pre-cierre, cierre transaccional y reapertura.
4. Crear snapshots JSON inmutables.
5. Retirar la fecha fija `2026-07-10`.

### Etapa C - Estancias y cuentas

1. Separar reserva de estancia.
2. Soportar multiples habitaciones por reserva.
3. Implementar historial de asignacion y cambios de habitacion.
4. Convertir tarifas a importes estructurados.
5. Agregar anticipos, transferencias, reversos, ajustes y autorizaciones.

### Etapa D - Rack protegido

1. Derivar estado desde estancia, bloqueo y limpieza.
2. Bloquear edicion manual cuando exista check-in activo.
3. Comparar snapshot importado contra SQL sin convertirlo en autoridad.
4. Mostrar la causa del estado y la accion necesaria para cambiarlo.

### Etapa E - Reportes y caja

1. Adaptar los tres reportes existentes al dia operativo explicito.
2. Implementar caja, conciliacion y excepciones.
3. Crear el paquete diario completo y sus snapshots.
4. Ejecutar dos cierres paralelos contra los reportes actuales.

### Etapa F - Facturacion

Comenzara despues de estabilizar conceptos, impuestos, pagos y cierres. Incluira expediente fiscal, borradores ligados a cuentas, PAC, timbrado, XML/PDF, consulta, cancelacion y complementos de pago.

## 13. Estrategia de despliegue

1. Agregar tablas y columnas sin cambiar el flujo visible.
2. Activar identidad y auditoria en modo observacion.
3. Exigir permisos en operaciones sensibles.
4. Escribir temporalmente en el modelo antiguo y nuevo desde una sola transaccion o adaptador controlado.
5. Comparar cierres y saldos.
6. Cambiar lecturas al modelo nuevo.
7. congelar el modelo anterior y conservarlo para consulta historica.

No se usaran dos fuentes editables ni escrituras independientes a SQL y archivos JSON.

## 14. Criterios de aceptacion

- Toda operacion sensible identifica al usuario real.
- Un endpoint rechazado no puede ejecutarse llamandolo directamente.
- Solo existe un dia abierto por propiedad.
- Todos los movimientos tienen dia operativo y hora real.
- No se modifica el rack de una habitacion con estancia activa.
- Una reserva admite varias estancias/habitaciones.
- Los cargos nocturnos no se duplican.
- Un cierre fallido no deja datos parciales.
- Los reportes cerrados no cambian al modificar datos posteriores.
- Toda reapertura, ajuste y reverso queda explicado y autorizado.
- SQL es la autoridad y JSON funciona solo como evidencia inmutable.

