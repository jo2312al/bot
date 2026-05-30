const http = require("http");
const {
  URL
} = require("url");
const {
  readReservations,
  getRoomLimits,
  cancelRoomReservationByFolio
} = require("./services/roomInventoryService");
const {
  analyzeRackImage
} = require("./services/rackAnalysisService");

const PORT =
  Number(process.env.DASHBOARD_PORT || 3333);

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function buildOccupancy(reservations) {
  const limits =
    getRoomLimits();

  const occupancy =
    {};

  reservations
    .filter(reservation =>
      reservation.status !== "cancelada"
    )
    .forEach(reservation => {
      const dates =
        Array.isArray(reservation.dates)
          ? reservation.dates
          : [reservation.fecha];

      dates.forEach(date => {
        if (!occupancy[date]) {
          occupancy[date] = {
            date,
            King: 0,
            Doble: 0,
            limits
          };
        }

        if (reservation.habitacion === "King") {
          occupancy[date].King++;
        }

        if (reservation.habitacion === "Doble") {
          occupancy[date].Doble++;
        }
      });
    });

  return Object.values(occupancy)
    .sort((left, right) =>
      left.date.localeCompare(right.date)
    );
}

function getSummary() {
  const reservations =
    readReservations();

  const active =
    reservations.filter(reservation =>
      reservation.status !== "cancelada"
    );

  const canceled =
    reservations.filter(reservation =>
      reservation.status === "cancelada"
    );

  return {
    generatedAt:
      new Date().toISOString(),
    limits:
      getRoomLimits(),
    totals: {
      reservations:
        reservations.length,
      active:
        active.length,
      canceled:
        canceled.length
    },
    occupancy:
      buildOccupancy(reservations),
    reservations:
      reservations
        .slice()
        .reverse()
  };
}

