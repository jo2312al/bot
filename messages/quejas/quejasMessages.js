// ==========================================
// CLIENTE
// ==========================================

function quejaConfirmada({

  data

}) {

  return `✅ REPORTE ENVIADO

📋 Tipo:
${data.tipo}

🏢 Área:
${data.area}

👤 Nombre:
${data.nombre}

📝 Observaciones:
${data.observaciones}

Gracias por ayudarnos a mejorar`;

}

// ==========================================
// STAFF
// ==========================================

function quejaGrupo({

  data,
  from

}) {

  return `🚨 NUEVA QUEJA

📋 Tipo:
${data.tipo}

🏢 Área:
${data.area}

👤 Cliente:
${data.nombre}

📱 WhatsApp:
${from}

📝 Observaciones:
${data.observaciones}`;

}

module.exports = {

  quejaConfirmada,
  quejaGrupo

};
