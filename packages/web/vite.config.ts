import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// A11 — this harness is a TEST HARNESS OVER THE FRAMEWORK, not a product UI.
// No expected result in Part 3 is asserted about the harness itself; every
// expected result is asserted about framework behaviour observed THROUGH it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
      "/live": { target: "ws://localhost:4000", ws: true },
    },
  },
});
