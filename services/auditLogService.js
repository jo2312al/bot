function truncate(value, length) {
  return String(value || "").slice(0, length);
}

function safeJson(value) {
  if (value === undefined || value === null) return "NULL";
  return JSON.stringify(value, (key, item) => {
    if (/password|token|secret|authorization|cookie/i.test(key)) return "[REDACTED]";
    return item;
  });
}

function createAuditLogService(mysql, options = {}) {
  const defaultPropertyKey = String(options.propertyKey || "villa-margaritas").trim();

  function record(input = {}) {
    if (!mysql.isAvailable()) return false;
    try {
      mysql.runSql(`
        INSERT INTO audit_log (
          property_key, user_id, operational_day_id, permission_code,
          action_code, entity_type, entity_id, outcome, reason,
          before_json, after_json, ip_address, user_agent, occurred_at
        ) VALUES (
          ${mysql.quote(input.propertyKey || defaultPropertyKey)},
          ${input.userId ? Number(input.userId) : "NULL"},
          ${input.operationalDayId ? Number(input.operationalDayId) : "NULL"},
          ${mysql.quote(truncate(input.permissionCode, 100))},
          ${mysql.quote(truncate(input.actionCode || "unknown", 100))},
          ${mysql.quote(truncate(input.entityType, 80))},
          ${mysql.quote(truncate(input.entityId, 120))},
          ${mysql.quote(["success", "rejected", "error"].includes(input.outcome) ? input.outcome : "error")},
          ${mysql.quote(truncate(input.reason, 500))},
          ${input.before === undefined || input.before === null ? "NULL" : mysql.quote(safeJson(input.before))},
          ${input.after === undefined || input.after === null ? "NULL" : mysql.quote(safeJson(input.after))},
          ${mysql.quote(truncate(input.ipAddress, 64))},
          ${mysql.quote(truncate(input.userAgent, 500))},
          ${mysql.quote(mysql.mexicoNowSql())}
        );
      `);
      return true;
    } catch (error) {
      console.error(`[audit] ${error.message}`);
      return false;
    }
  }

  return { record };
}

module.exports = { createAuditLogService };
