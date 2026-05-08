// validators/reservaValidator.js

const {
  esNumeroValido
} = require("../utils/helpers");

const validators = {

  // ==========================================
  // NOMBRE
  // ==========================================

  nombre(value) {

    const limpio =
      value.trim();

    // mínimo 2 palabras

    const palabras =
      limpio.split(/\s+/);

    if (
      palabras.length < 2
    ) {

      return false;

    }

    // solo letras y espacios

    return /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/
      .test(limpio);

  },

  // ==========================================
  // ADULTOS
  // ==========================================

  personas(value) {

    const num =
      parseInt(value);

    return (

      !isNaN(num)

      &&

      num >= 1

      &&

      num <= 4

    );

  },

  // ==========================================
  // NIÑOS
  // ==========================================

  ninos(value) {

    const num =
      parseInt(value);

    return (

      !isNaN(num)

      &&

      num >= 0

      &&

      num <= 4

    );

  },

  // ==========================================
  // HABITACIÓN
  // ==========================================

  habitacion(value) {

    return (
      value === "1"
      ||
      value === "2"
    );

  },

  // ==========================================
  // TELÉFONO
  // ==========================================

  telefono(value) {

    return /^\d{10}$/
      .test(value);

  },

  // ==========================================
  // FECHA
  // ==========================================

  fecha(value) {

    // ==========================
    // FORMATO
    // ==========================

    const regex =
      /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])$/;

    if (
      !regex.test(value)
    ) {

      return false;

    }

    // ==========================
    // PARTES
    // ==========================

    const [

      dia,
      mes

    ] = value
      .split("/")
      .map(Number);

    // ==========================
    // FECHA ACTUAL
    // ==========================

    const hoy =
      new Date();

    const year =
      hoy.getFullYear();

    // ==========================
    // CREAR FECHA
    // ==========================

    const fecha =
      new Date(
        year,
        mes - 1,
        dia
      );

    // ==========================
    // VALIDAR CALENDARIO REAL
    // ==========================

    if (

      fecha.getDate() !== dia

      ||

      fecha.getMonth() !== mes - 1

    ) {

      return false;

    }

    // ==========================
    // HOY LIMPIO
    // ==========================

    const hoyLimpio =
      new Date(
        year,
        hoy.getMonth(),
        hoy.getDate()
      );

    // ==========================
    // VALIDAR PASADO
    // ==========================

    if (
      fecha < hoyLimpio
    ) {

      return false;

    }

    return true;

  },

  // ==========================================
  // HORA
  // ==========================================

  hora(value) {

    return /^(0?[1-9]|1[0-2])\s?(am|pm)$/i
      .test(value);

  }

};

module.exports =
  validators;