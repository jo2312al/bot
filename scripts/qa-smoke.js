const http = require("http");
const { spawn } = require("child_process");

const PORT =
  Number(process.env.QA_DASHBOARD_PORT || 4317);
const BASE_URL =
  `http://127.0.0.1:${PORT}`;
const START_TIMEOUT_MS =
  15000;

let serverProcess =
  null;

function fail(message) {
  throw new Error(message);
}

function request(pathname) {
  return new Promise((resolve, reject) => {
    const req =
      http.get(`${BASE_URL}${pathname}`, res => {
        const chunks =
          [];

        res.on("data", chunk =>
          chunks.push(chunk)
        );
        res.on("end", () =>
          resolve({
            status:
              res.statusCode,
            headers:
              res.headers,
            body:
              Buffer.concat(chunks).toString("utf8")
          })
        );
      });

    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error(`Timeout al consultar ${pathname}`));
    });
  });
}

async function waitForDashboard() {
  const startedAt =
    Date.now();
  let lastError =
    null;

  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    try {
      const response =
        await request("/");
      if (response.status === 200) {
        return;
      }
      lastError =
        new Error(`GET / respondio ${response.status}`);
    } catch (error) {
      lastError =
        error;
    }

    await new Promise(resolve =>
      setTimeout(resolve, 350)
    );
  }

  throw new Error(
    `El dashboard no inicio en ${BASE_URL}: ${lastError?.message || "sin respuesta"}`
  );
}

function assertStatus(response, expected, label) {
  if (response.status !== expected) {
    fail(`${label}: esperado HTTP ${expected}, recibido ${response.status}. Respuesta: ${response.body.slice(0, 300)}`);
  }
}

function parseJson(response, label) {
  try {
    return JSON.parse(response.body);
  } catch (error) {
    fail(`${label}: respuesta no es JSON valido. ${error.message}`);
  }
}

function assertIncludes(body, text, label) {
  if (!body.includes(text)) {
    fail(`${label}: no se encontro "${text}"`);
  }
}

function assertNotIncludes(body, text, label) {
  if (body.includes(text)) {
    fail(`${label}: todavia aparece "${text}"`);
  }
}

async function runChecks() {
  const home =
    await request("/");
  assertStatus(home, 200, "Home dashboard");
  assertIncludes(home.body, "header-logo", "Home dashboard");
  assertIncludes(home.body, "header-actions", "Home dashboard");
  assertIncludes(home.body, "/media/logo-villa-margaritas.png", "Home dashboard");
  assertIncludes(home.body, "Cargar tarifas", "Home dashboard");
  assertIncludes(home.body, "Cierre del dia", "Home dashboard");
  assertNotIncludes(home.body, "sidebar-brand", "Home dashboard");

  const css =
    await request("/public/dashboard.css");
  assertStatus(css, 200, "CSS dashboard");
  assertIncludes(css.body, ".header-logo", "CSS dashboard");
  assertIncludes(css.body, ".header-actions", "CSS dashboard");

  const logo =
    await request("/media/logo-villa-margaritas.png");
  assertStatus(logo, 200, "Logo dashboard");
  if (!String(logo.headers["content-type"] || "").includes("image/png")) {
    fail(`Logo dashboard: content-type inesperado ${logo.headers["content-type"] || "vacio"}`);
  }

  const summary =
    await request("/api/summary");
  assertStatus(summary, 200, "API summary");
  const summaryJson =
    parseJson(summary, "API summary");
  if (!summaryJson || typeof summaryJson !== "object") {
    fail("API summary: no devolvio un objeto JSON");
  }

  const reports =
    await request("/api/reports?month=2026-07");
  assertStatus(reports, 200, "API reports");
  const reportsJson =
    parseJson(reports, "API reports");
  if (reportsJson.ok !== true || !reportsJson.reports) {
    fail("API reports: falta ok=true o reports");
  }

  const audit =
    await request("/api/reports/audit?date=2026-07-10");
  assertStatus(audit, 200, "API audit reports");
  const auditJson =
    parseJson(audit, "API audit reports");
  if (
    auditJson.ok !== true
    ||
    !Array.isArray(auditJson.reports?.rents)
    ||
    !Array.isArray(auditJson.reports?.balances)
    ||
    !Array.isArray(auditJson.reports?.movements)
  ) {
    fail("API audit reports: faltan listas rents/balances/movements");
  }

  const missing =
    await request("/api/not-found-for-qa");
  assertStatus(missing, 404, "API 404 controlada");
}

async function main() {
  serverProcess =
    spawn(
      process.execPath,
      ["dashboard.js"],
      {
        cwd:
          process.cwd(),
        env:
          {
            ...process.env,
            DASHBOARD_PORT:
              String(PORT),
            USE_MYSQL:
              process.env.USE_MYSQL || "0"
          },
        stdio:
          ["ignore", "pipe", "pipe"]
      }
    );

  let output =
    "";
  serverProcess.stdout.on("data", chunk => {
    output += chunk.toString();
  });
  serverProcess.stderr.on("data", chunk => {
    output += chunk.toString();
  });

  serverProcess.on("exit", code => {
    if (code !== null && code !== 0) {
      console.error(output);
    }
  });

  await waitForDashboard();
  await runChecks();
  console.log("QA smoke OK: dashboard, assets y endpoints principales responden.");
}

main()
  .catch(error => {
    console.error(`QA smoke FAIL: ${error.message}`);
    process.exitCode =
      1;
  })
  .finally(() => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill();
    }
  });
