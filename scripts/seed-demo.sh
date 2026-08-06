#!/usr/bin/env bash
#
# デモ用の初期データを入れる（docs/plan-rebuild.md PR-C の5）。
# 実体は apps/web/scripts/seed-demo.mjs。ここは Supabase の接続情報を渡す役だけを持つ
# （AGENTS.md「結合を増やさない」2：同じ処理を呼ぶ入口は1つにする）。
#
# 使い方: DEMO_USER_EMAIL=<ログインする利用者のメール> bash scripts/seed-demo.sh
#
# @supabase/supabase-js は apps/web の依存で、Node は import をファイルの位置から
# 解決する。だからスクリプト本体を apps/web/scripts/ に置いている。

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}" || exit 1

if [ -z "${DEMO_USER_EMAIL:-}" ]; then
  echo "FAIL: DEMO_USER_EMAIL が未設定。ログインする利用者と同じメールアドレスを渡すこと。"
  exit 1
fi

status_output="$(pnpm exec supabase status -o env)" || {
  echo "FAIL: supabase status に失敗した。先に pnpm exec supabase start を実行すること。"
  exit 1
}
eval "${status_output}"
if [ -z "${API_URL:-}" ] || [ -z "${SERVICE_ROLE_KEY:-}" ]; then
  echo "FAIL: supabase status から API_URL / SERVICE_ROLE_KEY を取得できない"
  exit 1
fi

export SUPABASE_URL="${API_URL}"
export SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY}"
export DEMO_USER_EMAIL
pnpm --filter web exec node scripts/seed-demo.mjs
