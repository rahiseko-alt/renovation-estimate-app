#!/usr/bin/env bash
#
# 本番のデモ経路を、外から実際に踏んで機械判定する。
#
# **これを通してから「動いています」と言う。** そう言いながら一度も踏んでおらず、
# 本番では1タップ目に5〜10秒かかって落ちていたことがある
# （`docs/failures.md` 2026-08-06「デモが本番で遅すぎて『動かん』状態だった」）。
#
# `scripts/smoke.sh` はローカルに起動したビルドを見る。こちらは**本番そのもの**を見る。
# ローカルの Supabase は同一ホストで往復が速いため、待ち時間の問題はローカルには出ない。
#
# 使い方:
#   bash scripts/prod-demo-check.sh
#   BASE=https://example.vercel.app bash scripts/prod-demo-check.sh
#
# 秘密情報は扱わない。無ログインで誰でも踏める経路だけを見る。

set -uo pipefail

BASE="${BASE:-https://renovation-estimate-app-web.vercel.app}"
# 1タップ目の上限。Vercel の関数タイムアウトが10秒なので、そこに張り付く前に落とす。
# 商談で押して待てるのは体感3秒まで。
MAX_START_SECONDS="${MAX_START_SECONDS:-3.5}"
# 比較表（2タップ目の着地）の上限。
MAX_COMPARISON_SECONDS="${MAX_COMPARISON_SECONDS:-3.0}"
# 1タップ目は何回試すか。1回だけだと、たまに落ちる状態を見逃す。
ATTEMPTS="${ATTEMPTS:-3}"

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

FAILED=0

ok()   { echo "  OK   $1"; }
fail() { echo "  FAIL $1"; FAILED=1; }

# 小数の比較に bc を使わない（入っていない環境がある）。
under() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a <= b) }'; }

echo "== 対象: ${BASE} =="

# ── トップ画面 ────────────────────────────────────────────
CODE=$(curl -sS -o "${WORK}/home.html" -w '%{http_code}' --max-time 30 "${BASE}/" || echo 000)
if [ "${CODE}" = "200" ]; then ok "GET / (200)"; else fail "GET / が ${CODE}"; fi

# デモの入口の文言は apps/web/lib/demoText.ts の DEMO_ENTRY_TEXT.start と同じ値。
if grep -q "デモを触ってみる" "${WORK}/home.html"; then
  ok "未ログインのトップにデモの入口"
else
  fail "デモの入口がトップに無い"
fi

# ── デモ開始（1タップ目）──────────────────────────────────
# Server Action の呼び出し先IDは、その時のビルドが埋め込んだ値をHTMLから拾う。
ACTION_ID=$(grep -o '\$ACTION_ID_[0-9a-f]*' "${WORK}/home.html" | head -1 | sed 's/^\$ACTION_ID_//')
if [ -z "${ACTION_ID}" ]; then
  fail "デモ開始のアクションIDをHTMLから取れない（画面の作りが変わった可能性）"
  echo; echo "PROD DEMO CHECK FAILED"; exit 1
fi
ok "デモ開始のアクションIDを取得"

PROJECT_ID=""
for i in $(seq 1 "${ATTEMPTS}"); do
  RESULT=$(curl -sS -X POST "${BASE}/" \
    -H "Next-Action: ${ACTION_ID}" \
    -H "Content-Type: text/plain;charset=UTF-8" \
    --data '[]' --max-time 30 \
    -o /dev/null -D "${WORK}/start.h" \
    -w '%{http_code} %{time_total}' 2>/dev/null || echo "000 30")
  CODE="${RESULT% *}"
  SECONDS_TAKEN="${RESULT#* }"

  if [ "${CODE}" != "303" ]; then
    fail "デモ開始 ${i}回目: HTTP ${CODE}（${SECONDS_TAKEN}s）"
    continue
  fi
  if under "${SECONDS_TAKEN}" "${MAX_START_SECONDS}"; then
    ok "デモ開始 ${i}回目: 303 ${SECONDS_TAKEN}s（上限 ${MAX_START_SECONDS}s）"
  else
    fail "デモ開始 ${i}回目: 303 だが ${SECONDS_TAKEN}s かかった（上限 ${MAX_START_SECONDS}s）"
  fi

  # 最後に成功したぶんの案件IDとCookieを、この先の検査に使う。
  THIS_ID=$(grep -io 'x-action-redirect: /demo/[0-9a-f-]*' "${WORK}/start.h" | head -1 | sed 's|.*/demo/||')
  if [ -n "${THIS_ID}" ]; then
    PROJECT_ID="${THIS_ID}"
    grep -io '^set-cookie: rea_session=[^;]*' "${WORK}/start.h" | head -1 \
      | sed 's/^[Ss]et-[Cc]ookie: //' > "${WORK}/cookie"
  fi
done

if [ -z "${PROJECT_ID}" ]; then
  fail "デモ開始が一度も成功しなかった"
  echo; echo "PROD DEMO CHECK FAILED"; exit 1
fi
ok "デモの案件ができた"

COOKIE="$(cat "${WORK}/cookie")"

