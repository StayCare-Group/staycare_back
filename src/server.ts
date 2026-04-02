import app from "./app";
import pool from "./db/pool";
import { config } from "./config";

const PORT = config.app.port;

// Test MySQL connection at startup
pool.getConnection()
  .then(connection => {
    console.log("MySQL connected successfully");
    connection.release();
  })
  .catch((error: { code?: string; message?: string }) => {
    console.error("MySQL connection failed:", error);
    if (error.code === "ER_ACCESS_DENIED_ERROR") {
      console.error(
        "Access denied: el usuario/contraseña no coinciden con MySQL, o el usuario no existe. " +
          "Alinea DB_USER y DB_PASSWORD en .env con tu servidor MySQL local, o ejecuta scripts/mysql-local-grant.sql (como root) y usa la misma contraseña en .env.",
      );
    }
    process.exit(1);
  });

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});