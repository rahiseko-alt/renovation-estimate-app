#!/usr/bin/env bash
#
# 起動スモーク。ビルド済みのアプリを実際に起動し、外から HTTP で叩いて受け入れ条件を機械判定する。
# CI（.github/workflows/ci.yml の smoke ジョブ）と手元の両方から、同じこのファイルを実行する
# （AGENTS.md「結合を増やさない」2：同じ処理を呼ぶ入口は1つにする）。
#
# 手元で動かす:  bash scripts/smoke.sh
#
# ここで使う AUTH_SECRET / DEMO_USER_* は、この検査の中だけで使い捨てる値を毎回生成している。
# 本物の秘密情報ではない。実値は Vercel の環境変数で注入する。

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

PORT="${SMOKE_PORT:-3123}"
BASE="http://localhost:${PORT}"
WORK="$(mktemp -d)"

export AUTH_SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n')"
export DEMO_USER_EMAIL="smoke@example.com"
export DEMO_USER_PASSWORD="$(head -c 24 /dev/urandom | base64 | tr -d '\n')"
export NODE_ENV=production

FAILURES=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  OK   ${label}  (${actual})"
  else
    echo "  FAIL ${label}  期待=${expected} 実際=${actual}"
    FAILURES=$((FAILURES + 1))
  fi
}

expect_contains() {
  local label="$1" needle="$2" file="$3"
  if grep -qF -- "${needle}" "${file}"; then
    echo "  OK   ${label}"
  else
    echo "  FAIL ${label}"
    FAILURES=$((FAILURES + 1))
  fi
}

# 先客がいると、そのプロセスを検査してしまい結果の意味が無くなる。必ず落とす。
if curl -s -o /dev/null --max-time 2 "${BASE}/" 2>/dev/null; then
  echo "FAIL: ポート ${PORT} は既に使われている。"
  echo "      別のプロセスを検査してしまうので中止する。SMOKE_PORT で別のポートを指定するか、先客を止めること。"
  rm -rf "${WORK}"
  exit 1
fi

# 独立したプロセスグループで起動し、その ID をファイルに残す。
# pnpm だけを kill すると子の next-server が生き残り、次回の検査が古いサーバを
# 叩いて「通ったように見える」事故が起きるため、グループごと落とせるようにする。
setsid bash -c 'echo $$ > "$1"; exec pnpm --filter web start --port "$2"' \
  _ "${WORK}/pgid" "${PORT}" >"${WORK}/server.log" 2>&1 &

cleanup() {
  local pgid
  pgid="$(cat "${WORK}/pgid" 2>/dev/null || true)"
  if [ -n "${pgid}" ]; then
    kill -TERM "-${pgid}" 2>/dev/null || true
    sleep 1
    kill -KILL "-${pgid}" 2>/dev/null || true
  fi
  rm -rf "${WORK}"
}
trap cleanup EXIT

ready=0
for _ in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/" || true)
  if [ "${code}" = "200" ]; then ready=1; break; fi
  sleep 2
done
if [ "${ready}" != "1" ]; then
  echo "FAIL: サーバが起動しない（最後の応答コード: ${code:-なし}）"
  cat "${WORK}/server.log"
  exit 1
fi

# 見出しのマーカーは lib/content.ts の HOME_HEADING と同じ値。片方だけ変えると落ちる。
MARKER="リフォーム見積"

echo "== 誰でも開けるページ =="
# ブラウザと同じ GET で見る。HEAD では proxy が付けるヘッダが返らない。
HEADERS=$(curl -s -D - -o "${WORK}/home.html" "${BASE}/")
check "GET /" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/")"
expect_contains "本文にマーカー '${MARKER}'" "${MARKER}" "${WORK}/home.html"
check "GET /login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/login")"
check "GET /api/health" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/health")"

echo "== PWA として入れられる =="
check "GET /manifest.webmanifest" 200 "$(curl -s -o "${WORK}/manifest.json" -w '%{http_code}' "${BASE}/manifest.webmanifest")"
check "GET /sw.js" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/sw.js")"
check "GET /icon-192.png" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/icon-192.png")"
check "GET /icon-512.png" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/icon-512.png")"
expect_contains "manifest が standalone 起動" '"display":"standalone"' "${WORK}/manifest.json"
expect_contains "manifest の start_url" '"start_url":"/"' "${WORK}/manifest.json"
expect_contains "manifest に 512px アイコン" 'icon-512.png' "${WORK}/manifest.json"

