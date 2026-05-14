function objetoConfirmado({ data }) {
  return `✅ REPORTE ENVIADO

Tu reporte de objeto extraviado ha sido recibido.

👤 Nombre: ${data.nombre}
🏨 Habitación: ${data.habitacion}
📅 Ingreso: ${data.fecha_ingreso}
📝 Objeto: ${data.objeto}
📱 Teléfono: ${data.telefono}

Nos pondremos en contacto contigo si lo encontramos.`;
}

function objetoGrupo({ data, from }) {
  return `🧳 REPORTE OBJETO EXTRAVIADO

👤 Cliente: ${data.nombre}
🏨 Habitación: ${data.habitacion}
📅 Ingreso: ${data.fecha_ingreso}
📝 Objeto: ${data.objeto}
📱 Contacto: ${data.telefono}
WhatsApp: ${from}`;
}

module.exports = {
  objetoConfirmado,
  objetoGrupo
};
