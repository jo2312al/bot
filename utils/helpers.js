function generarFolio() {

  return Math.floor(
    10000 +
    Math.random() * 90000
  );

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