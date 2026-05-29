function normalizeMenuInput(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MENU_ALIASES = {
  "1": [
    "1",
    "reserva",
    "reservas",
    "reservacion",
    "reservaciones",
    "reservar",
    "habitacion",
    "habitaciones",
    "hospedaje"
  ],
  "2": [
    "2",
    "cotizacion",
    "cotizaciones",
    "cotizar",
    "evento",
    "eventos",
    "salon",
    "salones"
  ],
  "3": [
    "3",
    "queja",
    "quejas",
    "reporte",
    "reportar",
    "inconformidad"
  ],
  "4": [
    "4",
    "objeto",
    "objetos",
    "objeto extraviado",
    "objetos extraviados",
    "perdido",
    "perdidos",
    "extraviado",
    "extraviados"
  ],
  "5": [
    "5",
    "galeria",
    "fotos",
    "imagenes",
    "ver fotos"
  ],
  "6": [
    "6",
    "turismo",
    "tabasco",
    "que hacer",
    "que hacer en tabasco",
    "guia",
    "guia turistica"
  ],
  "7": [
    "7",
    "servicio",
    "servicios",
    "amenidades"
  ],
  "8": [
    "8",
    "foto gratis",
    "foto del mes",
    "promocion",
    "promociones"
  ],
  "9": [
    "9",
    "redes",
    "redes sociales",
    "facebook",
    "instagram"
  ],
  "10": [
    "10",
    "pelicula",
    "margarita",
    "margarita la pelicula"
  ],
  "11": [
    "11",
    "call center",
    "callcenter",
    "telefono",
    "llamar",
    "contacto",
    "asesor"
  ],
  "12": [
    "12",
    "romantica",
    "romantico",
    "cena romantica",
    "cenas romanticas",
    "habitacion decorada",
    "habitaciones decoradas",
    "decorada",
    "decoracion",
    "san valentin"
  ]
};

function resolveMenuOption(value) {
  const normalized =
    normalizeMenuInput(value);

  return Object.entries(MENU_ALIASES)
    .find(([, aliases]) =>
      aliases.includes(normalized)
    )
    ?.[0] || normalized;
}

module.exports = {
  resolveMenuOption,
  normalizeMenuInput
};