function pageHtml() {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hotel Villa Margaritas - Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fb;
      --panel: #ffffff;
      --text: #1f2937;
      --muted: #6b7280;
      --line: #d9dee8;
      --accent: #0f766e;
      --danger: #b91c1c;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Arial, Helvetica, sans-serif;
    }
    header {
      background: var(--panel);
      border-bottom: 1px solid var(--line);
      padding: 18px 24px;
      position: sticky;
      top: 0;
      z-index: 2;
    }
    h1 {
      font-size: 22px;
      margin: 0 0 4px;
    }
    main {
      padding: 20px 24px 40px;
      max-width: 1180px;
      margin: 0 auto;
    }
    .muted { color: var(--muted); }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      margin-bottom: 18px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 18px;
    }
    .metric {
      font-size: 30px;
      font-weight: 700;
      margin-top: 8px;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    button {
      border: 1px solid var(--line);
      background: #ffffff;
      border-radius: 6px;
      padding: 9px 12px;
      cursor: pointer;
      font-weight: 600;
    }
    button:disabled {
      cursor: wait;
      opacity: .65;
    }
    button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }
    button.danger {
      color: var(--danger);
    }
    input {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 9px 10px;
      min-width: 220px;
      max-width: 100%;
    }
    .table-wrap {
      width: 100%;
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 10px 8px;
      text-align: left;
      vertical-align: top;
    }
    th {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .pill {
      display: inline-block;
      border-radius: 999px;
      padding: 3px 8px;
      background: #e7f5f2;
      color: #115e59;
      font-size: 12px;
      font-weight: 700;
    }
    .pill.cancelada {
      background: #fee2e2;
      color: #991b1b;
    }
    .bar {
      height: 8px;
      background: #e5e7eb;
      border-radius: 999px;
      overflow: hidden;
      margin-top: 4px;
      min-width: 120px;
    }
    .bar span {
      display: block;
      height: 100%;
      background: var(--accent);
    }
    textarea {
      width: 100%;
      min-height: 220px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
      font-family: Consolas, monospace;
      white-space: pre-wrap;
    }
    .rack-controls {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    @media (max-width: 800px) {
      .grid { grid-template-columns: 1fr; }
      table { font-size: 13px; }
      header, main { padding-left: 14px; padding-right: 14px; }
      header { position: static; }
      h1 { font-size: 20px; }
      .toolbar {
        align-items: stretch;
        flex-direction: column;
      }
      .toolbar > div {
        width: 100%;
      }
      .rack-controls {
        display: grid;
        grid-template-columns: 1fr;
      }
      input,
      button {
        width: 100%;
        min-width: 0;
      }
      textarea {
        min-height: 280px;
      }
      th, td {
        padding: 9px 6px;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>Hotel Villa Margaritas - Dashboard del bot</h1>
    <div class="muted">Reservas, ocupacion por fecha y cancelacion de folios</div>
  </header>
  <main>
    <section class="grid">
      <div class="panel">
        <div class="muted">Reservas activas</div>
        <div id="activeCount" class="metric">0</div>
      </div>
      <div class="panel">
        <div class="muted">Reservas canceladas</div>
        <div id="canceledCount" class="metric">0</div>
      </div>
      <div class="panel">
        <div class="muted">Limites</div>
        <div id="limits" class="metric">-</div>
      </div>
    </section>

    <section class="panel">
      <div class="toolbar">
        <div>
          <strong>Ocupacion por fecha</strong>
          <div id="updatedAt" class="muted"></div>
        </div>
        <button class="primary" onclick="loadDashboard()">Actualizar</button>
      </div>
      <div id="occupancy"></div>
    </section>

    <section class="panel">
      <div class="toolbar">
        <div>
          <strong>Lector de rack por foto</strong>
          <div class="muted">Sube una foto del rack. El dashboard usa Tesseract OCR local para leer habitaciones disponibles y suites.</div>
        </div>
      </div>
      <div class="rack-controls">
        <input id="rackImage" type="file" accept="image/*">
        <button id="analyzeRackButton" class="primary" onclick="analyzeRack()">Analizar rack</button>
      </div>
      <div style="margin-top:12px">
        <textarea id="rackResult" readonly placeholder="Aqui aparecera el resultado del rack."></textarea>
      </div>
    </section>

    <section class="panel">
      <div class="toolbar">
        <div>
          <strong>Reservas registradas</strong>
          <div class="muted">Cancelar un folio libera inventario.</div>
        </div>
        <div>
          <input id="folioInput" placeholder="Folio a cancelar">
          <button class="danger" onclick="cancelFolio()">Cancelar folio</button>
        </div>
      </div>
      <div id="reservations"></div>
    </section>
  </main>
  <script>
    async function loadDashboard() {
      const response = await fetch('/api/summary');
      const data = await response.json();

      activeCount.textContent = data.totals.active;
      canceledCount.textContent = data.totals.canceled;
      limits.textContent = 'King ' + data.limits.King + ' / Doble ' + data.limits.Doble;
      updatedAt.textContent = 'Actualizado: ' + new Date(data.generatedAt).toLocaleString();

      occupancy.innerHTML = renderOccupancy(data.occupancy);
      reservations.innerHTML = renderReservations(data.reservations);
    }

    function renderOccupancy(rows) {
      if (!rows.length) {
        return '<div class="muted">Sin reservas activas registradas.</div>';
      }

      return '<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>King</th><th>Doble</th></tr></thead><tbody>' +
        rows.map(row => {
          const kingPct = Math.min((row.King / row.limits.King) * 100, 100);
          const doblePct = Math.min((row.Doble / row.limits.Doble) * 100, 100);
          return '<tr>' +
            '<td>' + row.date + '</td>' +
            '<td>' + row.King + ' / ' + row.limits.King + '<div class="bar"><span style="width:' + kingPct + '%"></span></div></td>' +
            '<td>' + row.Doble + ' / ' + row.limits.Doble + '<div class="bar"><span style="width:' + doblePct + '%"></span></div></td>' +
          '</tr>';
        }).join('') +
      '</tbody></table></div>';
    }

    function renderReservations(rows) {
      if (!rows.length) {
        return '<div class="muted">Sin reservas registradas.</div>';
      }

      return '<div class="table-wrap"><table><thead><tr><th>Folio</th><th>Cliente</th><th>Habitacion</th><th>Fechas</th><th>Estado</th></tr></thead><tbody>' +
        rows.map(row => '<tr>' +
          '<td>#' + escapeHtml(row.folio || '') + '</td>' +
          '<td>' + escapeHtml(row.nombre || 'Sin nombre') + '<br><span class="muted">' + escapeHtml(row.telefono || '') + '</span></td>' +
          '<td>' + escapeHtml(row.habitacion || '') + (row.servicioEspecial ? '<br><span class="muted">' + escapeHtml(row.servicioEspecial) + '</span>' : '') + '</td>' +
          '<td>' + escapeHtml((row.dates || [row.fecha]).join(', ')) + '<br><span class="muted">' + (row.noches || 1) + ' noche(s)</span></td>' +
          '<td><span class="pill ' + escapeHtml(row.status || '') + '">' + escapeHtml(row.status || 'activa') + '</span></td>' +
        '</tr>').join('') +
      '</tbody></table></div>';
    }

    async function cancelFolio() {
      const folio = folioInput.value.trim().replace(/^#/, '');

      if (!folio) {
        alert('Escribe un folio.');
        return;
      }

      const response = await fetch('/api/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ folio })
      });
      const data = await response.json();

      if (!data.ok) {
        alert(data.error || 'No se pudo cancelar.');
        return;
      }

      folioInput.value = '';
      await loadDashboard();
    }

    async function analyzeRack() {
      const file = rackImage.files[0];

      if (!file) {
        alert('Selecciona una foto del rack.');
        return;
      }

      rackResult.value = 'Leyendo rack... puede tardar hasta 90 segundos.';
      analyzeRackButton.disabled = true;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);

      try {
        const dataUrl = await fileToCompressedDataUrl(file);
        const imageBase64 = dataUrl.split(',')[1];

        const response = await fetch('/api/rack/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          signal: controller.signal,
          body: JSON.stringify({
            imageBase64,
            mimeType: 'image/jpeg'
          })
        });

        const data = await response.json();

        rackResult.value = data.ok
          ? data.message + (data.ocrPreview ? '\\n\\n--- OCR detectado ---\\n' + data.ocrPreview : '')
          : data.error || 'No se pudo analizar el rack.';
      } catch (error) {
        rackResult.value = error.name === 'AbortError'
          ? 'La lectura tardo demasiado. Intenta con una foto mas derecha, bien iluminada y tomada de frente.'
          : 'No se pudo analizar el rack: ' + (error.message || 'error desconocido');
      } finally {
        clearTimeout(timeout);
        analyzeRackButton.disabled = false;
      }
    }

    function fileToCompressedDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const image = new Image();
          image.onload = () => {
            const maxSide = 1800;
            const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
            const width = Math.max(1, Math.round(image.width * ratio));
            const height = Math.max(1, Math.round(image.height * ratio));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.86));
          };
          image.onerror = reject;
          image.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    loadDashboard();
  </script>
