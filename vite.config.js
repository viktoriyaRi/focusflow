import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ["defaults", "iOS >= 12", "Android >= 7", "not IE 11"],
      modernPolyfills: true,
    }),
  ],
  base: "/focusflow/",
});
