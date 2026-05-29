// messages/reservaMessages.js

function getPromocionLabel(data) {
  return data.promocion && data.promocion !== "no"
    ? data.promocion.toUpperCase()
    : "No aplica";
}

function reservaConfirmada({
  data,
  precio,
  mensajeTarifa,
  folio
}) {
  const requiereAnticipo =
    data.servicioEspecial === "Habitacion decorada";

  const promocion =
    getPromocionLabel(data);

  return `✅ RESERVA RECIBIDA

Gracias, hemos recibido tu solicitud de reservacion con estos datos:

👤 Nombre: ${data.nombre}

🧑 Adultos: ${data.adultos}

🧒 Niños: ${data.ninos}

🛏️ Habitacion: ${data.habitacion}
${data.servicioEspecial ? `🎈 Servicio especial: ${data.servicioEspecial}\n` : ""}
📅 Fecha de ingreso: ${data.fecha}

🌙 Noches: ${data.noches}

🎟️ Promocion: ${promocion}

⏰ Hora estimada de llegada: ${data.hora}

📞 Telefono: ${data.telefono}

💰 Total estimado: $${precio}
${mensajeTarifa}

🔢 Folio: #${folio}

${requiereAnticipo
  ? `🤝 Para garantizar tu reservacion se requiere un anticipo por transferencia.
Te enviaremos los datos de transferencia en imagen.

⚠️ Importante: si no recibimos el anticipo o comprobante dentro de 24 horas, la reservacion se cancela automaticamente.`
  : `✅ Tu solicitud de reservacion fue enviada correctamente.

💳 El pago puede realizarse con tarjeta o efectivo.
🧾 El total incluye IVA.`}`;
}

function reservaGrupo({
  data,
  precio,
  mensajeTarifa,
  folio
}) {
  const requiereAnticipo =
    data.servicioEspecial === "Habitacion decorada";

  const promocion =
    getPromocionLabel(data);

  return `${requiereAnticipo ? "🏨 NUEVA RESERVA PENDIENTE DE ANTICIPO" : "🏨 NUEVA RESERVA"}

👤 ${data.nombre}

🧑 Adultos: ${data.adultos}

🧒 Niños: ${data.ninos}

🛏️ ${data.habitacion}
${data.servicioEspecial ? `🎈 Servicio especial: ${data.servicioEspecial}\n` : ""}
📅 ${data.fecha}

🌙 Noches: ${data.noches}

🎟️ Promocion: ${promocion}

⏰ ${data.hora}

📞 ${data.telefono}

💰 $${precio}
${mensajeTarifa}

🔢 #${folio}`;
}

module.exports = {
  reservaConfirmada,
  reservaGrupo
};
