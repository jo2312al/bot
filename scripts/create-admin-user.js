const mysql = require("../services/mysqlCliService");
const { createUserAuthService } = require("../services/userAuthService");

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Configura ${name} para crear el administrador.`);
  return value;
}

function main() {
  const auth = createUserAuthService(mysql, {
    propertyKey: process.env.HOTEL_PROPERTY_KEY || "villa-margaritas"
  });
  if (auth.countUsers() > 0 && process.env.ALLOW_ADDITIONAL_ADMIN !== "1") {
    throw new Error("Ya existen usuarios. Usa la administracion del sistema o confirma ALLOW_ADDITIONAL_ADMIN=1.");
  }
  const user = auth.createUser({
    username: required("ADMIN_USERNAME"),
    displayName: required("ADMIN_DISPLAY_NAME"),
    password: required("ADMIN_PASSWORD"),
    roleCode: "admin"
  });
  process.stdout.write(`Administrador creado: ${user.username} (${user.displayName})\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
