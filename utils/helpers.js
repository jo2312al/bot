function generarFolio(prefix = "B") {
  const cleanPrefix =
    String(prefix || "B")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 3)
    ||
    "B";

  const number =
    Math.floor(
    10000 +
    Math.random() * 90000
  );

  return `${cleanPrefix}-${number}`;

}

function esNumeroValido(num) {

  const n =
    parseInt(num);

  return (
    !isNaN(n)
    &&
    n >= 1
    &&
    n <= 4
  );

}

module.exports = {

  generarFolio,
  esNumeroValido

};
