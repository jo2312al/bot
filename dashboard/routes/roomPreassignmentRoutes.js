async function handleRoomPreassignmentRoute(req, res, url, deps) {
  const {
    deleteRoomPreassignment,
    readBody,
    saveRoomPreassignment,
    sendJson
  } = deps;

  if (
    req.method === "POST"
    &&
    url.pathname === "/api/room-preassignments"
  ) {
    try {
      const body =
        await readBody(req);

      sendJson(res, 200, {
        ok:
          true,
        assignment:
          saveRoomPreassignment(body)
      });
    } catch (error) {
      sendJson(res, 400, {
        ok:
          false,
        error:
          error.message || "No se pudo guardar la preasignacion"
      });
    }

    return true;
  }

  if (
    req.method === "POST"
    &&
    url.pathname === "/api/room-preassignments/delete"
  ) {
    try {
      const body =
        await readBody(req);

      deleteRoomPreassignment(body.id);

      sendJson(res, 200, {
        ok:
          true
      });
    } catch (error) {
      sendJson(res, 400, {
        ok:
          false,
        error:
          error.message || "No se pudo borrar la preasignacion"
      });
    }

    return true;
  }

  return false;
}

module.exports = {
  handleRoomPreassignmentRoute
};
