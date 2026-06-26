# Dashboard refactor plan

El dashboard empezó como un archivo único y ya mezcla demasiadas responsabilidades.
La refactorización se hará por cortes pequeños para no romper producción.

## Estado actual

- `dashboard.js` todavía contiene:
  - servidor HTTP y ruteo;
  - generación de HTML/CSS/JS;
  - handlers de API;
  - parte de reportes y búsqueda;
  - glue code con servicios existentes.
- Ya se extrajo:
  - catálogo de habitaciones/tarifas a `constants/hotelCatalog.js`;
  - bloqueos de habitación a `services/roomBlockService.js`.

## Siguientes fases

1. Extraer reportes:
   - mover `getReports`, `getMysqlReports`, `getFallbackReports` y export CSV a `services/dashboardReportService.js`;
   - dejar `dashboard.js` solo llamando `reportService.getReports(...)`.

2. Extraer búsqueda:
   - mover historial de huéspedes y búsqueda global a `services/dashboardSearchService.js`;
   - inyectar `getSummary` para evitar dependencias circulares.

3. Separar frontend:
   - mover CSS a `public/dashboard.css`;
   - mover JS del navegador a `public/dashboard.js`;
   - dejar el HTML como plantilla pequeña.

4. Separar rutas:
   - crear `dashboard/routes/*.js` por dominio:
     - reservations;
     - events;
     - reports;
     - rack;
     - room blocks.

5. Agregar pruebas de humo:
   - validar que `pageHtml()` genera JS parseable;
   - validar endpoints principales: `/api/summary`, `/api/search`, `/api/reports`.

## Regla para cambios nuevos

Toda función nueva debe vivir en un servicio o módulo dedicado, salvo que sea glue code
del servidor HTTP. `dashboard.js` no debe seguir creciendo como archivo de negocio.
