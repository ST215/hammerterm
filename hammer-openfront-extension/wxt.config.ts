import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Hammer Terminal",
    description: "Automation and intelligence companion for OpenFront.io",
    permissions: ["storage", "tabs"],
    host_permissions: ["*://openfront.io/*", "*://*.openfront.io/*"],
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@shared": path.resolve(__dirname, "src/shared"),
        "@content": path.resolve(__dirname, "src/content"),
        "@ui": path.resolve(__dirname, "src/ui"),
        "@store": path.resolve(__dirname, "src/store"),
      },
    },
  }),
});
