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

  let precio =
    adultos <= 2
      ? 700
      : 800;

  let mensajeTarifa =
    "";

  const partes =
    horaTexto
      .toLowerCase()
      .split(" ");

  let hora =
    parseInt(partes[0]);

  const periodo =
    partes[1];

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
