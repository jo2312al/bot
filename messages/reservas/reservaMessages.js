// messages/reservaMessages.js

function reservaConfirmada({
  data,
  precio,
  mensajeTarifa,
  folio
}) {
  const requiereAnticipo =
    data.servicioEspecial === "Habitacion decorada";

  return `RESERVA RECIBIDA

${data.nombre}

Adultos: ${data.adultos}
Ninos: ${data.ninos}
Habitacion: ${data.habitacion}
${data.servicioEspecial ? `Servicio especial: ${data.servicioEspecial}\n` : ""}
Fecha: ${data.fecha}
Noches: ${data.noches}
Hora llegada: ${data.hora}
Telefono: ${data.telefono}

Total: $${precio}
${mensajeTarifa}

Folio: #${folio}

${requiereAnticipo
  ? `Para garantizar tu reservacion se requiere un anticipo por transferencia.
Te enviaremos los datos de transferencia en imagen.

Importante: si no recibimos el anticipo o comprobante dentro de 24 horas, la reservacion se cancela automaticamente.`
  : "Tu solicitud de reservacion fue enviada correctamente."}`;
}

function reservaGrupo({
  data,
  precio,
  mensajeTarifa,
  folio
}) {
  const requiereAnticipo =
    data.servicioEspecial === "Habitacion decorada";

  return `${requiereAnticipo ? "NUEVA RESERVA PENDIENTE DE ANTICIPO" : "NUEVA RESERVA"}

${data.nombre}

Adultos: ${data.adultos}
Ninos: ${data.ninos}
Habitacion: ${data.habitacion}
${data.servicioEspecial ? `Servicio especial: ${data.servicioEspecial}\n` : ""}
Fecha: ${data.fecha}
Noches: ${data.noches}
Hora llegada: ${data.hora}
Telefono: ${data.telefono}

$${precio}
${mensajeTarifa}

#${folio}`;
}

module.exports = {
  reservaConfirmada,
  reservaGrupo
};
