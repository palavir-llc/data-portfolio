import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolve the same "@/..." path alias used by Next.js (tsconfig paths) so unit
// tests can import shared modules like "@/lib/html".
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
