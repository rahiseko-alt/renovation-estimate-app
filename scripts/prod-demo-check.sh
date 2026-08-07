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
# 踏む順番は `docs/flows.md`「デモの画面の並び」（D1〜D9）が正。**この表に無い画面・
# ボタン・遷移は検査にも書かない**（検査が先に増えると、実装がそれに引きずられる）。
#
#   D1 トップ「デモを触ってみる」        → POST /demo/start（303）
#   D2 /demo/<id>/photo                  「写真なしで進む」
#   D3 /projects/<id>/document           保存 / 送信 / 修正
#   D4 /projects/<id>/sent               ロード中を流して自動で D5 へ
#   D5 /projects/<id>/received           「見積もりを見る」
#   D7 /projects/<id>/quotes             社ごとの一覧
#   D6 /projects/<id>/quotes/<requestId> 1社ずつ。明細ごとに採用/保留
#   D9 見積書PDF                         /projects/<id>/comparison の合計で代用（下記）
#
# 使い方:
#   bash scripts/prod-demo-check.sh
#   BASE=https://example.vercel.app bash scripts/prod-demo-check.sh
#
# 秘密情報は扱わない。無ログインで誰でも踏める経路だけを見る。

set -uo pipefail

BASE="${BASE:-https://renovation-estimate-app-web.vercel.app}"
# 1タップ目（D1）の上限。Vercel の関数タイムアウトが10秒なので、そこに張り付く前に落とす。
# 商談で押して待てるのは体感3秒まで。
MAX_START_SECONDS="${MAX_START_SECONDS:-3.5}"
# 下請け見積もり一覧（D7）の上限。**着地して一覧が出るまでが体感の要**なので、
# 経路の中でここに上限を掛ける（以前は比較表に掛けていた。比較表はもう表の経路に無い）。
MAX_QUOTES_SECONDS="${MAX_QUOTES_SECONDS:-3.0}"
# 1タップ目は何回試すか。1回だけだと、たまに落ちる状態を見逃す。
ATTEMPTS="${ATTEMPTS:-3}"

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

FAILED=0

ok()   { echo "  OK   $1"; }
fail() { echo "  FAIL $1"; FAILED=1; }

# 小数の比較に bc を使わない（入っていない環境がある）。
under() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a <= b) }'; }

# 画面を1つ GET して、応答コードと本文を取る。時間は呼び出し側が使う（"<code> <秒>"）。
# 文字列の照合は grep -F（固定文字列）で行う。文言に正規表現の特殊文字が混ざっても
# 意味が変わらないようにするため。
fetch() {
  local out="$1" url="$2"
  curl -sS -H "Cookie: ${COOKIE}" --max-time 30 \
    -o "${out}" -w '%{http_code} %{time_total}' "${url}" 2>/dev/null || echo "000 30"
}

# ボタンの文字が**部品の中身として**出ていることを見る。
# **素の grep では中身のない検査になる。** 説明文が同じ語を含んでいるため
# （D3 は「数量を直したいときは『修正』を押してください」、D6 は「『採用』か『保留』を
#  選んでください」）、ボタンを消しても本文だけで通ってしまう。
# tr '<' '\n' でタグごとに切ると、部品の中身はその断片の末尾に来る（例: `button ...>採用`）。
# 説明文の断片は文末まで続くので、末尾一致にならない。
# React が描画の間に挟むコメントノードも、この切り方なら断片の末尾が変わらない。
has_label() {
  local file="$1" label="$2"
  tr '<' '\n' < "${file}" | grep -q ">${label}$"
}

echo "== 対象: ${BASE} =="

# ── D1 トップ画面 ─────────────────────────────────────────
CODE=$(curl -sS -o "${WORK}/home.html" -w '%{http_code}' --max-time 30 "${BASE}/" || echo 000)
if [ "${CODE}" = "200" ]; then ok "D1 GET / (200)"; else fail "D1 GET / が ${CODE}"; fi

