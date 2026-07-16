const {
  SESSION_COOKIE,
  createUserAuthService
} = require("../services/userAuthService");
const {
  createAuditLogService
} = require("../services/auditLogService");

const CSRF_COOKIE = "hotel_csrf";
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/status"
]);

const EXACT_PERMISSIONS = new Map([
  ["GET /api/summary", "reservations.view"],
  ["GET /api/search", "reservations.view"],
  ["GET /api/guest-history", "reservations.view"],
  ["GET /api/reports", "reports.operational"],
  ["GET /api/reports/audit", "reports.financial"],
  ["GET /api/reports/export-csv", "reports.export"],
  ["POST /api/day-rate-charges", "business_day.audit"],
  ["POST /api/day-close", "business_day.close"],
  ["GET /api/checkins/room", "stays.view"],
  ["GET /api/checkins/search", "stays.view"],
  ["POST /api/checkins/movement", "ledger.charge"],
  ["POST /api/checkins/update", "stays.update"],
  ["POST /api/checkins/checkout", "stays.checkout"],
  ["POST /api/reservations/arrival", "stays.checkin"],
  ["POST /api/reservations/manual", "reservations.create"],
  ["POST /api/reservations/update", "reservations.update"],
  ["POST /api/reservations/delete", "reservations.cancel"],
  ["POST /api/cancel", "reservations.cancel"],
  ["POST /api/reservations/note", "reservations.update"],
  ["POST /api/reservations/import-csv", "reservations.create"],
  ["GET /api/reservations/export-csv", "reports.export"],
  ["POST /api/rack/room-status", "rack.update_manual_state"],
  ["POST /api/rack/analyze", "rack.update_manual_state"],
  ["POST /api/rack/analyze-csv", "rack.update_manual_state"],
  ["POST /api/room-blocks", "rack.block"],
  ["POST /api/rooms/events", "rack.block"],
  ["POST /api/close-dates", "reservations.update"],
  ["POST /api/open-date", "reservations.update"],
  ["POST /api/open-dates", "reservations.update"],
  ["POST /api/quotations", "reservations.create"],
  ["POST /api/events", "reservations.create"],
  ["POST /api/events/vouchers", "ledger.payment"]
]);

