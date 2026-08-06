import { defineConfig, devices } from "@playwright/test";

// サーバの起動・停止は webServer に任せる（scripts/e2e.sh は Supabase の起動と
// テスト用環境変数の用意だけを行う。AGENTS.md「結合を増やさない」2）。
const PORT = process.env.E2E_PORT ?? "3125";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: {
    // 本番相当のビルド（next start）を検査する。scripts/e2e.sh 実行前に
    // `pnpm -r build` 済みであることが前提（scripts/smoke.sh と同じ前提）。
    command: `pnpm exec next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
    // サーバ側の例外（Server Component / Server Action のエラー）をテストのログに出す。
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // 新設計の中核（縮小した書類の上で行ブロック・写真枠を押す）は、実機に近い
    // 幅でしか踏めない。Desktop Chrome だけだと縮小倍率が1倍のままで、
    // 「小さくなった書類を親指で押す」という肝心の経路が検査されない
    // （docs/plan-rebuild.md「E2E は現在 Desktop Chrome 1プロジェクト」）。
    // 全件を2プロジェクトで流すと所要時間が倍になるだけなので、モバイル幅で踏む
    // 意味があるテストだけを名前の @mobile で拾う（chromium は全件を流す）。
    // 端末は **Chromium 系（Pixel 5）** を使う。iPhone 13 は WebKit を引くが、
    // CI が入れているブラウザは chromium だけなので起動できずに落ちる（実際に落とした）。
    // ブラウザを増やすとCIの所要時間も増える。そもそも iOS Safari 固有の挙動
    // （入力欄16px未満での自動ズーム等）はエミュレータでは再現できず、
    // 実機確認（docs/plan-rebuild.md B-1 の S3）が引き受ける領分なので、
    // ここで見たいのは「モバイル幅で操作が成立するか」に絞る。
    { name: "mobile", use: { ...devices["Pixel 5"] }, grep: /@mobile/ },
  ],
});
