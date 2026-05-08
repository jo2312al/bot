// messages/reservaMessages.js

function reservaConfirmada({

  data,
  precio,
  mensajeTarifa,
  folio

}) {

  return `✅ RESERVA CONFIRMADA

👤 ${data.nombre}

👨 Adultos: ${data.adultos}

🧒 Niños: ${data.ninos}

🛏️ ${data.habitacion}

📅 ${data.fecha}

⏰ ${data.hora}

📞 ${data.telefono}

💰 Total: $${precio}
${mensajeTarifa}

🔢 Folio: #${folio}`;

}

function reservaGrupo({

  data,
  precio,
  mensajeTarifa,
  folio

}) {

  return `🏨 NUEVA RESERVA

👤 ${data.nombre}

👨 Adultos: ${data.adultos}

🧒 Niños: ${data.ninos}

🛏️ ${data.habitacion}

📅 ${data.fecha}

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