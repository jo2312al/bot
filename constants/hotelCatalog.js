const HOTEL_ROOM_NUMBERS =
  [1, 2, 3, 4]
    .flatMap(floor =>
      Array.from(
        { length: floor === 4 ? 6 : 22 },
        (_, index) => index + 1
      )
        .filter(number => number !== 13)
        .map(number =>
          `${floor}${String(number).padStart(2, "0")}`
        )
    );

const HOTEL_RATE_OPTIONS = [
  {
    label:
      "Habitacion sencilla/doble - $700",
    value:
      "$700"
  },
  {
    label:
      "Suite - $800",
    value:
      "$800"
  },
  {
    label:
      "Mañanera - $900",
    value:
      "$900"
  },
  {
    label:
      "Mañanera suite - $1,000",
    value:
      "$1,000"
  },
  {
    label:
      "Convenio - $600",
    value:
      "$600"
  },
  {
    label:
      "Promocion INAPAM/PEMEX/ADO/cliente frecuente - $650",
    value:
      "$650"
  }
];

function escapeHtmlAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function hotelRateOptionsHtml(selectedValue = "") {
  const selected =
    String(selectedValue || "").trim();
  const options =
    HOTEL_RATE_OPTIONS
      .map(option =>
        `<option value="${escapeHtmlAttribute(option.value)}"${option.value === selected ? " selected" : ""}>${escapeHtmlAttribute(option.label)}</option>`
      );

  if (
    selected
    &&
    !HOTEL_RATE_OPTIONS.some(option => option.value === selected)
  ) {
    options.unshift(
      `<option value="${escapeHtmlAttribute(selected)}" selected>${escapeHtmlAttribute(selected)} (tarifa guardada)</option>`
    );
  }

  return [
    '<option value="">Sin tarifa</option>',
    ...options
  ].join("");
}

module.exports = {
  HOTEL_RATE_OPTIONS,
  HOTEL_ROOM_NUMBERS,
  hotelRateOptionsHtml
};
