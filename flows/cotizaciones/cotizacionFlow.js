module.exports = [
  {
    key: "tipo_evento",
    question: `💼 COTIZACIONES

¿Qué tipo de evento te interesa?

✅ Ejemplo:
Boda, XV años, Conferencia`,
    validator: "texto"
  },
  {
    key: "fecha",
    question: `📅 Fecha estimada

Formato:
dd/mm

✅ Ejemplo:
25/12`,
    validator: "fecha"
  },
  {
    key: "personas",
    question: `👥 Cantidad de personas

✅ Ejemplo:
150`,
    validator: "numero"
  },
  {
    key: "telefono",
    question: `📱 Teléfono de contacto

✅ Ejemplo:
9931234567`,
    validator: "telefono"
  }
];
