function cotizacionConfirmada({ data }) {
  return `SOLICITUD DE COTIZACION ENVIADA

Hemos recibido tu solicitud.

Nuestros salones tienen capacidad maxima para 15 o 50 personas. Realizamos desayunos, comidas, cenas, reuniones, cursos, juntas y baby shower.

Evento: ${data.tipo_evento}
Fecha: ${data.fecha}
Personas: ${data.personas}
Telefono: ${data.telefono}

Un agente de ventas se comunicara contigo pronto.`;
}

function cotizacionGrupo({ data, from }) {
  return `NUEVA COTIZACION

Evento: ${data.tipo_evento}
Fecha: ${data.fecha}
Personas: ${data.personas}
Contacto: ${data.telefono}
WhatsApp: ${from}`;
}

module.exports = {
  cotizacionConfirmada,
  cotizacionGrupo
};
