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
  noches = 1

}) {

  const tarifaNoche =
    adultos <= 2
      ? 700
      : 800;

  let precio =
    tarifaNoche * noches;

  let mensajeTarifa =
    "";

  const hora =
    parseHoraLlegada(horaTexto);

  if (
    hora !== null
    &&
    hora < 13
  ) {

    precio += 200;

    mensajeTarifa =
      "\n🌞 Tarifa mañanera (+$200)";

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
