const crypto =
  require("crypto");

function parseBasicAuth(header) {
  const match =
    String(header || "").match(/^Basic\s+(.+)$/i);

  if (!match) {
    return null;
  }

  const decoded =
    Buffer.from(match[1], "base64").toString("utf8");
  const separator =
    decoded.indexOf(":");

  if (separator === -1) {
    return null;
  }

  return {
    username:
      decoded.slice(0, separator),
    password:
      decoded.slice(separator + 1)
  };
}

function safeEqual(left, right) {
  const leftBuffer =
    Buffer.from(String(left || ""));
  const rightBuffer =
    Buffer.from(String(right || ""));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createBasicAuth({
  realm,
  username,
  password
}) {
  const enabled =
    Boolean(username && password);

  function unavailable(res) {
    res.writeHead(503, {
      "Content-Type":
        "text/plain; charset=utf-8",
      "Cache-Control":
        "no-store"
    });
    res.end("Acceso no configurado.");
  }

  function challenge(res) {
    res.writeHead(401, {
      "WWW-Authenticate":
        `Basic realm="${realm || "Acceso restringido"}", charset="UTF-8"`,
      "Content-Type":
        "text/plain; charset=utf-8",
      "Cache-Control":
        "no-store"
    });
    res.end("Usuario y contrasena requeridos.");
  }

  function authenticate(req, res) {
    if (!enabled) {
      unavailable(res);
      return false;
    }

    const credentials =
      parseBasicAuth(req.headers.authorization);

    if (
      credentials
      &&
      safeEqual(credentials.username, username)
      &&
      safeEqual(credentials.password, password)
    ) {
      return true;
    }

    challenge(res);
    return false;
  }

  return {
    authenticate
  };
}

module.exports = {
  createBasicAuth
};
