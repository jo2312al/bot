function cotizacionConfirmada({ data }) {
  return `✅ SOLICITUD DE COTIZACIÓN ENVIADA

Hemos recibido tu solicitud.

🎉 Evento: ${data.tipo_evento}
📅 Fecha: ${data.fecha}
👥 Personas: ${data.personas}
📱 Teléfono: ${data.telefono}

Un agente de ventas se comunicará contigo pronto.`;
}

function cotizacionGrupo({ data, from }) {
  return `💼 NUEVA COTIZACIÓN

🎉 Evento: ${data.tipo_evento}
📅 Fecha: ${data.fecha}
👥 Personas: ${data.personas}
📱 Contacto: ${data.telefono}
WhatsApp: ${from}`;
}

module.exports = {
  cotizacionConfirmada,
  cotizacionGrupo
};
