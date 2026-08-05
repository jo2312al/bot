# Diagnóstico técnico — HotelFlow Core

Fecha de diagnóstico: 2026-08-01  
Rama de trabajo: `codex/hotelflow-core`  
Alcance: inspección sin cambios destructivos ni funcionales.

## Resumen ejecutivo

El repositorio es un monolito Node.js/CommonJS funcional para **Hotel Villa Margaritas**. Ya tiene una base operativa importante: bot WhatsApp, dashboard, reservas, rack, estancias, movimientos, día operativo, pre-cierre, RBAC y auditoría. Sin embargo, no es todavía una plataforma multi-hotel: la conexión MySQL es única, la configuración del hotel está codificada y no existen Control Plane, Module Registry, Tenant Resolver, provisionador ni migraciones versionadas.

La recomendación es una refactorización progresiva: conservar el monolito y los flujos actuales, introducir primero las fronteras de tenant/base individual/módulo y migrar Villa Margaritas como el primer hotel instalado.

## Stack y estructura actual

| Elemento | Estado | Evidencia |
| --- | --- | --- |
| Runtime | YA IMPLEMENTADO CORRECTAMENTE | Node.js, CommonJS y scripts npm. |
| Servidor | IMPLEMENTADO PERO REQUIERE REFACTORIZACIÓN | `http.createServer` directo; `dashboard.js` tiene ~6,303 líneas. |
| Bot | IMPLEMENTADO PERO REQUIERE REFACTORIZACIÓN | Baileys, handlers/flows/validators; configuración y textos ligados a Villa Margaritas. |
| Dashboard | IMPLEMENTADO PERO REQUIERE REFACTORIZACIÓN | HTML/rutas/lógica financiera y consultas SQL concentradas en `dashboard.js`. |
| Persistencia | IMPLEMENTADO PERO REQUIERE REFACTORIZACIÓN | JSON/SQLite de respaldo y MySQL por CLI; una conexión configurada por variables de entorno. |
| Dependencias | YA IMPLEMENTADO CORRECTAMENTE | Baileys, PDFKit, QR, Pino y RSS; superficie reducida. |
| Pruebas | IMPLEMENTADO PERO REQUIERE REFACTORIZACIÓN | Validación sintáctica y smoke test; no hay suite de pruebas de dominio/migración. |

## Inventario funcional

