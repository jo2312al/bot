module.exports = [
  {
    key: "nombre",
    question: `👤 Nombre completo

✅ Ejemplo:
Juan Pérez`,
    validator: "nombre"
  },
  {
    key: "habitacion",
    question: `🏨 Número de habitación

✅ Ejemplo:
102`,
    validator: "habitacion"
  },
  {
    key: "fecha_ingreso",
    question: `📅 Fecha ingreso

Formato:
dd/mm

✅ Ejemplo:
25/12`,
    validator: "fecha"
  },
  {
    key: "objeto",
    question: `📝 Objeto perdido

Describe el objeto perdido.`,
    validator: "descripcion"
  },
  {
    key: "telefono",
    question: `📱 Teléfono

✅ Ejemplo:
9931234567`,
    validator: "telefono"
  }
];