</body>
</html>`;
}

const server =
  http.createServer(async (req, res) => {
    const url =
      new URL(req.url, `http://${req.headers.host}`);

    if (
      req.method === "GET"
      &&
      url.pathname === "/"
    ) {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      });
      res.end(pageHtml());
      return;
    }

    if (
      req.method === "GET"
      &&
      url.pathname === "/api/summary"
    ) {
      sendJson(res, 200, getSummary());
      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/rack/analyze"
    ) {
      try {
        const body =
          await readBody(req);

        if (!body.imageBase64) {
          sendJson(res, 400, {
            ok: false,
            error: "Imagen requerida"
          });
          return;
        }

        const result =
          await analyzeRackImage({
            imageBase64:
              body.imageBase64,
            mimeType:
              body.mimeType
          });

        sendJson(
          res,
          result.ok ? 200 : 400,
          result
        );
      } catch (error) {
        sendJson(res, 500, {
          ok: false,
          error:
            error.message || "No se pudo analizar el rack"
        });
      }

      return;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/cancel"
    ) {
      try {
        const body =
          await readBody(req);

        if (!body.folio) {
          sendJson(res, 400, {
            ok: false,
            error: "Folio requerido"
          });
          return;
        }

        cancelRoomReservationByFolio(String(body.folio));

        sendJson(res, 200, {
          ok: true
        });
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          error: "Solicitud invalida"
        });
      }

      return;
    }

    sendJson(res, 404, {
      ok: false,
      error: "Ruta no encontrada"
    });
  });

server.listen(PORT, () => {
  console.log(`Dashboard disponible en http://localhost:${PORT}`);
});
