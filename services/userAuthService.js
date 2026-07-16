const crypto = require("crypto");

const PASSWORD_SCHEME = "scrypt-v1";
const SESSION_COOKIE = "hotel_session";
const SESSION_IDLE_MINUTES = 8 * 60;
const SESSION_ABSOLUTE_HOURS = 24;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function safeEqualBuffers(left, right) {
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function hashPassword(password) {
  const text = String(password || "");
  if (text.length < 12) throw new Error("La contrasena debe tener al menos 12 caracteres.");
  if (text.length > 200) throw new Error("La contrasena es demasiado larga.");

  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(text, salt, 64);
  return [PASSWORD_SCHEME, salt.toString("base64"), derived.toString("base64")].join("$");
}

function verifyPassword(password, encoded) {
  const [scheme, saltText, hashText] = String(encoded || "").split("$");
  if (scheme !== PASSWORD_SCHEME || !saltText || !hashText) return false;

  try {
    const salt = Buffer.from(saltText, "base64");
    const expected = Buffer.from(hashText, "base64");
    const actual = crypto.scryptSync(String(password || ""), salt, expected.length);
    return safeEqualBuffers(actual, expected);
  } catch (error) {
    return false;
  }
}

function parseCookies(header) {
  return String(header || "")
    .split(";")
    .map(item => item.trim())
    .filter(Boolean)
    .reduce((cookies, item) => {
      const separator = item.indexOf("=");
      if (separator < 1) return cookies;
      const key = item.slice(0, separator).trim();
      const value = item.slice(separator + 1).trim();
      try {
        cookies[key] = decodeURIComponent(value);
      } catch (error) {
        cookies[key] = value;
      }
      return cookies;
    }, {});
}

function addTime(sqlDateTime, milliseconds) {
  const date = new Date(String(sqlDateTime).replace(" ", "T") + "Z");
  date.setTime(date.getTime() + milliseconds);
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function getRequestIp(req) {
  return String(req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress || "")
    .split(",")[0]
    .trim()
    .slice(0, 64);
}

function createUserAuthService(mysql, options = {}) {
  const propertyKey = String(options.propertyKey || "villa-margaritas").trim();

  function requireDatabase() {
    if (!mysql.ensureSchema()) throw new Error("Activa MySQL para usar usuarios y sesiones.");
  }

  function countUsers() {
    requireDatabase();
    const rows = mysql.queryJson(`
      SELECT JSON_OBJECT('count', COUNT(*))
      FROM app_users WHERE property_key = ${mysql.quote(propertyKey)};
    `);
    return Number(rows[0]?.count || 0);
  }

  function createUser({ username, displayName, password, roleCode, createdByUserId = null }) {
    requireDatabase();
    const login = normalizeUsername(username);
    const name = String(displayName || "").trim();
    const role = String(roleCode || "viewer").trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,80}$/.test(login)) throw new Error("El usuario debe tener entre 3 y 80 caracteres validos.");
    if (!name) throw new Error("El nombre visible es requerido.");

    const roleRows = mysql.queryJson(`
      SELECT JSON_OBJECT('id', id) FROM app_roles
      WHERE code = ${mysql.quote(role)} AND active = 1 LIMIT 1;
    `);
    if (!roleRows[0]?.id) throw new Error("Rol no reconocido.");

    mysql.runSql(`
      START TRANSACTION;
      INSERT INTO app_users (
        property_key, username, display_name, password_hash, status,
        password_changed_at, created_by_user_id
      ) VALUES (
        ${mysql.quote(propertyKey)}, ${mysql.quote(login)}, ${mysql.quote(name)},
        ${mysql.quote(hashPassword(password))}, 'active', ${mysql.quote(mysql.mexicoNowSql())},
        ${createdByUserId ? Number(createdByUserId) : "NULL"}
      );

      INSERT INTO app_user_roles (user_id, role_id, assigned_by_user_id)
      SELECT user.id, role.id, ${createdByUserId ? Number(createdByUserId) : "NULL"}
      FROM app_users user JOIN app_roles role ON role.code = ${mysql.quote(role)}
      WHERE user.property_key = ${mysql.quote(propertyKey)} AND user.username = ${mysql.quote(login)};
      COMMIT;
    `);
    return getUserByUsername(login);
  }

  function getUserByUsername(username) {
    requireDatabase();
    const login = normalizeUsername(username);
    const rows = mysql.queryJson(`
      SELECT JSON_OBJECT(
        'id', user.id, 'propertyKey', user.property_key, 'username', user.username,
        'displayName', user.display_name, 'passwordHash', user.password_hash,
        'status', user.status,
        'lockedUntil', IFNULL(DATE_FORMAT(user.locked_until, '%Y-%m-%d %H:%i:%s'), ''),
        'roles', COALESCE((
          SELECT JSON_ARRAYAGG(role.code)
          FROM app_user_roles user_role JOIN app_roles role ON role.id = user_role.role_id
          WHERE user_role.user_id = user.id AND role.active = 1
        ), JSON_ARRAY()),
        'permissions', COALESCE((
          SELECT JSON_ARRAYAGG(permission.code)
          FROM app_user_roles user_role
          JOIN app_role_permissions role_permission ON role_permission.role_id = user_role.role_id
          JOIN app_permissions permission ON permission.id = role_permission.permission_id
          WHERE user_role.user_id = user.id
        ), JSON_ARRAY())
      )
      FROM app_users user
      WHERE user.property_key = ${mysql.quote(propertyKey)}
        AND user.username = ${mysql.quote(login)} LIMIT 1;
    `);
    return rows[0] || null;
  }

  function listUsers() {
    requireDatabase();
    return mysql.queryJson(`
      SELECT JSON_OBJECT(
        'id', user.id, 'username', user.username, 'displayName', user.display_name,
        'status', user.status,
        'lastLoginAt', IFNULL(DATE_FORMAT(user.last_login_at, '%Y-%m-%dT%H:%i:%s'), ''),
        'createdAt', DATE_FORMAT(user.created_at, '%Y-%m-%dT%H:%i:%s'),
        'roles', COALESCE((SELECT JSON_ARRAYAGG(role.code) FROM app_user_roles ur
          JOIN app_roles role ON role.id = ur.role_id WHERE ur.user_id = user.id), JSON_ARRAY())
      )
      FROM app_users user WHERE user.property_key = ${mysql.quote(propertyKey)}
      ORDER BY user.display_name, user.username;
    `);
  }

  function updateUser({ userId, status, roleCode, displayName }) {
    requireDatabase();
    const id = Number(userId);
    if (!id) throw new Error("Usuario invalido.");
    const allowedStatuses = ["active", "locked", "disabled"];
    if (status && !allowedStatuses.includes(status)) throw new Error("Estado de usuario invalido.");
    const assignments = [];
    if (status) assignments.push(`status = ${mysql.quote(status)}`);
    if (displayName !== undefined) {
      const name = String(displayName || "").trim();
      if (!name) throw new Error("El nombre visible es requerido.");
      assignments.push(`display_name = ${mysql.quote(name)}`);
    }
    if (assignments.length) mysql.runSql(`UPDATE app_users SET ${assignments.join(", ")} WHERE id = ${id} AND property_key = ${mysql.quote(propertyKey)};`);
    if (roleCode) {
      const role = String(roleCode).trim().toLowerCase();
      mysql.runSql(`
        START TRANSACTION;
        DELETE FROM app_user_roles WHERE user_id = ${id};
        INSERT INTO app_user_roles (user_id, role_id)
        SELECT ${id}, id FROM app_roles WHERE code = ${mysql.quote(role)} AND active = 1;
        COMMIT;
      `);
    }
    return listUsers().find(user => Number(user.id) === id) || null;
  }

  function resetPassword({ userId, password }) {
    requireDatabase();
    const id = Number(userId);
    if (!id) throw new Error("Usuario invalido.");
    mysql.runSql(`
      START TRANSACTION;
      UPDATE app_users SET password_hash = ${mysql.quote(hashPassword(password))},
        password_changed_at = ${mysql.quote(mysql.mexicoNowSql())}, status = 'active',
        failed_login_count = 0, locked_until = NULL
      WHERE id = ${id} AND property_key = ${mysql.quote(propertyKey)};
      UPDATE app_sessions SET revoked_at = ${mysql.quote(mysql.mexicoNowSql())}
      WHERE user_id = ${id} AND revoked_at IS NULL;
      COMMIT;
    `);
    return true;
  }

  function recordFailedLogin(user) {
    const now = mysql.mexicoNowSql();
    mysql.runSql(`
      UPDATE app_users
      SET failed_login_count = failed_login_count + 1,
          locked_until = CASE WHEN failed_login_count + 1 >= ${MAX_FAILED_LOGINS}
            THEN ${mysql.quote(addTime(now, LOCK_MINUTES * 60000))} ELSE locked_until END,
          status = CASE WHEN failed_login_count + 1 >= ${MAX_FAILED_LOGINS} THEN 'locked' ELSE status END
      WHERE id = ${Number(user.id)};
    `);
  }

  function authenticate({ username, password }) {
    const user = getUserByUsername(username);
    const now = mysql.mexicoNowSql();
    if (!user || user.status === "disabled" || user.status === "pending") return null;
    if (user.status === "locked" && user.lockedUntil && user.lockedUntil > now) return null;
    if (!verifyPassword(password, user.passwordHash)) {
      recordFailedLogin(user);
      return null;
    }

    mysql.runSql(`
      UPDATE app_users SET status = 'active', failed_login_count = 0,
        locked_until = NULL, last_login_at = ${mysql.quote(now)}
      WHERE id = ${Number(user.id)};
    `);
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  function createSession(user, req) {
    requireDatabase();
    const token = crypto.randomBytes(32).toString("base64url");
    const csrfToken = crypto.randomBytes(24).toString("base64url");
    const now = mysql.mexicoNowSql();
    mysql.runSql(`
      INSERT INTO app_sessions (
        user_id, token_hash, csrf_token_hash, ip_address, user_agent,
        last_seen_at, expires_at, absolute_expires_at
      ) VALUES (
        ${Number(user.id)}, ${mysql.quote(sha256(token))}, ${mysql.quote(sha256(csrfToken))},
        ${mysql.quote(getRequestIp(req))}, ${mysql.quote(String(req?.headers?.["user-agent"] || "").slice(0, 500))},
        ${mysql.quote(now)}, ${mysql.quote(addTime(now, SESSION_IDLE_MINUTES * 60000))},
        ${mysql.quote(addTime(now, SESSION_ABSOLUTE_HOURS * 3600000))}
      );
    `);
    return { token, csrfToken };
  }

  function getSession(req) {
    requireDatabase();
    const token = parseCookies(req?.headers?.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const now = mysql.mexicoNowSql();
    const rows = mysql.queryJson(`
      SELECT JSON_OBJECT(
        'sessionId', session.id, 'csrfTokenHash', session.csrf_token_hash,
        'id', user.id, 'propertyKey', user.property_key, 'username', user.username,
        'displayName', user.display_name,
        'roles', COALESCE((SELECT JSON_ARRAYAGG(role.code) FROM app_user_roles ur
          JOIN app_roles role ON role.id = ur.role_id WHERE ur.user_id = user.id AND role.active = 1), JSON_ARRAY()),
        'permissions', COALESCE((SELECT JSON_ARRAYAGG(permission.code) FROM app_user_roles ur
          JOIN app_role_permissions rp ON rp.role_id = ur.role_id
          JOIN app_permissions permission ON permission.id = rp.permission_id
          WHERE ur.user_id = user.id), JSON_ARRAY())
      )
      FROM app_sessions session JOIN app_users user ON user.id = session.user_id
      WHERE session.token_hash = ${mysql.quote(sha256(token))}
        AND session.revoked_at IS NULL AND session.expires_at > ${mysql.quote(now)}
        AND session.absolute_expires_at > ${mysql.quote(now)} AND user.status = 'active'
      LIMIT 1;
    `);
    const session = rows[0] || null;
    if (session) {
      mysql.runSql(`UPDATE app_sessions SET last_seen_at = ${mysql.quote(now)},
        expires_at = LEAST(${mysql.quote(addTime(now, SESSION_IDLE_MINUTES * 60000))}, absolute_expires_at)
        WHERE id = ${Number(session.sessionId)};`);
    }
    return session;
  }

  function validateCsrf(session, token) {
    return Boolean(session?.csrfTokenHash && token && safeEqualBuffers(
      Buffer.from(session.csrfTokenHash), Buffer.from(sha256(token))
    ));
  }

  function revokeSession(sessionId) {
    requireDatabase();
    mysql.runSql(`UPDATE app_sessions SET revoked_at = ${mysql.quote(mysql.mexicoNowSql())}
      WHERE id = ${Number(sessionId)};`);
  }

  function hasPermission(user, permission) {
    return Array.isArray(user?.permissions) && user.permissions.includes(permission);
  }

  return {
    authenticate, countUsers, createSession, createUser, getSession,
    getUserByUsername, hasPermission, listUsers, resetPassword, revokeSession,
    updateUser, validateCsrf
  };
}

module.exports = {
  SESSION_COOKIE, createUserAuthService, hashPassword, normalizeUsername,
  parseCookies, verifyPassword
};
