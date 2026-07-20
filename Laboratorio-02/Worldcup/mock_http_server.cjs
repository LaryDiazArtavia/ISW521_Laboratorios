"use strict";

const http = require("http");

const PORT = 3001;

const server = http.createServer((request, response) => {
  /*
   * Permite que la página abierta en localhost:8080
   * consulte este servidor de pruebas.
   */
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const routeMatch = request.url.match(
    /^\/status\/(429|500)$/
  );

  if (!routeMatch) {
    response.writeHead(404, {
      "Content-Type": "application/json"
    });

    response.end(
      JSON.stringify({
        status: 404,
        message: "Ruta de prueba no encontrada"
      })
    );

    return;
  }

  const statusCode = Number(routeMatch[1]);

  const message =
    statusCode === 429
      ? "Demasiadas solicitudes simuladas"
      : "Error interno del servidor simulado";

  response.writeHead(statusCode, {
    "Content-Type": "application/json"
  });

  response.end(
    JSON.stringify({
      status: statusCode,
      message
    })
  );
});

server.listen(PORT, () => {
  console.log(
    `Servidor de pruebas ejecutándose en http://localhost:${PORT}`
  );

  console.log(
    "Rutas disponibles: /status/429 y /status/500"
  );
});

process.on("SIGINT", () => {
  server.close(() => {
    console.log("\nServidor de pruebas detenido.");
    process.exit(0);
  });
});