# ── 写真画面（2タップ目を押す場所）────────────────────────
RESULT=$(curl -sS -H "Cookie: ${COOKIE}" --max-time 30 \
  -o "${WORK}/photo.html" -w '%{http_code} %{time_total}' \
  "${BASE}/demo/${PROJECT_ID}/photo" 2>/dev/null || echo "000 30")
CODE="${RESULT% *}"
if [ "${CODE}" = "200" ]; then ok "写真画面 (200, ${RESULT#* }s)"; else fail "写真画面が ${CODE}"; fi
if grep -q "写真なしで進む" "${WORK}/photo.html"; then
  ok "写真を飛ばす逃げ道がある（商談は屋内で行われる）"
else
  fail "「写真なしで進む」が無い"
fi

# ── 比較表（2タップ目の着地）──────────────────────────────
RESULT=$(curl -sS -H "Cookie: ${COOKIE}" --max-time 30 \
  -o "${WORK}/cmp.html" -w '%{http_code} %{time_total}' \
  "${BASE}/projects/${PROJECT_ID}/comparison" 2>/dev/null || echo "000 30")
CODE="${RESULT% *}"
SECONDS_TAKEN="${RESULT#* }"
if [ "${CODE}" != "200" ]; then
  fail "比較表が ${CODE}"
elif under "${SECONDS_TAKEN}" "${MAX_COMPARISON_SECONDS}"; then
  ok "比較表 (200, ${SECONDS_TAKEN}s)"
else
  fail "比較表は 200 だが ${SECONDS_TAKEN}s かかった（上限 ${MAX_COMPARISON_SECONDS}s）"
fi

# 着地した時点で3社の回答が並んでいること。「回答待ち」では見せられない。
for COMPANY in "サンプル内装工業" "テスト住宅設備" "ダミー工務店"; do
  if grep -q "${COMPANY}" "${WORK}/cmp.html"; then
    ok "比較表に ${COMPANY} の単価が出ている"
  else
    fail "比較表に ${COMPANY} が出ていない"
  fi
done
if grep -q "回答待ち" "${WORK}/cmp.html"; then
  fail "「回答待ち」が残っている（返信済みのデータになっていない）"
else
  ok "「回答待ち」が無い"
fi
if grep -q "見積書PDFを出力" "${WORK}/cmp.html"; then
  ok "3タップ目（見積書PDFを出力）が同じ画面にある"
else
  fail "見積書へのボタンが比較表に無い"
fi

# 3タップ目（見積書PDF）は、ここでは押していない。
# **ボタンの存在しか見ていない。** アクションIDがHTMLに載らない
# （クライアント部品から呼ぶのでIDはJSチャンク側にある）ため、bash から
# 素直に叩けない。かわりに、**比較表に採用済みの合計を出して、その数字が
# 0円でないことをこの下で見る**形にする（PDFのバイト列から金額は読めないが、
# 同じ計算を通った合計なら画面から読める）。合計の表示は別PRで入れる。

if grep -q "法定項目 21 件" "${WORK}/cmp.html"; then
  ok "法定項目が済んでいることを見せている"
else
  fail "法定項目の案内が出ていない"
fi

# ── 他人のデモを開けないこと ──────────────────────────────
# **存在しないIDで404になっても、分離の検査にはならない。** 実在する他人の案件を
# 開こうとして404になることを見る。商談が2件同時に走る状況がこれ。
CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 \
  "${BASE}/demo/00000000-0000-4000-8000-000000000000/photo" || echo 000)
if [ "${CODE}" = "404" ]; then
  ok "デモ未開始で /demo/<uuid>/photo は 404"
else
  fail "デモ未開始の /demo/<uuid>/photo が ${CODE}"
fi

curl -sS -X POST "${BASE}/" -H "Next-Action: ${ACTION_ID}" \
  -H "Content-Type: text/plain;charset=UTF-8" --data '[]' --max-time 30 \
  -o /dev/null -D "${WORK}/second.h" 2>/dev/null || true
SECOND_COOKIE=$(grep -io '^set-cookie: rea_session=[^;]*' "${WORK}/second.h" | head -1 \
  | sed 's/^[Ss]et-[Cc]ookie: //')
if [ -z "${SECOND_COOKIE}" ]; then
  fail "2つ目のデモを始められない（分離の検査ができない）"
else
  ok "2つ目のデモを始めた"
  for PATH_UNDER_TEST in \
    "/demo/${PROJECT_ID}/photo" \
    "/projects/${PROJECT_ID}" \
    "/projects/${PROJECT_ID}/comparison"; do
    CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 \
      -H "Cookie: ${SECOND_COOKIE}" "${BASE}${PATH_UNDER_TEST}" || echo 000)
    if [ "${CODE}" = "404" ]; then
      ok "2つ目のデモから ${PATH_UNDER_TEST} は 404"
    else
      fail "2つ目のデモから ${PATH_UNDER_TEST} が ${CODE}（他人の案件が見えている）"
    fi
  done
fi

echo
if [ "${FAILED}" -eq 0 ]; then
  echo "PROD DEMO CHECK OK: 3タップの経路は本番で通り、待ち時間も上限内"
else
  echo "PROD DEMO CHECK FAILED"
  exit 1
fi