| Área | Clasificación | Estado observado |
| --- | --- | --- |
| Reservas/cotizaciones/calendario | IMPLEMENTADO PERO REQUIERE REFACTORIZACIÓN | Bot y dashboard registran reservas; mezcla almacenamiento de respaldo y MySQL. |
| Check-in/out | IMPLEMENTADO PERO REQUIERE REFACTORIZACIÓN | `checkinLedgerService` registra estancia, movimientos y check-out con saldo cero. La papeleta actual tiene demasiados campos. |
| Saldos | IMPLEMENTADO PERO REQUIERE REFACTORIZACIÓN | `account_movements` calcula saldo por cargos menos pagos; faltan entidad de pago, reversas formales y estado fiscal. |
| Rack | IMPLEMENTADO PERO REQUIERE REFACTORIZACIÓN | Hay CSV/foto/estado manual y `operational_room_states`; son fuentes paralelas que pueden divergir. |
| Día operativo | YA IMPLEMENTADO CORRECTAMENTE, CON BRECHAS | `operational_days`, snapshots, pre-cierre y cierre con apertura del día siguiente. Faltan caja física, conteo y reporte fiscal/de depósito. |
| Reportes | IMPLEMENTADO PERO REQUIERE REFACTORIZACIÓN | Ocupación, rotación, fuentes, auditoría y saldos; dependen de consultas en `dashboard.js`. |
| Usuarios/RBAC | YA IMPLEMENTADO CORRECTAMENTE, CON BRECHAS | Roles, permisos, sesiones scrypt, CSRF y bitácora existen. Modo de autenticación por defecto `observe` es riesgo de producción. |
| Auditoría | YA IMPLEMENTADO CORRECTAMENTE, CON BRECHAS | Tabla y servicio existen; asegurar cobertura de todo movimiento sensible y eventos futuros. |
| Histórico huéspedes | FALTA IMPLEMENTAR | Solo `guests` básico (nombre/teléfono) y referencias desde reservas/estancias. Faltan contactos, preferencias, consentimientos, incidencias y deduplicación asistida. |
| Caja/corte | FALTA IMPLEMENTAR | Hay permisos previstos, pero no cajas, turnos, conteo de efectivo, depósito ni cruce fiscal. |
| CFDI/PAC | FALTA IMPLEMENTAR | Hay permisos y ajustes financieros, sin entidad de factura, PAC, XML, PDF fiscal ni cancelación. |
| Housekeeping/camaristas | FALTA IMPLEMENTAR | Existen estados/notas de habitación, no tareas, asignación, checklist ni inspección. |
| Preasignación/rotación | IMPLEMENTADO PERO REQUIERE REFACTORIZACIÓN | Preasignación y reportes de rotación existen en dashboard; deben extraerse como módulos opcionales. |
| Admin configurador | IMPLEMENTADO PERO REQUIERE REFACTORIZACIÓN | Existe `/usuarios` y ajustes financieros; faltan propiedad, habitaciones, tarifas, bot, módulos, plan y auditoría en `/admin`. |
| Control Plane | FALTA IMPLEMENTAR | No hay hoteles, planes, licencias, dominios, instalaciones ni conexiones cifradas. |
| DB individual por hotel | FALTA IMPLEMENTAR | `mysqlCliService` toma una base global de `MYSQL_DATABASE`; `property_key` es solo un campo, no aislamiento físico. |
| Module Registry/eventos | FALTA IMPLEMENTAR | No hay registro de módulos, contratos ni bus de eventos interno. |

## Modelo de datos actual

El esquema MySQL actual contiene buenas entidades base: tipos/habitaciones, huéspedes, reservas/noches/asignaciones, notas, check-ins, movimientos, usuarios/roles/sesiones, días operativos/snapshots/estado SQL de rack, auditoría, bloqueos, eventos de habitación, cotizaciones y reportes SQL.

### Lo que ya está bien

- Reservas, noches y ocupación física se separan en tablas diferentes.
- Check-in conserva snapshots de huésped y habitación.
- El saldo se deriva de `account_movements` en vez de un campo de saldo único.
- Día operativo y snapshots de apertura/cierre ya existen.
- Permisos y auditoría tienen tablas propias.

### Brechas para la arquitectura objetivo

- `property_key` se repite en usuarios, día operativo y auditoría dentro de una sola DB; debe dejar de ser mecanismo de aislamiento al provisionar una DB por hotel.
- No existe una tabla/versión de esquema ni un gestor de migraciones.
- `account_movements` combina cargo/pago y no tiene entidades normalizadas de pago, caja, reversa, solicitud fiscal o CFDI.
- No existen perfiles completos de huésped ni relaciones de acompañantes/consentimientos.
- Estados `VS`, `OC` del rack importado conviven con estados en español de `operational_room_states`; debe definirse una máquina de estados canónica.

## Acoplamientos y deuda técnica

