const crypto = require("crypto");

function createConnectionCrypto(keyText) {
  const key = crypto.createHash("sha256").update(String(keyText || "")).digest();

  if (!String(keyText || "").trim()) {
    throw new Error("Se requiere una llave de cifrado para conexiones de hotel.");
  }

  function encrypt(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
  }

  function decrypt(ciphertext) {
    const payload = Buffer.from(String(ciphertext || ""), "base64");
    if (payload.length < 29) throw new Error("La conexión cifrada no es válida.");
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
  }

  return {
    decrypt,
    encrypt
  };
}

module.exports = {
  createConnectionCrypto
};
