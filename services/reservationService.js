const {
  generarFolio
} = require("../utils/helpers");

// ==========================================
// CALCULAR PRECIO
// ==========================================

function calcularPrecio({

  adultos,
  ninos,
  horaTexto

}) {

  // ==========================================
  // SOLO ADULTOS PAGAN
  // ==========================================

  let precio =

    adultos <= 2

      ? 700

      : 800;

  let mensajeTarifa =
    "";

  // ==========================================
  // PARSE HORA
  // ==========================================

  const partes =
    horaTexto
      .toLowerCase()
      .split(" ");

  let hora =
    parseInt(partes[0]);

  const periodo =
    partes[1];

  // ==========================================
  // PM
  // ==========================================

  if (
    periodo === "pm"
    &&
    hora !== 12
  ) {

    hora += 12;

  }

  // ==========================================
  // 12 AM
  // ==========================================

  if (
    periodo === "am"
    &&
    hora === 12
  ) {

    hora = 0;

  }

  // ==========================================
  // TARIFA MAÑANERA
  // ==========================================

  if (hora < 13) {

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
  generarFolio

};