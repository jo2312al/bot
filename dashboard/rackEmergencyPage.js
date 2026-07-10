const RACK_STATUS_OPTIONS = [
  ["VL", "Vacio limpio"],
  ["VS", "Vacio sucio"],
  ["OC", "Ocupado"],
  ["OS", "Ocupado sucio"],
  ["OL", "Ocupado limpio"],
  ["OR", "Ocupado reciente"],
  ["OSE", "Ocupado sin equipaje"],
  ["ND", "No durmio"],
  ["BLO", "Bloqueado"],
  ["FS", "Fuera de servicio"],
  ["A", "Pre-asignado limpio"],
  ["AS", "Asignado sucio"],
  ["CH", "Cambio de habitacion"]
];

function rackEmergencyPageHtml() {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rack Emergencia - Villa Margaritas</title>
  <style>
    :root {
      --bg: #f7f1ea;
      --panel: #fffaf7;
      --line: #e7d9cf;
      --text: #2f211c;
      --muted: #765f55;
      --accent: #4f2f26;
      --gold: #ffd85a;
      --clean: #dce9d7;
      --dirty: #ffe3a0;
      --occupied: #ffd8ce;
      --blocked: #d8d2cc;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    header {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      padding: 18px 22px;
      background: rgba(255, 250, 247, .96);
      border-bottom: 1px solid var(--line);
    }
    h1 {
      margin: 0;
      font-family: Georgia, serif;
      font-size: 28px;
    }
    main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 22px;
      display: grid;
      gap: 18px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 10px 24px rgba(47, 33, 28, .06);
    }
    .muted { color: var(--muted); }
    .toolbar {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      align-items: end;
    }
    label {
      display: grid;
      gap: 6px;
      font-weight: 700;
    }
    input, select, button {
      min-height: 44px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px 12px;
      font: inherit;
      color: var(--text);
      background: #fff;
    }
    button {
      cursor: pointer;
      font-weight: 800;
    }
    button.primary {
      background: var(--accent);
      color: #fff;
      box-shadow: 0 12px 24px rgba(79, 47, 38, .18);
    }
    .status {
      min-height: 24px;
      font-weight: 700;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .kpi {
      border: 1px solid var(--line);
      background: #fff;
      border-radius: 8px;
      padding: 12px;
    }
    .kpi strong {
      display: block;
      font-size: 26px;
      margin-top: 4px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
      gap: 10px;
    }
    .room {
      text-align: left;
      display: grid;
      gap: 4px;
      min-height: 82px;
      border-radius: 8px;
    }
    .room strong { font-size: 20px; }
    .room span {
      font-size: 12px;
      color: var(--muted);
      overflow-wrap: anywhere;
    }
    .room.clean { background: var(--clean); }
    .room.dirty { background: var(--dirty); }
    .room.occupied { background: var(--occupied); }
    .room.blocked { background: var(--blocked); }
    .room.selected {
      outline: 3px solid var(--gold);
      border-color: var(--accent);
    }
    @media (max-width: 760px) {
      header, .toolbar, .summary {
        grid-template-columns: 1fr;
      }
      header {
        display: grid;
      }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Rack Emergencia</h1>
      <div class="muted">Cambio manual de estado por habitacion. No sube CSV ni foto.</div>
    </div>
    <button onclick="loadRack()">Actualizar vista</button>
  </header>
  <main>
    <section class="panel">
      <div class="toolbar">
        <label>Habitacion
          <input id="roomInput" inputmode="numeric" placeholder="Ej. 101">
        </label>
        <label>Estado
          <select id="statusInput">
            ${RACK_STATUS_OPTIONS.map(([value, label]) =>
              `<option value="${value}">${value} - ${label}</option>`
            ).join("")}
          </select>
        </label>
        <button class="primary" onclick="saveRoomStatus()">Guardar estado</button>
        <button onclick="clearSelection()">Limpiar seleccion</button>
      </div>
      <div id="statusText" class="status muted" style="margin-top:12px"></div>
    </section>
    <section class="summary" id="summary"></section>
    <section class="panel">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
        <div>
          <strong>Habitaciones del ultimo rack</strong>
          <div id="rackMeta" class="muted">Cargando rack...</div>
        </div>
      </div>
      <div id="roomGrid" class="grid"></div>
    </section>
  </main>
  <script>
    let rackStatus = null;
    let selectedRoom = "";

    const statusLabels = ${JSON.stringify(Object.fromEntries(RACK_STATUS_OPTIONS))};

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function roomClass(status) {
      if (status === "VL") return "clean";
      if (status === "VS") return "dirty";
      if (["OC", "OS", "OL", "OR", "OSE", "ND"].includes(status)) return "occupied";
      return "blocked";
    }

    function setStatus(message, isError = false) {
      statusText.textContent = message;
      statusText.style.color = isError ? "#b00020" : "";
    }

    async function loadRack() {
      setStatus("Cargando rack...");
      const response = await fetch("/api/rack-emergencia/status", {
        cache: "no-store"
      });
      const data = await response.json();

      if (!data.ok) {
        setStatus(data.error || "No se pudo cargar el rack.", true);
        return;
      }

      rackStatus = data.rackStatus;
      renderRack();
      setStatus("Rack actualizado en pantalla.");
    }

    function renderRack() {
      const rooms = Array.isArray(rackStatus?.rooms) ? rackStatus.rooms : [];
      const counts = rackStatus?.counts || {};
      rackMeta.textContent = rackStatus
        ? "Fecha: " + (rackStatus.reportDate || "-") + " " + (rackStatus.reportTime || "") + " / Guardado: " + (rackStatus.uploadedAt ? new Date(rackStatus.uploadedAt).toLocaleString() : "-")
        : "Sin rack guardado.";
      summary.innerHTML =
        renderKpi("Total", counts.total || rooms.length || 0) +
        renderKpi("Ocupadas", counts.occupied?.total || 0) +
        renderKpi("VL limpias", counts.availableClean?.total || 0) +
        renderKpi("VS sucias", counts.availableDirty?.total || 0);
      roomGrid.innerHTML = rooms.length
        ? rooms.map(renderRoom).join("")
        : '<div class="muted">No hay rack guardado para actualizar.</div>';
    }

    function renderKpi(label, value) {
      return '<div class="kpi"><span class="muted">' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
    }

    function renderRoom(room) {
      const selected = String(room.room) === selectedRoom ? " selected" : "";
      return '<button class="room ' + roomClass(room.status) + selected + '" onclick="selectRoom(\\'' + escapeHtml(room.room) + '\\', \\'' + escapeHtml(room.status) + '\\')">' +
        '<strong>' + escapeHtml(room.room) + '</strong>' +
        '<span>' + escapeHtml(room.type || "-") + '</span>' +
        '<span>' + escapeHtml(room.status || "-") + ' - ' + escapeHtml(room.statusLabel || statusLabels[room.status] || "") + '</span>' +
      '</button>';
    }

    function selectRoom(room, status) {
      selectedRoom = String(room || "");
      roomInput.value = selectedRoom;
      statusInput.value = status || "OC";
      renderRack();
    }

    function clearSelection() {
      selectedRoom = "";
      roomInput.value = "";
      statusInput.value = "OC";
      renderRack();
      setStatus("Seleccion limpia.");
    }

    async function saveRoomStatus() {
      const room = roomInput.value.trim();
      const status = statusInput.value;

      if (!room) {
        setStatus("Escribe o selecciona una habitacion.", true);
        return;
      }

      setStatus("Guardando " + room + " como " + status + "...");
      const response = await fetch("/api/rack-emergencia/room-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          room,
          status
        })
      });
      const data = await response.json();

      if (!data.ok) {
        setStatus(data.error || "No se pudo actualizar la habitacion.", true);
        return;
      }

      rackStatus = data.rackStatus;
      selectedRoom = room;
      renderRack();
      setStatus("Habitacion " + room + " actualizada a " + status + ".");
    }

    loadRack();
  </script>
</body>
</html>`;
}

module.exports = {
  rackEmergencyPageHtml
};