1. **Crítico — hotel codificado:** `constants/contact.js`, `constants/hotelCatalog.js`, `config/config.js`, textos, imágenes y PDF mencionan Villa Margaritas.
2. **Crítico — DB única:** `mysqlCliService` usa una única base de variables de entorno; no hay Tenant Resolver ni administrador de conexiones.
3. **Crítico — fuentes duplicadas de rack:** JSON/CSV, rack SQL y check-in actualizan estados por caminos distintos.
4. **Alto — dashboard monolítico:** `dashboard.js` concentra servidor HTTP, HTML, PDF, SQL, reportes y rutas.
5. **Alto — seguridad gradual:** `APP_AUTH_MODE` puede operar en `observe`; para comercialización debe llegar a `enforce` por instalación.
6. **Alto — movimientos financieros:** no hay reversa explícita, vínculo fiscal, caja/turno ni garantía de inmutabilidad a nivel de diseño.
7. **Medio — base de datos:** ejecutar `CREATE TABLE IF NOT EXISTS` no sustituye migraciones versionadas ni pruebas de actualización.
8. **Medio — bot acoplado:** handlers importan contactos/grupos y servicios de reserva directamente; no hay adaptador de tenant ni eventos.
9. **Medio — pruebas:** falta cobertura de reglas de negocio, migraciones, aislamiento y permisos.

## Riesgos de migración

- Cambiar `property_key` o datos de habitaciones sin una migración controlada puede afectar saldos, check-ins activos y reportes.
- Migrar el rack sin una tabla de equivalencias puede perder estado de limpieza/bloqueo.
- Reemplazar el bot antes de extraer configuración puede interrumpir grupos de recepción/ventas.
- Crear bases por hotel sin un instalador versionado genera esquemas distintos entre clientes.
- Activar facturación antes de PAC/CSD/sandbox puede generar documentos incorrectos o no fiscales.

## Plan de refactorización

### Bloque 0 — Fundaciones sin alterar operación actual

1. Crear `app/tenant/`: `TenantResolver`, `TenantContext`, `TenantDatabaseManager` y contrato `HotelDatabaseConnection`.
2. Crear `app/modules/`: registro declarativo de Core y módulos opcionales, dependencias, permisos y estado.
3. Crear `app/events/`: bus interno síncrono, contratos y eventos iniciales sin consumidores obligatorios.
4. Crear esquema del Control Plane separado de las bases de hotel; solo hoteles, planes, módulos, dominios, licencias, instalaciones, migraciones y conexión cifrada.
5. Crear `MigrationManager` y tabla `schema_versions` en cada DB de hotel.
6. Agregar pruebas unitarias para resolver tenant, bloquear acceso sin contexto y calcular módulos/límites.

**Criterio de aceptación:** una petición puede resolver un hotel de prueba y abrir únicamente su DB; Villa Margaritas sigue usando su conexión actual sin cambio de datos.

### Bloque 1 — Core canónico

- Extraer reservas, estancias, folios/movimientos, habitaciones y rack a servicios de dominio.
- Definir máquina de estados de habitación y prohibir transiciones inválidas.
- Reducir la papeleta de check-in a una página.
- Hacer que check-out emita evento y deje habitación en estado sucia; housekeeping será consumidor opcional.

### Bloque 2 — Instalador y administrador

- Provisionar DB limpia por hotel, aplicar esquema/seeds/migraciones, crear administrador y validar instalación.
- Crear `/admin` para propiedad, habitaciones, tarifas, usuarios, bot, finanzas y módulos.
- Migrar Villa Margaritas con respaldo, comparación de conteos/saldos/ocupación y reversa documentada.

### Bloque 3 — Caja y corte fiscal

- Añadir turnos/cajas, conteo por denominación, movimientos, reapertura auditada y un único reporte "Corte fiscal y depósito".
- Mantener forma de pago y estado fiscal como dimensiones independientes.

### Bloque 4 — Operación y módulos comerciales

- Histórico huésped, housekeeping, mantenimiento, preasignación/rotación y reportes avanzados.
- CFDI con adaptador PAC; después pagos, OTA, CRM, POS y landing.

## Primer bloque propuesto para ejecutar después de aprobación

Implementar únicamente la fundación de tenant/control plane/módulos/migraciones en archivos nuevos, sin redirigir todavía el dashboard ni el bot a otra DB. No modificar `dashboard.js`, `index.js`, reservas ni el esquema operativo existente hasta que los contratos y pruebas estén validados.
