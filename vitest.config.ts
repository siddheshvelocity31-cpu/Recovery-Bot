import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(
        __dirname,
        "tests/__mocks__/server-only.ts",
      ),
    },
  },
  test: {
    environment: "node",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
      "tests/e2e/**/*.test.ts",
    ],
    // GitHub Actions sets CI=true automatically; skip integration and e2e
    // tests there since they require a live Supabase instance.
    exclude: process.env.CI
      ? ["**/node_modules/**", "tests/integration/**", "tests/e2e/**"]
      : ["**/node_modules/**"],
  },
});
