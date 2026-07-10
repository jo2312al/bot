const {
  rackEmergencyPageHtml
} = require("../rackEmergencyPage");
const {
  createBasicAuth
} = require("../../services/basicAuthService");

function createRackEmergencyRouteHandler({
  readBody,
  readLatestRackStatus,
  sendJson,
  updateRackRoomStatus,
  username,
  password
}) {
  const auth =
    createBasicAuth({
      realm: "Rack Emergencia",
      username,
      password
    });

  return async function handleRackEmergencyRoute(req, res, url) {
    if (
      req.method === "GET"
      &&
      url.pathname === "/rack-emergencia"
    ) {
      if (!auth.authenticate(req, res)) {
        return true;
      }

      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      });
      res.end(rackEmergencyPageHtml());
      return true;
    }

    if (
      req.method === "GET"
      &&
      url.pathname === "/api/rack-emergencia/status"
    ) {
      if (!auth.authenticate(req, res)) {
        return true;
      }

      try {
        sendJson(res, 200, {
          ok: true,
          rackStatus:
            readLatestRackStatus()
        });
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          error:
            error.message || "No se pudo leer el rack"
        });
      }

      return true;
    }

    if (
      req.method === "POST"
      &&
      url.pathname === "/api/rack-emergencia/room-status"
    ) {
      if (!auth.authenticate(req, res)) {
        return true;
      }

      try {
        const body =
          await readBody(req);

        const rackStatus =
          updateRackRoomStatus({
            room:
              body.room,
            status:
              body.status || "OC"
          });

        sendJson(res, 200, {
          ok:
            true,
          rackStatus
        });
      } catch (error) {
        sendJson(res, 400, {
          ok:
            false,
          error:
            error.message || "No se pudo actualizar la habitacion"
        });
      }

      return true;
    }

    return false;
  };
}

module.exports = {
  createRackEmergencyRouteHandler
};
