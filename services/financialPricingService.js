function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function parseRateAmount(value) {
  const text = String(value ?? "").trim().replace(/,/g, "").replace(/[^\d.-]/g, "");
  const amount = Number(text);
  return Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : 0;
}

function splitIncludedTaxes(total, vatRate = 0.16, lodgingTaxRate = 0.03) {
  const totalCents = Math.round(parseRateAmount(total) * 100);
  if (!totalCents) return { subtotal: 0, vat: 0, lodgingTax: 0, total: 0 };
  const divisor = 1 + Number(vatRate) + Number(lodgingTaxRate);
  const subtotalCents = Math.round(totalCents / divisor);
  const vatCents = Math.round(subtotalCents * Number(vatRate));
  const lodgingCents = totalCents - subtotalCents - vatCents;
  return {
    subtotal: subtotalCents / 100,
    vat: vatCents / 100,
    lodgingTax: lodgingCents / 100,
    total: totalCents / 100
  };
}

function createFinancialPricingService(mysql, options = {}) {
  const propertyKey = String(options.propertyKey || "villa-margaritas");
  function getSettings() {
    const rows = mysql.queryJson(`SELECT JSON_OBJECT('currency', currency, 'vatRate', vat_rate,
      'lodgingTaxRate', lodging_tax_rate, 'pricesIncludeTaxes', prices_include_taxes)
      FROM property_financial_settings WHERE property_key = ${mysql.quote(propertyKey)} LIMIT 1;`);
    return rows[0] || { currency: "MXN", vatRate: 0.16, lodgingTaxRate: 0.03, pricesIncludeTaxes: true };
  }
  function calculate(total) {
    const settings = getSettings();
    const split = splitIncludedTaxes(total, settings.vatRate, settings.lodgingTaxRate);
    return { ...split, currency: settings.currency, vatRate: Number(settings.vatRate), lodgingTaxRate: Number(settings.lodgingTaxRate) };
  }
  function updateSettings(input, userId = null) {
    const currency = String(input.currency || "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("La moneda debe usar un codigo ISO de tres letras.");
    mysql.runSql(`UPDATE property_financial_settings SET currency = ${mysql.quote(currency)},
      updated_by_user_id = ${userId ? Number(userId) : "NULL"} WHERE property_key = ${mysql.quote(propertyKey)};`);
    return getSettings();
  }
  return { calculate, getSettings, updateSettings };
}

module.exports = { createFinancialPricingService, parseRateAmount, roundMoney, splitIncludedTaxes };
