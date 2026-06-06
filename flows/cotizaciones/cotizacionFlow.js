const {
  formatReservationDate
} = require("../../utils/dateUtils");

function firstNumber(value) {

  return parseInt(
    String(value).match(/\d+/)?.[0],
    10
  );

}

module.exports = [
  {
    key: "tipo_evento",
    question: `COTIZACIONES

Que tipo de evento te interesa?

Realizamos desayunos, comidas, cenas, reuniones, cursos, juntas y baby shower.

Ejemplo:
Desayuno, curso o reunion`,
    validator: "texto"
  },
  {
    key: "fecha",
    question: `Fecha estimada

Puedes escribir:
25/12
25/12/26
25 de diciembre`,
    validator: "fecha",
    transform: value =>
      formatReservationDate(value)
  },
  {
    key: "personas",
    question: `Cantidad de personas

Nuestros salones son para maximo 15 o 50 personas.

Ejemplos:
15
serian 20 personas`,
    validator: "numero",
    transform: value =>
      firstNumber(value)
  },
  {
    key: "telefono",
    question: `Telefono de contacto

Ejemplo:
9931234567`,
    validator: "telefono",
    transform: value =>
      String(value)
        .replace(/\D/g, "")
  }
];
