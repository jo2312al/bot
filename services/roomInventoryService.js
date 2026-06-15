const fs = require("fs");
const path = require("path");
const {
  isClosedDisplayDate
} = require("./closedDatesService");
const {
  cancelCalendarReservationByFolio,
  saveCalendarReservation
} = require("./reservationDatabaseService");

const DATA_FILE =
  path.join(
    __dirname,
    "../data/reservas.json"
  );

const ROOM_LIMITS = {
  King: 5,
  Doble: 20
};

function getRoomLimits() {
  return {
    ...ROOM_LIMITS
  };
}

function ensureDataFile() {
  const dataDir =
    path.dirname(DATA_FILE);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, {
      recursive: true
    });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      "[]",
      "utf8"
    );
  }
}

function readReservations() {
  ensureDataFile();

  try {
    const raw =
      fs.readFileSync(
        DATA_FILE,
        "utf8"
      );

    return JSON.parse(raw);
  } catch (error) {
    return [];
  }
}

function writeReservations(reservations) {
  ensureDataFile();

  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(
      reservations,
      null,
      2
    ),
    "utf8"
  );
}

function parseDisplayDate(value) {
  const [
    day,
    month,
    year
  ] =
    value
      .split("/")
      .map(Number);

  return new Date(
    year,
    month - 1,
    day
  );
}

function formatDisplayDate(date) {
  const day =
    String(date.getDate())
      .padStart(2, "0");

  const month =
    String(date.getMonth() + 1)
      .padStart(2, "0");

  const year =
    date.getFullYear();

  return `${day}/${month}/${year}`;
}

function getStayDates({
  fecha,
  noches
}) {
  const start =
    parseDisplayDate(fecha);

  return Array.from(
    {
      length: noches
    },
    (_, index) => {
      const date =
        new Date(start);

      date.setDate(
        start.getDate() + index
      );

      return formatDisplayDate(date);
    }
  );
}

function countRoomsForDate({
  reservations,
  habitacion,
  date
}) {
  return reservations
    .filter(reservation =>
      reservation.status !== "cancelada"
      &&
      reservation.habitacion === habitacion
      &&
      Array.isArray(reservation.dates)
      &&
      reservation.dates.includes(date)
    )
    .reduce(
      (total, reservation) =>
        total + (reservation.habitaciones || 1),
      0
    );
}

function checkRoomAvailability({
  habitacion,
  fecha,
  noches,
  habitaciones = 1
}) {
  const limit =
    ROOM_LIMITS[habitacion];

  if (!limit) {
    return {
      available: true,
      dates: []
    };
  }

  const reservations =
    readReservations();

  const dates =
    getStayDates({
      fecha,
      noches
    });

  const fullDates =
    dates.filter(date =>
      isClosedDisplayDate(date)
      ||
      countRoomsForDate({
        reservations,
        habitacion,
        date
      }) + habitaciones > limit
    );

  return {
    available:
      fullDates.length === 0,
    dates,
    fullDates,
    closedDates:
      fullDates.filter(isClosedDisplayDate),
    limit
  };
}

function saveRoomReservation({
  folio,
  data
}) {
  const reservations =
    readReservations();

  reservations.push({
    source:
      "bot",
    folio,
    nombre:
      data.nombre || "",
    telefono:
      data.telefono || "",
    habitacion:
      data.habitacion,
    habitaciones:
      data.habitaciones || 1,
    fecha:
      data.fecha,
    noches:
      data.noches,
    adultos:
      data.adultos,
    ninos:
      data.ninos,
    servicioEspecial:
      data.servicioEspecial || "",
    dates:
      getStayDates({
        fecha: data.fecha,
        noches: data.noches
      }),
    status: "activa",
    createdAt:
      new Date()
        .toISOString()
  });

  writeReservations(reservations);

  saveCalendarReservation({
    source:
      "bot",
    sourceKey:
      `folio:${folio}`,
    folio,
    nombre:
      data.nombre || "",
    telefono:
      data.telefono || "",
    tipo:
      data.habitacion,
    habitacion:
      data.habitacion,
    habitaciones:
      data.habitaciones || 1,
    fecha:
      data.fecha,
    dates:
      getStayDates({
        fecha: data.fecha,
        noches: data.noches
      }),
    adultos:
      data.adultos,
    ninos:
      data.ninos,
    hora:
      data.hora || "",
    raw:
      `Folio #${folio}`,
    status:
      "activa"
  });
}

function cancelRoomReservationByFolio(folio) {
  const reservations =
    readReservations();

  let updated =
    false;

  const nextReservations =
    reservations.map(reservation => {
      if (
        reservation.folio === folio
        &&
        reservation.status !== "cancelada"
      ) {
        updated = true;

        return {
          ...reservation,
          status: "cancelada",
          canceledAt:
            new Date()
              .toISOString()
        };
      }

      return reservation;
    });

  if (updated) {
    writeReservations(nextReservations);
    cancelCalendarReservationByFolio(folio);
  }
}

module.exports = {
  getRoomLimits,
  readReservations,
  checkRoomAvailability,
  saveRoomReservation,
  cancelRoomReservationByFolio
};
