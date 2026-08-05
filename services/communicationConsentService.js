const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "../data/communication-consents.jsonl");
const NOTICE_VERSION = "privacy-reservations-2026-08-02";
const TERMS_VERSION = "reservation-terms-2026-08-02";

function clean(value, max = 160) {
  return String(value || "").trim().slice(0, max);
}

function phoneEvidence(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  const secret = String(process.env.CONSENT_HASH_SECRET || process.env.RESERVATION_PORTAL_SIGNING_SECRET || "").trim();
  return {
    phoneLast4: digits.slice(-4),
    phoneHash: secret ? crypto.createHmac("sha256", secret).update(digits).digest("hex") : ""
  };
}

function recordCommunicationConsent(input = {}) {
  const record = {
    id: crypto.randomUUID(),
    recordedAt: new Date().toISOString(),
    folio: clean(input.folio, 80).toUpperCase(),
    ...phoneEvidence(input.phone),
    reservationMessages: input.reservationMessages === true,
    marketingMessages: input.marketingMessages === true,
    captureMethod: clean(input.captureMethod || "dashboard-verbal", 60),
    actor: clean(input.actor || "dashboard-user", 120),
    privacyNoticeVersion: clean(input.privacyNoticeVersion || NOTICE_VERSION, 80),
    termsVersion: clean(input.termsVersion || TERMS_VERSION, 80),
    ipAddress: clean(input.ipAddress, 64),
    userAgent: clean(input.userAgent, 300)
  };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.appendFileSync(FILE, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
  return record;
}

function hasMarketingConsent(phone) {
  const evidence = phoneEvidence(phone);
  if (!evidence.phoneHash || !fs.existsSync(FILE)) return false;
  const rows = fs.readFileSync(FILE, "utf8").trim().split(/\r?\n/).filter(Boolean);
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    try {
      const record = JSON.parse(rows[index]);
      if (record.phoneHash === evidence.phoneHash) return record.marketingMessages === true;
    } catch {}
  }
  return false;
}

module.exports = {
  NOTICE_VERSION,
  TERMS_VERSION,
  recordCommunicationConsent,
  hasMarketingConsent
};
