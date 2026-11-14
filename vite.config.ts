import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      // Usa src/server.ts como entrada del servidor para conservar el manejo de
      // errores SSR que trae el refactor.
      server: { entry: "server" },
    }),
    // El plugin de React debe ir después del plugin de Start.
    viteReact(),
  ],
});
