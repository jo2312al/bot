const fs = require("fs");
const http = require("http");

const csvPath =
  process.argv[2];

if (!csvPath) {
  console.error("Uso: node scripts/import-reservations-csv-api.js <archivo.csv>");
  process.exit(1);
}

const csv =
  fs.readFileSync(
    csvPath,
    "utf8"
  );

const body =
  JSON.stringify({
    csv
  });

const request =
  http.request(
    {
      hostname:
        process.env.DASHBOARD_HOST || "127.0.0.1",
      port:
        Number(process.env.DASHBOARD_PORT || process.env.PORT || 3333),
      path:
        "/api/reservations/import-csv",
      method:
        "POST",
      headers:
        {
          "Content-Type":
            "application/json",
          "Content-Length":
            Buffer.byteLength(body)
        }
    },
    response => {
      let data =
        "";

      response.on(
        "data",
        chunk => {
          data += chunk;
        }
      );

      response.on(
        "end",
        () => {
          console.log(response.statusCode);
          console.log(data);

          if (response.statusCode >= 400) {
            process.exit(1);
          }
        }
      );
    }
  );

request.on(
  "error",
  error => {
    console.error(error);
    process.exit(1);
  }
);

request.write(body);
request.end();
