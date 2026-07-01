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

const MANANERA_VALUES =
  new Set([
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

function normalizeRoomType(value) {
  const clean =
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  if (clean.includes("suite") && clean.includes("king")) {
    return "Suite King";
  }

  if (clean.includes("suite")) {
    return "Doble Suite";
  }

  if (clean.includes("king")) {
    return "King";
  }

  if (
    clean.includes("doble")
    ||
    clean.includes("matrimonial")
    ||
    clean.includes("2 camas")
  ) {
    return "Doble";
  }

  return String(value || "").trim();
}

function isMananeraRate(value) {
  return MANANERA_VALUES.has(
    normalizeRateText(value)
  );
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
          "$800"
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

  if (
    rule.type === "Doble"
    &&
    adultsPerRoom >= 3
  ) {
    return "$800";
  }

  const baseRate =
    selectedBase || 700;

  return moneyText(baseRate);
}

function calculateExtraAdults({
  tipo,
  adultos,
  habitaciones
} = {}) {
  const rule =
    getRoomPricingRule(tipo);

  if (!rule || rule.type !== "Doble") {
    return {
      extraAdults:
        0,
      extraAmount:
        0
    };
  }

  return {
    extraAdults:
      0,
    extraAmount:
      0
  };
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

  const extra =
    calculateExtraAdults(output);
  output.extraAdults =
    extra.extraAdults;
  output.extraAmount =
    extra.extraAmount;
  output.mananera =
    isMananeraRate(output.tarifa);

  if (isAutoRateValue(output.tarifa)) {
    if (!output.mananera) {
      const selectedBase =
        getRateBase(output.tarifa);

      if (selectedBase) {
        output.tarifa =
          moneyText(selectedBase);
      } else {
        const automaticRate =
          calculateAutomaticRate(output);

        if (automaticRate) {
          output.tarifa =
            automaticRate;
        }
      }
    }
  }

  return output;
}

module.exports = {
  applyReservationPricing,
  calculateExtraAdults,
  calculateAutomaticRate,
  getAdultsPerRoom,
  isMananeraRate,
  isAutoRateValue,
  validateReservationOccupancy
};
