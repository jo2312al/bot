async function handleRoomBlockRoute(req, res, url, deps) {
  const {
    readBody,
    readRoomBlocks,
    saveRoomBlock,
    sendJson
  } = deps;

  if (
    req.method === "GET"
    &&
    url.pathname === "/api/room-blocks"
  ) {
    try {
      sendJson(res, 200, {
        ok:
          true,
        blocks:
          readRoomBlocks()
      });
    } catch (error) {
      sendJson(res, 500, {
        ok:
          false,
        error:
          error.message || "No se pudieron cargar bloqueos"
      });
    }

    return true;
  }

  if (
    req.method === "POST"
    &&
    url.pathname === "/api/room-blocks"
  ) {
    try {
      const body =
        await readBody(req);

      sendJson(res, 200, {
        ok:
          true,
        block:
          saveRoomBlock(body)
      });
    } catch (error) {
      sendJson(res, 400, {
        ok:
          false,
        error:
          error.message || "No se pudo guardar el bloqueo"
      });
    }

    return true;
  }

  return false;
}

module.exports = {
  handleRoomBlockRoute
};
