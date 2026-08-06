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
#
# データの保存先はローカルの Supabase（Docker）。`pnpm exec supabase start` で
# 起動し、SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は CLI の `status -o env` から
# 都度読む（値をこのファイルに書かない。CLI が出す値は起動のたびに同じなので
# ハードコードしても意味は同じだが、コードのどこにも秘密情報の形をした文字列を
# 置かないという方針を local/CI 用の値にも一貫させる）。

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}" || {
  echo "FAIL: リポジトリルートへ移動できない: ${REPO_ROOT}"
  exit 1
}

PORT="${SMOKE_PORT:-3123}"
BASE="http://localhost:${PORT}"
WORK="$(mktemp -d)"

export AUTH_SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n')"
export DEMO_USER_EMAIL="smoke@example.com"
export DEMO_USER_PASSWORD="$(head -c 24 /dev/urandom | base64 | tr -d '\n')"
export NODE_ENV=production

echo "== ローカル Supabase を起動 =="
if ! docker info >/dev/null 2>&1; then
  echo "FAIL: Docker デーモンに接続できない。ローカル Supabase の起動には Docker が要る。"
  rm -rf "${WORK}"
  exit 1
fi
if ! pnpm exec supabase start; then
  echo "FAIL: supabase start に失敗した"
  rm -rf "${WORK}"
  exit 1
fi
pnpm exec supabase status -o env >"${WORK}/supabase.env"
# shellcheck disable=SC1091
# ここで作られる DB_URL・JWT_SECRET 等、この検査が使わない値まで環境に
# export しない（この検査が使うのは SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY だけ）。
source "${WORK}/supabase.env"
export SUPABASE_URL="${API_URL}"
export SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY}"

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

# ログインが要る画面が、Cookie 無しでどう振る舞うかをまとめて見る。
# **307 だけでは足りない。** どこへ飛ばされたかを見ないと、無関係な場所への転送や
# 転送のループでも合格してしまう。行き先が /login であることと、ログイン後に
# 元の画面へ戻すための next を覚えていることまで確かめる。
expect_login_redirect() {
  local path="$1"
  local encoded
  encoded=$(printf '%s' "${path}" | sed 's|/|%2F|g')

  check "GET ${path}（Cookie 無し）" 307 "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}${path}")"

  local location
  location=$(curl -s -D - -o /dev/null "${BASE}${path}" | grep -i '^location:' | tr -d '\r' | awk '{print $2}')
  case "${location}" in
    */login|*/login\?*) echo "  OK   ${path}: ログイン画面へ誘導 (${location})" ;;
    *) echo "  FAIL ${path}: 誘導先が違う: ${location}"; FAILURES=$((FAILURES + 1)) ;;
  esac
  case "${location}" in
    *"next=${encoded}"*) echo "  OK   ${path}: ログイン後の戻り先を覚えている" ;;
    *) echo "  FAIL ${path}: ログイン後の戻り先を覚えていない: ${location}"; FAILURES=$((FAILURES + 1)) ;;
  esac
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
# デモの入口は未ログインのトップに出ていなければ意味が無い（商談で見せる相手は
# アカウントを持っていない）。lib/demoText.ts の DEMO_ENTRY_TEXT.start と同じ値。
expect_contains "未ログインのトップにデモの入口" "デモを触ってみる" "${WORK}/home.html"
# デモを始める前に /demo を直打ちしても開かない（実利用者・無関係の訪問者に
# 他人のデモ案件を見せない）。案件IDの形だけ合っていても 404 になる。
check "GET /demo/<uuid>/photo（デモ未開始）" 404 \
  "$(curl -s -o /dev/null -w '%{http_code}' \
    "${BASE}/demo/00000000-0000-4000-8000-000000000000/photo")"
check "GET /login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/login")"
check "GET /api/health" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/health")"
check "GET /offline" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/offline")"

echo "== PWA として入れられる =="
check "GET /manifest.webmanifest" 200 "$(curl -s -o "${WORK}/manifest.json" -w '%{http_code}' "${BASE}/manifest.webmanifest")"
check "GET /sw.js" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/sw.js")"
check "GET /icon-192.png" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/icon-192.png")"
check "GET /icon-512.png" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/icon-512.png")"
expect_contains "manifest が standalone 起動" '"display":"standalone"' "${WORK}/manifest.json"
expect_contains "manifest の start_url" '"start_url":"/"' "${WORK}/manifest.json"
expect_contains "manifest に 512px アイコン" 'icon-512.png' "${WORK}/manifest.json"

echo "== 写真圧縮ライブラリを自前ホストできている =="
# lib/photo/compress.ts が libURL でここを指す。既定の外部CDN依存に戻ると
# 現場の電波状況次第で圧縮に失敗しうる（docs/failures.md 参照）。
check "GET /vendor/browser-image-compression.js" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/vendor/browser-image-compression.js")"

