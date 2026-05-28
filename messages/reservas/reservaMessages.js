// messages/reservaMessages.js

function reservaConfirmada({
  data,
  precio,
  mensajeTarifa,
  folio
}) {
  return `RESERVA RECIBIDA

${data.nombre}

Adultos: ${data.adultos}
Ninos: ${data.ninos}
Habitacion: ${data.habitacion}
Fecha: ${data.fecha}
Noches: ${data.noches}
Hora llegada: ${data.hora}
Telefono: ${data.telefono}

Total: $${precio}
${mensajeTarifa}

Folio: #${folio}

Para garantizar tu reservacion se requiere un anticipo por transferencia.
Te enviaremos los datos de transferencia en imagen.

Importante: si no recibimos el anticipo o comprobante dentro de 24 horas, la reservacion se cancela automaticamente.`;
}

function reservaGrupo({
  data,
  precio,
  mensajeTarifa,
  folio
}) {
  return `NUEVA RESERVA PENDIENTE DE ANTICIPO

${data.nombre}

Adultos: ${data.adultos}
Ninos: ${data.ninos}
Habitacion: ${data.habitacion}
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
