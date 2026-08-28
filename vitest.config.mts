import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Entorno Node.js (sin DOM, apropiado para el backend)
    environment: "node",
    // Archivos de test: cualquier *.test.ts dentro de src/
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    // Reporte legible en consola
    reporter: "verbose",
  },
});