echo "== セキュリティヘッダ =="
for header in "strict-transport-security" "x-frame-options" "x-content-type-options" "referrer-policy" "content-security-policy"; do
  if printf '%s' "${HEADERS}" | grep -iq "^${header}:"; then
    echo "  OK   ${header}"
  else
    echo "  FAIL ${header} が無い"
    FAILURES=$((FAILURES + 1))
  fi
done

# CSP は route ごとに proxy が nonce を作って返す。ヘッダに nonce が「ある」ことと
# HTML の script タグに「その nonce と同じ値」が付いていることの両方を確かめる。
# 値を突き合わせない検査だと、値が食い違って本番で全スクリプトが止まる状態でも
# 両方「ある」なので緑になってしまう。
check_csp_and_nonce() {
  local label="$1" headers="$2" html_file="$3"
  local csp
  csp=$(printf '%s' "${headers}" | grep -i '^content-security-policy:' | tr -d '\r')

  if [ -z "${csp}" ]; then
    echo "  FAIL ${label}: content-security-policy が無い"
    FAILURES=$((FAILURES + 1))
    return
  fi

  local nonce
  nonce=$(printf '%s\n' "${csp}" | sed -nE "s/.*'nonce-([^']+)'.*/\1/p" | head -n 1)
  if [ -z "${nonce}" ]; then
    echo "  FAIL ${label}: CSP に nonce が無い"
    FAILURES=$((FAILURES + 1))
  else
    echo "  OK   ${label}: CSP が nonce を使っている"
  fi

  local script_src
  script_src=$(printf '%s' "${csp}" | tr ';' '\n' | grep 'script-src')
  case "${script_src}" in
    *unsafe-inline*)
      echo "  FAIL ${label}: script-src に 'unsafe-inline' がある"
      FAILURES=$((FAILURES + 1))
      ;;
    *) echo "  OK   ${label}: script-src に 'unsafe-inline' が無い" ;;
  esac

  case "${csp}" in
    *"frame-ancestors 'none'"*) echo "  OK   ${label}: frame-ancestors 'none'" ;;
    *) echo "  FAIL ${label}: frame-ancestors が無い"; FAILURES=$((FAILURES + 1)) ;;
  esac

  # 「nonce が何か付いている」だけでは、CSP の nonce と値が違っていても通る。
  # 値そのものが一致していることまで見る。
  if [ -n "${nonce}" ] && grep -qF "nonce=\"${nonce}\"" "${html_file}"; then
    echo "  OK   ${label}: HTML の script が CSP の nonce と一致している"
  else
    echo "  FAIL ${label}: CSP の nonce と一致する script が無い（ブラウザで JS が動かなくなる）"
    FAILURES=$((FAILURES + 1))
  fi
}

check_csp_and_nonce "/" "${HEADERS}" "${WORK}/home.html"

echo "== ログインしていなければ中に入れない =="
expect_login_redirect "/projects"

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

# ログイン後のトップ画面が、作り直しで増えた画面へ繋がっているか。
# **未ログインの本文だけを見ていると、ここは検査されない**（未ログインでは行き先を
# 出さないため）。以前ここに並んでいた4ステップは4つとも /projects を指したままで、
# 下請台帳も会社設定も出てこない旧設計の画面が本番に残っていた。
curl -s -o "${WORK}/home-logged-in.html" -H "Cookie: rea_session=${VALID}" "${BASE}/" >/dev/null
expect_contains "トップ（ログイン後）から下請台帳へ行ける" 'href="/subcontractors"' "${WORK}/home-logged-in.html"
expect_contains "トップ（ログイン後）から会社設定へ行ける" 'href="/settings/company"' "${WORK}/home-logged-in.html"
expect_contains "トップ（ログイン後）から案件へ行ける" 'href="/projects"' "${WORK}/home-logged-in.html"

# ログイン後の画面こそ CSP を確かめる価値がある。ここが nonce を受け取れないと、
# ログインした利用者の画面で JS が一切動かない。
PROJECTS_HEADERS=$(curl -s -D - -o "${WORK}/projects.html" -H "Cookie: rea_session=${VALID}" "${BASE}/projects")
check_csp_and_nonce "/projects" "${PROJECTS_HEADERS}" "${WORK}/projects.html"
# img-src が Supabase Storage のオリジンを許可していないと、撮った写真のサムネイルが
# CSP でブロックされ、ブラウザに何も表示されなくなる（docs/failures.md 参照）。
# CSP側（lib/security/csp.ts）は new URL(SUPABASE_URL).origin で正規化した値を使うため、
# ここも同じ正規化をしてから比較する（末尾スラッシュ等の差でFAILしないように）。
SUPABASE_ORIGIN=$(node -e 'console.log(new URL(process.env.SUPABASE_URL).origin)' 2>/dev/null || true)
IMG_SRC_DIRECTIVE=$(printf '%s' "${PROJECTS_HEADERS}" | grep -i "^content-security-policy:" | grep -o "img-src[^;]*")
# 正規化に失敗した場合、空文字を grep -qF に渡すと何にでもマッチしてしまい誤ってOK扱いに
# なるため、先に明示的にFAILにする（set -e を使っていないため、ここで自前に検査する）。
if [ -z "${SUPABASE_ORIGIN}" ]; then
  echo "  FAIL SUPABASE_URL（${SUPABASE_URL}）からoriginを取れない"
  FAILURES=$((FAILURES + 1))
