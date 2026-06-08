// messages/reservaMessages.js

function formatMoney(value) {
  return Number(value || 0)
    .toLocaleString(
      "es-MX"
    );
}

function reservaConfirmada({
  data,
  precio,
  mensajeTarifa,
  folio
}) {
  const requiereAnticipo =
    data.servicioEspecial === "Habitacion decorada";

  const tarifaDetalle =
    mensajeTarifa
      ? `\n${mensajeTarifa}`
      : "";

  return `✅ Solicitud de reservacion registrada.

🎟️ Folio: #${folio}
📝 Nombre: ${data.nombre}
📅 Fecha: ${data.fecha}
🌙 Noches: ${data.noches}
🏨 Habitaciones: ${data.habitaciones || 1}
👥 Huespedes: ${data.adultos} adulto(s), ${data.ninos} niño(s)
🛏️ Habitacion: ${data.habitacion}
📞 Telefono: ${data.telefono}
⏰ Llegada: ${data.hora}
💰 Tarifa estimada: $${formatMoney(precio)}
${tarifaDetalle}
${requiereAnticipo
  ? `
🤝 Para garantizar la reservacion se requiere anticipo por transferencia.

⚠️ Si no se recibe anticipo o comprobante dentro de 24 horas, la reservacion se cancela automaticamente.`
  : ""}`;
}

function reservaGrupo({
  data,
  precio,
  mensajeTarifa,
  folio
}) {
  const requiereAnticipo =
    data.servicioEspecial === "Habitacion decorada";

  const tarifaDetalle =
    mensajeTarifa
      ? `\n${mensajeTarifa}`
      : "";

  return `${requiereAnticipo ? "🏨 NUEVA RESERVA PENDIENTE DE ANTICIPO" : "🏨 NUEVA RESERVA"}

🎟️ #${folio}
📝 ${data.nombre}
📅 ${data.fecha}
🌙 Noches: ${data.noches}
🏨 Habitaciones: ${data.habitaciones || 1}
👥 Huespedes: ${data.adultos} adulto(s), ${data.ninos} niño(s)
🛏️ ${data.habitacion}
${data.servicioEspecial ? `🎈 Servicio especial: ${data.servicioEspecial}\n` : ""}📞 ${data.telefono}
⏰ ${data.hora}
💰 $${formatMoney(precio)}
${tarifaDetalle}`;
}

module.exports = {
  reservaConfirmada,
  reservaGrupo
};