echo "== セキュリティヘッダ =="
for header in "strict-transport-security" "x-frame-options" "x-content-type-options" "referrer-policy" "content-security-policy"; do
  if printf '%s' "${HEADERS}" | grep -iq "^${header}:"; then
    echo "  OK   ${header}"
  else
    echo "  FAIL ${header} が無い"
    FAILURES=$((FAILURES + 1))
  fi
done

CSP=$(printf '%s' "${HEADERS}" | grep -i '^content-security-policy:' | tr -d '\r')
case "${CSP}" in
  *"'nonce-"*) echo "  OK   CSP が nonce を使っている" ;;
  *) echo "  FAIL CSP に nonce が無い"; FAILURES=$((FAILURES + 1)) ;;
esac
SCRIPT_SRC=$(printf '%s' "${CSP}" | tr ';' '\n' | grep 'script-src')
case "${SCRIPT_SRC}" in
  *unsafe-inline*) echo "  FAIL script-src に 'unsafe-inline' がある"; FAILURES=$((FAILURES + 1)) ;;
  *) echo "  OK   script-src に 'unsafe-inline' が無い" ;;
esac
case "${CSP}" in
  *"frame-ancestors 'none'"*) echo "  OK   frame-ancestors 'none'" ;;
  *) echo "  FAIL frame-ancestors が無い"; FAILURES=$((FAILURES + 1)) ;;
esac
# nonce が実際に script タグに付いていないと、ブラウザ側で全スクリプトが止まる
if grep -qE '<script[^>]*nonce="' "${WORK}/home.html"; then
  echo "  OK   HTML の script に nonce が付いている"
else
  echo "  FAIL script に nonce が付いていない（ブラウザで JS が動かなくなる）"
  FAILURES=$((FAILURES + 1))
fi

echo "== ログインしていなければ中に入れない =="
check "GET /projects（Cookie 無し）" 307 "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/projects")"
LOCATION=$(curl -s -D - -o /dev/null "${BASE}/projects" | grep -i '^location:' | tr -d '\r' | awk '{print $2}')
case "${LOCATION}" in
  */login) echo "  OK   ログイン画面へ誘導 (${LOCATION})" ;;
  *) echo "  FAIL 誘導先が違う: ${LOCATION}"; FAILURES=$((FAILURES + 1)) ;;
esac

# セッションはアプリの外で組み立てる。アプリの実装を借りずに検査する。
make_session() {
  SESSION_SUB="$1" SESSION_OFFSET="$2" node -e '
    const crypto = require("node:crypto");
    const b64 = (value) => Buffer.from(value).toString("base64url");
    const body = b64(JSON.stringify({
      sub: process.env.SESSION_SUB,
      exp: Math.floor(Date.now() / 1000) + Number(process.env.SESSION_OFFSET),
    }));
    const signature = crypto
      .createHmac("sha256", process.env.AUTH_SECRET)
      .update(body)
      .digest("base64url");
    process.stdout.write(body + "." + signature);
  '
}

echo "== 正しいセッションなら通す =="
VALID=$(make_session "${DEMO_USER_EMAIL}" 600)
check "GET /projects（正しいセッション）" 200 "$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: rea_session=${VALID}" "${BASE}/projects")"

echo "== 偽物・期限切れは弾く =="
FORGED=$(node -e '
  const b64 = (value) => Buffer.from(value).toString("base64url");
  const body = b64(JSON.stringify({ sub: "attacker@example.com", exp: Math.floor(Date.now()/1000) + 600 }));
  process.stdout.write(body + ".ZmFrZXNpZ25hdHVyZQ");
')
check "GET /projects（署名が偽物）" 307 "$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: rea_session=${FORGED}" "${BASE}/projects")"

EXPIRED=$(make_session "${DEMO_USER_EMAIL}" -10)
check "GET /projects（署名は正しいが期限切れ）" 307 "$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: rea_session=${EXPIRED}" "${BASE}/projects")"

check "GET /projects（形の違う Cookie）" 307 "$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: rea_session=garbage" "${BASE}/projects")"

echo
if [ "${FAILURES}" -eq 0 ]; then
  echo "SMOKE OK: すべて期待どおり"
  exit 0
fi
echo "SMOKE FAIL: ${FAILURES} 件"
exit 1