elif printf '%s' "${IMG_SRC_DIRECTIVE}" | grep -qF "${SUPABASE_ORIGIN}"; then
  echo "  OK   CSP img-src が写真ストレージのオリジンを許可"
else
  echo "  FAIL CSP img-src が写真ストレージのオリジン（${SUPABASE_ORIGIN}）を許可していない"
  FAILURES=$((FAILURES + 1))
fi

echo "== 下請台帳 =="
# 依頼の送り先はこの画面からしか増やせない。ここが落ちると、法定項目を全部埋めても
# 「送り先が1社も無い」で送信まで到達できなくなる。
expect_login_redirect "/subcontractors"
SUBCONTRACTORS_HEADERS=$(curl -s -D - -o "${WORK}/subcontractors.html" -H "Cookie: rea_session=${VALID}" "${BASE}/subcontractors")
check "GET /subcontractors（正しいセッション）" 200 "$(printf '%s' "${SUBCONTRACTORS_HEADERS}" | head -1 | grep -o '[0-9]\{3\}')"
expect_contains "下請台帳に登録フォームが出る" "会社名" "${WORK}/subcontractors.html"

echo "== 会社設定 =="
# 請負者情報（①②の様式に印字される欄）と、法定項目の定型文の初期値を置く画面。
# /settings は proxy.ts の保護対象に足したばかりなので、素通りしないことも確かめる。
expect_login_redirect "/settings/company"
COMPANY_HEADERS=$(curl -s -D - -o "${WORK}/company.html" -H "Cookie: rea_session=${VALID}" "${BASE}/settings/company")
check "GET /settings/company（正しいセッション）" 200 "$(printf '%s' "${COMPANY_HEADERS}" | head -1 | grep -o '[0-9]\{3\}')"
expect_contains "会社設定に請負者名の欄が出る" "請負者名" "${WORK}/company.html"
expect_contains "会社設定に定型文の欄が出る" "責任施工範囲" "${WORK}/company.html"

echo "== 下請の回答画面（第三者が触る唯一の画面） =="
# /q は**ログインしていない第三者が開く唯一の画面**なので、CSP と nonce を必ず検査する
# （docs/plan-rebuild.md B3。これまで / と /projects にしか掛けていなかった）。
# nonce が本文と一致しないと、この画面だけ JS が丸ごとブロックされて回答できなくなる。
#
# 実在しないトークンを使う。UUIDの形は満たすので、isUuid の早期returnではなく
# 実際にDBまで引きに行く経路を通る（形の違う文字列だとDBに触らず素通りしてしまい、
# 検査したつもりで何も見ていないことになる。docs/failures.md 2026-08-05 の再発防止）。
MISSING_TOKEN="00000000-0000-0000-0000-000000000000"
Q_HEADERS=$(curl -s -D - -o "${WORK}/q.html" "${BASE}/q/${MISSING_TOKEN}")
check "GET /q/<実在しないトークン>" 200 "$(printf '%s' "${Q_HEADERS}" | head -1 | grep -o '[0-9]\{3\}')"
check_csp_and_nonce "/q/<token>" "${Q_HEADERS}" "${WORK}/q.html"
# 500 やスタックトレースではなく、専用の文言を出すこと（docs/plan-rebuild.md C5）。
expect_contains "/q が実在しないトークンに専用の案内を出す" "この依頼は見つかりません" "${WORK}/q.html"

# 形の違うトークン（UUIDでない）でも、500 にせず同じ案内を出す。
# 本文だけを見ると、500 の応答にたまたま同じ文言が載っていても通ってしまう
# （curl は --fail を付けない限り 500 でも成功終了する）。状態行も確かめる。
Q_GARBAGE_HEADERS=$(curl -s -D - -o "${WORK}/q-garbage.html" "${BASE}/q/not-a-uuid")
check "GET /q/<UUIDでないトークン>" 200 "$(printf '%s' "${Q_GARBAGE_HEADERS}" | head -1 | grep -o '[0-9]\{3\}')"
expect_contains "/q が形の違うトークンにも専用の案内を出す" "この依頼は見つかりません" "${WORK}/q-garbage.html"

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