# デモの入口の文言は apps/web/lib/demoText.ts の DEMO_ENTRY_TEXT.start と同じ値。
if grep -qF "デモを触ってみる" "${WORK}/home.html"; then
  ok "D1 未ログインのトップにデモの入口"
else
  fail "D1 デモの入口がトップに無い"
fi

# ── D1 デモ開始 ───────────────────────────────────────────
# 素のフォームが POST する先。**ビルドで変わらないURL**なので固定で叩ける
# （以前は Server Action のIDをHTMLから拾っていた。IDはビルドごとに変わるため、
#  古いページを開いたままのブラウザからは押しても無反応になった。
#  apps/web/app/demo/start/route.ts の冒頭を見る）。
# 値は apps/web/lib/demoText.ts の DEMO_START_PATH と同じ。
START_PATH="/demo/start"
# **method も一緒に見る。** action だけを見ると、GET のフォームでも通ってしまう
# （/demo/start は POST しか受けないので、GET になった時点で経路が死ぬ）。
# 属性の並び順はビルドで変わりうるので、同じ <form ...> の中に両方あることを見る。
if tr '<' '\n' < "${WORK}/home.html" \
  | grep -i '^form ' \
  | grep -q "action=\"${START_PATH}\".*method=\"post\"\|method=\"post\".*action=\"${START_PATH}\""; then
  ok "D1 デモ開始のフォームが ${START_PATH} へ POST する"
else
  fail "D1 トップに ${START_PATH} へ POST するフォームが無い（画面の作りが変わった可能性）"
  echo; echo "PROD DEMO CHECK FAILED"; exit 1
fi

PROJECT_ID=""
for i in $(seq 1 "${ATTEMPTS}"); do
  # Origin を付ける。ルートハンドラは同一オリジンからの POST しか通さない
  # （Server Action が自前でやっていた判定を、こちらでも持っている）。
  RESULT=$(curl -sS -X POST "${BASE}${START_PATH}" \
    -H "Origin: ${BASE}" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data '' --max-time 30 \
    -o /dev/null -D "${WORK}/start.h" \
    -w '%{http_code} %{time_total}' 2>/dev/null || echo "000 30")
  CODE="${RESULT% *}"
  SECONDS_TAKEN="${RESULT#* }"

  if [ "${CODE}" != "303" ]; then
    fail "D1 デモ開始 ${i}回目: HTTP ${CODE}（${SECONDS_TAKEN}s）"
    continue
  fi
  if under "${SECONDS_TAKEN}" "${MAX_START_SECONDS}"; then
    ok "D1 デモ開始 ${i}回目: 303 ${SECONDS_TAKEN}s（上限 ${MAX_START_SECONDS}s）"
  else
    fail "D1 デモ開始 ${i}回目: 303 だが ${SECONDS_TAKEN}s かかった（上限 ${MAX_START_SECONDS}s）"
  fi

  # 最後に成功したぶんの案件IDとCookieを、この先の検査に使う。
  THIS_ID=$(grep -io 'location:.*/demo/[0-9a-f-]*' "${WORK}/start.h" | head -1 | sed 's|.*/demo/||')
  if [ -n "${THIS_ID}" ]; then
    PROJECT_ID="${THIS_ID}"
    grep -io '^set-cookie: rea_session=[^;]*' "${WORK}/start.h" | head -1 \
      | sed 's/^[Ss]et-[Cc]ookie: //' > "${WORK}/cookie"
  fi
done

if [ -z "${PROJECT_ID}" ]; then
  fail "D1 デモ開始が一度も成功しなかった"
  echo; echo "PROD DEMO CHECK FAILED"; exit 1
fi
ok "D1 デモの案件ができた"

COOKIE="$(cat "${WORK}/cookie")"

# ── D2 写真を撮る ─────────────────────────────────────────
RESULT=$(fetch "${WORK}/photo.html" "${BASE}/demo/${PROJECT_ID}/photo")
CODE="${RESULT% *}"
if [ "${CODE}" = "200" ]; then ok "D2 写真画面 (200, ${RESULT#* }s)"; else fail "D2 写真画面が ${CODE}"; fi
# 文言は apps/web/lib/demoText.ts の DEMO_PHOTO_TEXT.skip と同じ値。
if grep -qF "写真なしで進む" "${WORK}/photo.html"; then
  ok "D2 写真を飛ばす逃げ道がある（商談は屋内で行われる）"
