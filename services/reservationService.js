const {
  generarFolio
} = require("../utils/helpers");

function parseHoraLlegada(horaTexto) {
  const normalized =
    String(horaTexto || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\ba\.?\s*m\.?\b/g, "am")
      .replace(/\bp\.?\s*m\.?\b/g, "pm")
      .replace(/\bhrs?\b|\bhoras?\b/g, "")
      .replace(/\s+/g, " ");

  const match =
    normalized
      .match(/(?:llegada|ingresa|entrada|a las|alas)\D{0,24}(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)
    ||
    normalized
      .match(/\b(\d{1,2})(?::(\d{2}))\s*(am|pm)?\b/)
    ||
    normalized
      .match(/\b(\d{1,2})\s*(am|pm)\b/);

  if (!match) return null;

  let hora =
    parseInt(match[1], 10);

  const periodo =
    match[3]
    ||
    (
      /^(am|pm)$/.test(match[2] || "")
        ? match[2]
        : ""
    );

  const minuteText =
    /^\d+$/.test(match[2] || "")
      ? match[2]
      : "0";

  const minutos =
    Number(minuteText);

  if (minutos > 59 || hora > 23) {
    return null;
  }

  if (
    periodo
    &&
    (
      hora < 1
      ||
      hora > 12
    )
  ) {
    return null;
  }

  if (
    periodo === "pm"
    &&
    hora !== 12
  ) {

    hora += 12;

  }

  if (
    periodo === "am"
    &&
    hora === 12
  ) {

    hora = 0;

  }

  return hora;
}

function normalizarHoraLlegada(horaTexto) {
  const normalized =
    String(horaTexto || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
    .replace(/\ba\.?\s*m\.?\b/g, "am")
    .replace(/\bp\.?\s*m\.?\b/g, "pm")
      .replace(/\bhrs?\b|\bhoras?\b/g, "")
      .replace(/\s+/g, " ");

  const match =
    normalized
      .match(/(?:llegada|ingresa|entrada|a las|alas)\D{0,24}(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)
    ||
    normalized
      .match(/\b(\d{1,2})(?::(\d{2}))\s*(am|pm)?\b/)
    ||
    normalized
      .match(/\b(\d{1,2})\s*(am|pm)\b/);

  if (!match) {
    return normalized;
  }

  const minute =
    /^\d+$/.test(match[2] || "")
      ? `:${match[2]}`
      : "";

  const period =
    match[3]
    ||
    (
      /^(am|pm)$/.test(match[2] || "")
        ? match[2]
        : ""
    );

  return `${match[1]}${minute}${period ? ` ${period}` : ""}`;
}

// ==========================================
// CALCULAR PRECIO
// ==========================================

function calcularPrecio({

  adultos,
  ninos,
  horaTexto,
  noches = 1,
  habitaciones = 1,
  servicioEspecial = null,
  promocion = "no"

}) {

  const tienePromocion =
    promocion
    &&
    promocion !== "no";

  const totalPersonas =
    adultos + ninos;

  const personasAdicionalesPromo =
    tienePromocion
      ? Math.max(
        totalPersonas - 2,
        0
      )
      : 0;

  const adultosPorHabitacion =
    Math.ceil(
      adultos / habitaciones
    );

  const tarifaNoche =
    tienePromocion
      ? habitaciones * 650 + (personasAdicionalesPromo * 100)
      : habitaciones * (
        adultosPorHabitacion <= 2
          ? 700
          : 800
      );

  let precio =
    tarifaNoche * noches;

  let mensajeTarifa =
    "";

  if (
    tienePromocion
  ) {

    mensajeTarifa +=
      `\n🎟️ Tarifa promocional ${promocion.toUpperCase()} ($650 por noche)`;

    if (
      personasAdicionalesPromo > 0
    ) {

      mensajeTarifa +=
        `\n👥 ${personasAdicionalesPromo} persona(s) adicional(es) (+$${personasAdicionalesPromo * 100} por noche)`;

    }

  }

  if (
    servicioEspecial === "Habitacion decorada"
  ) {

    precio += 300;

    mensajeTarifa +=
      "\n🎈 Decoracion romantica (+$300)";

  }

  const hora =
    parseHoraLlegada(horaTexto);

  if (
    hora !== null
    &&
    hora < 13
  ) {

    const tarifaMananera =
      servicioEspecial === "Habitacion decorada"
        ? 600
        : 200;

    precio += tarifaMananera;

    mensajeTarifa +=
      `\n🌞 Tarifa mañanera (+$${tarifaMananera}, solo primera noche)`;

  }

  return {

    precio,
    mensajeTarifa

  };

}

module.exports = {

  calcularPrecio,
  generarFolio,
  normalizarHoraLlegada,
  parseHoraLlegada

};
