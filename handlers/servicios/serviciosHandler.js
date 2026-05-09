const {
  HOTEL_SERVICES
} = require(
  "../../constants/services"
);

async function handleServicios({

  send

}) {

  return send(HOTEL_SERVICES);

}

module.exports = {

  handleServicios

};