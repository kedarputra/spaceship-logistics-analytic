import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
    environment: "node",
    // A test's vi.stubEnv (the sign-in secret and users file) is undone after it.
    unstubEnvs: true,
  },
});