else
  fail "D2 「写真なしで進む」が無い"
fi
# **D2 の行き先は HTML から確かめられない。** 進むのはクライアント側の router.push で、
# 行き先はJSチャンクの中にある（apps/web/components/DemoPhotoStep.tsx）。
# かわりに、表のとおりの次の画面 D3 をこの案件で直接 GET する。

# ── D3 確認画面（保存 / 送信 / 修正）──────────────────────
RESULT=$(fetch "${WORK}/document.html" "${BASE}/projects/${PROJECT_ID}/document")
CODE="${RESULT% *}"
if [ "${CODE}" = "200" ]; then
  ok "D3 確認画面 (200, ${RESULT#* }s)"
else
  fail "D3 確認画面が ${CODE}"
fi
# 文言は apps/web/lib/flowText.ts の DOCUMENT_CONFIRM_TEXT と同じ値。
# ボタンは**この3つだけ**（docs/flows.md の表）。増えたらそちらを先に直す。
if grep -qF "この内容で下請けに出します" "${WORK}/document.html"; then
  ok "D3 見出しが出ている"
else
  fail "D3 見出しが無い（画面の作りが変わった可能性）"
fi
for BUTTON in "保存" "送信" "修正"; do
  if has_label "${WORK}/document.html" "${BUTTON}"; then
    ok "D3 「${BUTTON}」のボタンがある"
  else
    fail "D3 「${BUTTON}」のボタンが無い"
  fi
done

# ── D4 送信しました（デモ）────────────────────────────────
# **D3 の「送信」そのものは押していない。** 送信は Server Action（sendFromDocumentAction）で、
# 呼び出し先IDはHTMLに載らない（クライアント部品から呼ぶのでIDはJSチャンク側にある）ため、
# bash から素直に叩けない。3タップ時代に見積書PDFを押さず比較表の合計で代用したのと同じ判断。
# かわりに、送信後に着地する D4 と、そこから自動で進む D5 を**直接 GET して**
# 画面が生きていることを見る（押せないのは送信の1回だけで、以降の画面は踏める）。
# デモの初期状態には既に依頼グループと3社の回答が入っているので、送信を押さなくても
# D5・D7・D6 の中身はそろっている（apps/web/lib/db/demoSeed.ts）。
RESULT=$(fetch "${WORK}/sent.html" "${BASE}/projects/${PROJECT_ID}/sent")
CODE="${RESULT% *}"
if [ "${CODE}" = "200" ]; then
  ok "D4 送信しました (200, ${RESULT#* }s)"
else
  fail "D4 送信しましたが ${CODE}"
fi
# 文言は apps/web/lib/flowText.ts の SENT_TEXT.heading / loading と同じ値。
if grep -qF "送信しました（デモ）" "${WORK}/sent.html"; then
  ok "D4 見出しが出ている"
else
  fail "D4 見出しが無い"
fi
if grep -qF "ロード中（デモ）" "${WORK}/sent.html"; then
  ok "D4 ロード中を流している（3秒後に D5 へ自動で進む）"
else
  fail "D4 ロード中が無い（D5 へ自動で進まない可能性）"
fi

# ── D5 受信しました（デモ）────────────────────────────────
RESULT=$(fetch "${WORK}/received.html" "${BASE}/projects/${PROJECT_ID}/received")
CODE="${RESULT% *}"
if [ "${CODE}" = "200" ]; then
  ok "D5 受信しました (200, ${RESULT#* }s)"
else
  fail "D5 受信しましたが ${CODE}"
fi
# 文言は apps/web/lib/flowText.ts の RECEIVED_TEXT.heading / toQuotes と同じ値。
if grep -qF "受信しました（デモ）" "${WORK}/received.html"; then
  ok "D5 見出しが出ている"
else
  fail "D5 見出しが無い"
