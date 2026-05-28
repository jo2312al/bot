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

Formato:
dd/mm

Ejemplo:
25/12`,
    validator: "fecha"
  },
  {
    key: "personas",
    question: `Cantidad de personas

Nuestros salones son para maximo 15 o 50 personas.

Ejemplo:
15`,
    validator: "numero"
  },
  {
    key: "telefono",
    question: `Telefono de contacto

Ejemplo:
9931234567`,
    validator: "telefono"
  }
];
