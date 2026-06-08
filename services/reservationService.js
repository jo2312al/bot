const {
  generarFolio
} = require("../utils/helpers");

function parseHoraLlegada(horaTexto) {
  const match =
    horaTexto
      .trim()
      .toLowerCase()
      .match(/^(\d{1,2})\s*(am|pm)$/);

  if (!match) return null;

  let hora =
    parseInt(match[1], 10);

  const periodo =
    match[2];

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
  return horaTexto
    .trim()
    .toLowerCase()
    .replace(/^(\d{1,2})\s*(am|pm)$/, "$1 $2");
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
