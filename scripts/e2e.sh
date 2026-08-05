#!/usr/bin/env bash
#
# E2E検査。実ブラウザ（Playwright）で、写真→明細→下請依頼→取り込み→見積書PDFの
# 一連の流れを実際に操作して検証する。CI（.github/workflows/ci.yml の e2e ジョブ）と
# 手元の両方から、同じこのファイルを実行する
# （AGENTS.md「結合を増やさない」2：同じ処理を呼ぶ入口は1つにする）。
#
# 手元で動かす: bash scripts/e2e.sh
# （先に `pnpm -r build` と、Playwright のブラウザ導入
#   `pnpm --filter web exec playwright install --with-deps chromium` が要る）
#
# ここで使う AUTH_SECRET / DEMO_USER_* は、この検査の中だけで使い捨てる値を毎回生成している。
# 本物の秘密情報ではない（scripts/smoke.sh と同じ扱い。AGENTS.md「秘密情報」対象外1）。
#
# アプリの起動・停止自体は Playwright の webServer（apps/web/playwright.config.ts）に
# 任せる。ここでは Supabase の起動とテスト用環境変数の用意だけを行う。

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}" || {
  echo "FAIL: リポジトリルートへ移動できない: ${REPO_ROOT}"
  exit 1
}

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

export E2E_PORT="${E2E_PORT:-3125}"
export AUTH_SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n')"
export DEMO_USER_EMAIL="e2e@example.com"
export DEMO_USER_PASSWORD="$(head -c 24 /dev/urandom | base64 | tr -d '\n')"
export NODE_ENV=production

echo "== ローカル Supabase を起動 =="
if ! docker info >/dev/null 2>&1; then
  echo "FAIL: Docker デーモンに接続できない。ローカル Supabase の起動には Docker が要る。"
  exit 1
fi
if ! pnpm exec supabase start; then
  echo "FAIL: supabase start に失敗した"
  exit 1
fi
if ! pnpm exec supabase status -o env >"${WORK}/supabase.env"; then
  echo "FAIL: supabase status に失敗した"
  exit 1
fi
# shellcheck disable=SC1091
source "${WORK}/supabase.env"
if [ -z "${API_URL:-}" ] || [ -z "${SERVICE_ROLE_KEY:-}" ]; then
  echo "FAIL: supabase status から API_URL / SERVICE_ROLE_KEY を取得できない"
  exit 1
fi
export SUPABASE_URL="${API_URL}"
export SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY}"

# 先客がいると、そのプロセスを検査してしまい結果の意味が無くなる（scripts/smoke.sh と同じ理由）。
if curl -s -o /dev/null --max-time 2 "http://localhost:${E2E_PORT}/" 2>/dev/null; then
  echo "FAIL: ポート ${E2E_PORT} は既に使われている。"
  echo "      別のプロセスを検査してしまうので中止する。E2E_PORT で別のポートを指定するか、先客を止めること。"
  exit 1
fi

echo "== Playwright で一連の操作を検証 =="
pnpm --filter web exec playwright test
