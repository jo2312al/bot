const validators = {
  texto(value) {
    return value.trim().length >= 3;
  },
  fecha(value) {
    const regex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])$/;
    if (!regex.test(value)) return false;

    const [dia, mes] = value.split("/").map(Number);
    const hoy = new Date();
    const year = hoy.getFullYear();
    const fecha = new Date(year, mes - 1, dia);

    if (fecha.getDate() !== dia || fecha.getMonth() !== mes - 1) return false;

    const hoyLimpio = new Date(year, hoy.getMonth(), hoy.getDate());
    if (fecha < hoyLimpio) return false;

    return true;
  },
  numero(value) {
    const num = parseInt(value);
    return !isNaN(num) && num > 0;
  },
  telefono(value) {
    return /^\d{10}$/.test(value.trim());
  }
};

module.exports = validators;