fi
if grep -qF "見積もりを見る" "${WORK}/received.html"; then
  ok "D5 「見積もりを見る」がある（D6 の入口）"
else
  fail "D5 「見積もりを見る」が無い"
fi

# ── D7 下請け見積もり一覧 ─────────────────────────────────
# **待ち時間の上限はここに掛ける。** 押してから一覧が出るまでが体感の要。
RESULT=$(fetch "${WORK}/quotes.html" "${BASE}/projects/${PROJECT_ID}/quotes")
CODE="${RESULT% *}"
SECONDS_TAKEN="${RESULT#* }"
if [ "${CODE}" != "200" ]; then
  fail "D7 見積もり一覧が ${CODE}"
elif under "${SECONDS_TAKEN}" "${MAX_QUOTES_SECONDS}"; then
  ok "D7 見積もり一覧 (200, ${SECONDS_TAKEN}s)"
else
  fail "D7 見積もり一覧は 200 だが ${SECONDS_TAKEN}s かかった（上限 ${MAX_QUOTES_SECONDS}s）"
fi

# 文言は apps/web/lib/flowText.ts の QUOTE_LIST_TEXT.heading / empty と同じ値。
if grep -qF "下請けの見積もり一覧" "${WORK}/quotes.html"; then
  ok "D7 見出しが出ている"
else
  fail "D7 見出しが無い（画面の作りが変わった可能性）"
fi
# 着地した時点で3社ぶんが並んでいること。1社も届いていない状態では見せられない。
for COMPANY in "業者A" "業者B" "業者C"; do
  if grep -qF "${COMPANY}" "${WORK}/quotes.html"; then
    ok "D7 一覧に ${COMPANY} が出ている"
  else
    fail "D7 一覧に ${COMPANY} が出ていない"
  fi
done
if grep -qF "まだ見積もりが届いていません。" "${WORK}/quotes.html"; then
  fail "D7 「まだ見積もりが届いていません。」が出ている（返信済みのデータになっていない）"
else
  ok "D7 「まだ見積もりが届いていません。」が出ていない"
fi

# ── D6 見積もり書類（1社ずつ）──────────────────────────────
# 依頼IDはデモを始めるたびに変わるので、**D7 の HTML に出ているリンクから拾う**
# （固定で書けない。ここだけは画面から拾うしかない）。
REQUEST_ID=$(grep -o "/projects/${PROJECT_ID}/quotes/[0-9a-f-]\{36\}" "${WORK}/quotes.html" \
  | head -1 | sed 's|.*/||')
if [ -z "${REQUEST_ID}" ]; then
  fail "D6 一覧から1社ぶんのリンクを拾えない（D6 へ入れない）"
else
  RESULT=$(fetch "${WORK}/quote.html" "${BASE}/projects/${PROJECT_ID}/quotes/${REQUEST_ID}")
  CODE="${RESULT% *}"
  if [ "${CODE}" = "200" ]; then
    ok "D6 見積もり書類 (200, ${RESULT#* }s)"
  else
    fail "D6 見積もり書類が ${CODE}"
  fi
  # 文言は apps/web/lib/flowText.ts の QUOTE_DOCUMENT_TEXT.adopt / hold / toList と同じ値。
  # **画面が移るのは「一覧へ」だけ**（採用・保留を押しても移らない。docs/flows.md の表）。
  for LABEL in "採用" "保留" "一覧へ"; do
    if has_label "${WORK}/quote.html" "${LABEL}"; then
      ok "D6 「${LABEL}」のボタンがある"
    else
      fail "D6 「${LABEL}」のボタンが無い"
    fi
  done
fi

