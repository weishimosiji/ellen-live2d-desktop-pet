import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        calendar: resolve(import.meta.dirname, "calendar.html"),
        panel: resolve(import.meta.dirname, "panel.html"),
        speechConfirm: resolve(import.meta.dirname, "speech-confirm.html"),
      },
    },
  }
});
