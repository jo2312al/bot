const {
  normalizeRoomType
} = require("./roomInventoryService");

const AUTO_RATE_VALUES =
  new Set([
    "",
    "$600",
    "600",
    "$650",
    "650",
    "$700",
    "700",
    "$750",
    "750",
    "$800",
    "800",
    "$850",
    "850",
    "$900",
    "900",
    "$1,000",
    "$1000",
    "1,000",
    "1000"
  ]);

function normalizeRateText(value) {
  return String(value || "")
    .trim();
}

function isAutoRateValue(value) {
  return AUTO_RATE_VALUES.has(
    normalizeRateText(value)
  );
}

function moneyText(amount) {
  return `$${Number(amount || 0).toLocaleString("en-US")}`;
}

function getRateBase(value) {
  const text =
    normalizeRateText(value)
      .replace(/,/g, "");

  if (text === "$600" || text === "600") {
    return 600;
  }

  if (text === "$650" || text === "650") {
    return 650;
  }

  if (text === "$750" || text === "750" || text === "$850" || text === "850") {
    return 650;
  }

  return null;
}

function getAdultsPerRoom(adults, rooms) {
  const adultCount =
    Math.max(
      Number(adults || 0),
      0
    );
  const roomCount =
    Math.max(
      Number(rooms || 1),
      1
    );

  return Math.ceil(adultCount / roomCount);
}

function getRoomPricingRule(roomType) {
  const type =
    normalizeRoomType(roomType);

  if (type === "King") {
    return {
      type,
      maxAdultsPerRoom:
        2,
      rate:
        "$700"
    };
  }

  if (
    type === "Suite King"
    ||
    type === "Doble Suite"
  ) {
    return {
      type,
      maxAdultsPerRoom:
        4,
      rate:
        "$800"
    };
  }

  if (type === "Doble") {
    return {
      type,
      maxAdultsPerRoom:
        4,
      rateByAdultsPerRoom: {
        0:
          "$700",
        1:
          "$700",
        2:
          "$700",
        3:
          "$800",
        4:
          "$900"
      }
    };
  }

  return null;
}

function calculateAutomaticRate({
  tipo,
  adultos,
  habitaciones,
  tarifa
} = {}) {
  const rule =
    getRoomPricingRule(tipo);

  if (!rule) {
    return "";
  }

  const adultsPerRoom =
    getAdultsPerRoom(
      adultos,
      habitaciones
    );
  const selectedBase =
    getRateBase(tarifa);

  if (rule.rate) {
    return selectedBase
      ? moneyText(selectedBase)
      : rule.rate;
  }

  const extraAdults =
    Math.max(
      Math.min(adultsPerRoom, rule.maxAdultsPerRoom) - 2,
      0
    );
  const baseRate =
    selectedBase || 700;

  return moneyText(baseRate + (extraAdults * 100));
}

function validateReservationOccupancy({
  tipo,
  adultos,
  habitaciones
} = {}) {
  const rule =
    getRoomPricingRule(tipo);

  if (!rule) {
    return;
  }

  const adultsPerRoom =
    getAdultsPerRoom(
      adultos,
      habitaciones
    );

  if (adultsPerRoom > rule.maxAdultsPerRoom) {
    throw new Error(
      `${rule.type} permite maximo ${rule.maxAdultsPerRoom} adulto(s) por habitacion. Los niños no cuentan para extra.`
    );
  }
}

function applyReservationPricing(input = {}) {
  const output = {
    ...input
  };

  validateReservationOccupancy(output);

  if (isAutoRateValue(output.tarifa)) {
    const automaticRate =
      calculateAutomaticRate(output);

    if (automaticRate) {
      output.tarifa =
        automaticRate;
    }
  }

  return output;
}

module.exports = {
  applyReservationPricing,
  calculateAutomaticRate,
  getAdultsPerRoom,
  isAutoRateValue,
  validateReservationOccupancy
};