# ── D9 見積書PDF（合計で代用）─────────────────────────────
# **PDFそのものは押していない。** 出力は Server Action で、呼び出し先IDがHTMLに載らない
# （クライアント部品から呼ぶのでIDはJSチャンク側にある）ため bash から素直に叩けない。
# かわりに **/projects/<id>/comparison に出ている採用済みの合計**を見る。この合計と
# 見積書は同じ計算（apps/web/lib/db/pricedEstimate.ts）を通るので、ここが0円でなければ
# 書類も0円ではない。**0円のまま書類が出る事故を外から捕まえられる唯一の場所**
# （PDFのバイト列から金額は読めない。docs/failures.md 2026-08-06）。
#
# 比較表そのものはデモの画面の並び（D1〜D9）に入っていないので、**この画面で見るのは
# 金額だけ**にしてある。以前ここで見ていた3社の並びと回答済みの判定は、消したのではなく
# D7 に移した（上の「D7 一覧に 業者A/B/C」と「まだ見積もりが届いていません。が出ていない」）。
RESULT=$(fetch "${WORK}/cmp.html" "${BASE}/projects/${PROJECT_ID}/comparison")
CODE="${RESULT% *}"
if [ "${CODE}" != "200" ]; then
  fail "D9 合計を読む画面が ${CODE}"
else
  ok "D9 合計を読む画面 (200, ${RESULT#* }s)"
fi

# ラベルは apps/web/lib/quoteFlowText.ts の COMPARISON_TEXT.adoptedTotalLabel と同じ値。
TOTAL_LABEL="採用中の合計（税込）"
if ! grep -qF "${TOTAL_LABEL}" "${WORK}/cmp.html"; then
  fail "D9 「${TOTAL_LABEL}」が無い（画面の作りが変わった可能性）"
else
  # ラベルの直後に出る「1,234,567円」から数字だけを取り出す。
  # HTMLコメントを先に落とす。React は隣り合う描画の間にコメントノードを挟むことがあり、
  # 残したままだと数字と「円」が別々に見える（実際にそれで読めなかった）。
  TOTAL_YEN=$(sed 's/<!--[^>]*-->//g' "${WORK}/cmp.html" \
    | tr '<' '\n' \
    | sed -n "/${TOTAL_LABEL}/,\$p" \
    | grep -o '[0-9][0-9,]*円' | head -1 | tr -d ',円')
  if [ -z "${TOTAL_YEN}" ]; then
    fail "D9 「${TOTAL_LABEL}」の金額を読めない"
  elif [ "${TOTAL_YEN}" -gt 0 ]; then
    ok "D9 採用済みの合計が ${TOTAL_YEN}円（0円ではない）"
  else
    fail "D9 採用済みの合計が 0円（見積書も0円で出る）"
  fi
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

curl -sS -X POST "${BASE}${START_PATH}" -H "Origin: ${BASE}" \
  -H "Content-Type: application/x-www-form-urlencoded" --data '' --max-time 30 \
  -o /dev/null -D "${WORK}/second.h" 2>/dev/null || true
SECOND_COOKIE=$(grep -io '^set-cookie: rea_session=[^;]*' "${WORK}/second.h" | head -1 \
  | sed 's/^[Ss]et-[Cc]ookie: //')
if [ -z "${SECOND_COOKIE}" ]; then
  fail "2つ目のデモを始められない（分離の検査ができない）"
else
  ok "2つ目のデモを始めた"
  # 経路に出てくる画面を全部並べる。1つでも開くと、商談が2件同時に走ったときに
  # 相手の案件が見える。
  ISOLATION_PATHS=(
    "/demo/${PROJECT_ID}/photo"
    "/projects/${PROJECT_ID}"
    "/projects/${PROJECT_ID}/document"
    "/projects/${PROJECT_ID}/sent"
    "/projects/${PROJECT_ID}/received"
    "/projects/${PROJECT_ID}/quotes"
    "/projects/${PROJECT_ID}/comparison"
  )
  if [ -n "${REQUEST_ID}" ]; then
    ISOLATION_PATHS+=("/projects/${PROJECT_ID}/quotes/${REQUEST_ID}")
  fi
  for PATH_UNDER_TEST in "${ISOLATION_PATHS[@]}"; do
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
  echo "PROD DEMO CHECK OK: D1〜D7 の経路は本番で通り、待ち時間も上限内（D9 は合計で代用）"
else
  echo "PROD DEMO CHECK FAILED"
  exit 1
fi
