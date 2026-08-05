import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// JSX/TSX は esbuild の automatic runtime で変換する。
// テストは tests/ 配下のみを対象にし、Next のルート（app/）とは分離する。
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  resolve: {
    alias: {
      // "server-only" は Next.js のビルド条件が無い環境（vitest）では例外を投げる。
      // lib/db/client.ts が import しているため、テストではスタブに差し替える。
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