function loginPage() {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acceso administrativo</title><style>
  :root{font-family:Inter,system-ui,sans-serif;color:#172033;background:#f3f5f8}body{min-height:100vh;display:grid;place-items:center;margin:0}.card{width:min(390px,calc(100% - 32px));background:#fff;border-radius:18px;padding:30px;box-shadow:0 18px 55px #1720331a}.brand{font-family:Georgia,serif;font-size:24px;text-align:center}.muted{color:#687386;text-align:center;margin:8px 0 24px}label{display:block;font-weight:700;font-size:13px;margin:14px 0 6px}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #ccd3dd;border-radius:10px;font-size:16px}button{width:100%;margin-top:20px;padding:12px;border:0;border-radius:10px;background:#244b3b;color:#fff;font-weight:800;font-size:15px;cursor:pointer}button:disabled{opacity:.55}.error{min-height:20px;color:#b42318;text-align:center;margin-top:14px;font-size:14px}</style></head><body><main class="card"><div class="brand">Hotel Villa Margaritas</div><div class="muted">Administración y operación</div><form id="loginForm"><label for="username">Usuario</label><input id="username" autocomplete="username" required><label for="password">Contraseña</label><input id="password" type="password" autocomplete="current-password" required><button id="submitButton">Iniciar sesión</button><div id="error" class="error"></div></form></main><script>
  loginForm.addEventListener('submit',async event=>{event.preventDefault();submitButton.disabled=true;error.textContent='';try{const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:username.value,password:password.value})});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'No se pudo iniciar sesión.');location.href='/';}catch(err){error.textContent=err.message||'Acceso rechazado.';submitButton.disabled=false;}});
  </script></body></html>`;
}

function cookie(name, value, { maxAge, httpOnly = true, secure = false } = {}) {
  return `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax${httpOnly ? "; HttpOnly" : ""}${secure ? "; Secure" : ""}${Number.isFinite(maxAge) ? `; Max-Age=${maxAge}` : ""}`;
}

function requestIsSecure(req) {
  return req?.socket?.encrypted || String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

function requiredPermission(method, pathname) {
  const exact = EXACT_PERMISSIONS.get(`${method} ${pathname}`);
  if (exact) return exact;
  if (pathname.startsWith("/api/room-preassignments")) {
    return method === "GET" ? "stays.view" : "stays.update";
  }
  if (pathname === "/api/quotation-menu") return method === "GET" ? "reservations.view" : "reservations.update";
  return pathname.startsWith("/api/") ? (method === "GET" ? "reservations.view" : "reservations.update") : "";
}

function createDashboardAuth({ mysql, readBody, sendJson }) {
  const auth = createUserAuthService(mysql, {
    propertyKey: process.env.HOTEL_PROPERTY_KEY || "villa-margaritas"
  });
  const audit = createAuditLogService(mysql, {
    propertyKey: process.env.HOTEL_PROPERTY_KEY || "villa-margaritas"
  });
  const mode = ["off", "observe", "enforce"].includes(process.env.APP_AUTH_MODE)
    ? process.env.APP_AUTH_MODE
    : "observe";

  async function handleRoute(req, res, url) {
    if (req.method === "GET" && url.pathname === "/login") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(loginPage());
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/auth/status") {
      sendJson(res, 200, { ok: true, mode, configured: mysql.ensureSchema() && auth.countUsers() > 0 });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      try {
        const user = auth.authenticate(await readBody(req));
        if (!user) {
          sendJson(res, 401, { ok: false, error: "Usuario o contraseña incorrectos." });
          return true;
        }
        const session = auth.createSession(user, req);
        const secure = requestIsSecure(req);
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Set-Cookie": [
            cookie(SESSION_COOKIE, session.token, { maxAge: 86400, secure }),
            cookie(CSRF_COOKIE, session.csrfToken, { maxAge: 86400, httpOnly: false, secure })
          ]
        });
        res.end(JSON.stringify({ ok: true, user }));
      } catch (error) {
        sendJson(res, 503, { ok: false, error: error.message || "Acceso no disponible." });
      }
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      sendJson(res, req.authUser ? 200 : 401, req.authUser
        ? { ok: true, user: req.authUser, mode }
        : { ok: false, error: "Sesión requerida.", mode });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      if (req.authUser?.sessionId) auth.revokeSession(req.authUser.sessionId);
      const secure = requestIsSecure(req);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Set-Cookie": [
          cookie(SESSION_COOKIE, "", { maxAge: 0, secure }),
          cookie(CSRF_COOKIE, "", { maxAge: 0, httpOnly: false, secure })
        ]
      });
      res.end(JSON.stringify({ ok: true }));
      return true;
    }
    return false;
  }

  function attachSession(req) {
    req.authUser = null;
    if (mode === "off" || !mysql.isAvailable()) return;
    try {
      req.authUser = auth.getSession(req);
    } catch (error) {
      req.authError = error;
    }
  }

  function authorize(req, res, url) {
    if (mode === "off" || PUBLIC_PATHS.has(url.pathname) || url.pathname.startsWith("/public/") || url.pathname.startsWith("/media/") || url.pathname.startsWith("/api/rack-emergencia/")) return true;
    if (!req.authUser) {
      if (mode === "observe") return true;
      if (url.pathname === "/") {
        res.writeHead(302, { Location: "/login", "Cache-Control": "no-store" });
        res.end();
      } else {
        sendJson(res, 401, { ok: false, error: "Inicia sesión para continuar." });
      }
      audit.record({
        actionCode: `${req.method} ${url.pathname}`,
        outcome: "rejected",
        reason: "session_required",
        ipAddress: String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0],
        userAgent: req.headers["user-agent"]
      });
      return false;
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const csrf = req.headers["x-csrf-token"];
      if (!auth.validateCsrf(req.authUser, csrf)) {
        sendJson(res, 403, { ok: false, error: "La sesión no pudo validar esta operación. Recarga la página." });
        audit.record({ userId: req.authUser.id, permissionCode: requiredPermission(req.method, url.pathname),
          actionCode: `${req.method} ${url.pathname}`, outcome: "rejected", reason: "csrf_invalid",
          ipAddress: String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0], userAgent: req.headers["user-agent"] });
        return false;
      }
    }
    const permission = requiredPermission(req.method, url.pathname);
    if (permission && !auth.hasPermission(req.authUser, permission)) {
      sendJson(res, 403, { ok: false, error: "No tienes permiso para realizar esta operación.", permission });
      audit.record({ userId: req.authUser.id, permissionCode: permission,
        actionCode: `${req.method} ${url.pathname}`, outcome: "rejected", reason: "permission_denied",
        ipAddress: String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0], userAgent: req.headers["user-agent"] });
      return false;
    }
    return true;
  }

  return { attachSession, authorize, handleRoute, mode, requiredPermission };
}

module.exports = { createDashboardAuth, requiredPermission };
