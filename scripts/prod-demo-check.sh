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
# 踏む順番は `docs/flows.md`「デモの画面の並び」（D1〜D10）が正。**この表に無い画面・
# ボタン・遷移は検査にも書かない**（検査が先に増えると、実装がそれに引きずられる）。
#
#   D1  トップ「デモを触ってみる」        → POST /demo/start（303）
#   D2  /demo/<id>/project                施主名・現場住所（見本入り）＋「次へ」
#   D3  /demo/<id>/photo                  工事の枠＋「写真なしで進む」「次へ」
#   D4  /projects/<id>/document           見積回答期限＋ 保存 / 送信 / 修正
#   D5  /projects/<id>/sent               ロード中を流して自動で D6 へ
#   D6  /projects/<id>/received           「見積もりを見る」
#   D7  /projects/<id>/quotes             社ごとの一覧＋明細の採用/保留＋「見積書を出す」
#   D8  /projects/<id>/quotes/<requestId> 1社ずつ。明細ごとに採用/保留
#   D9  /drafts                           D4 の「保存」から降りる下書き保存フォルダ
#   D10 見積書PDF                         D7 の「見積書を出す」から降りてくる
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
#
# 照合は**固定文字列**で行う。grep に渡すと文言が正規表現として解釈されるため、
# 文言に `.` や `(` が入った日に、意図と違うものに当たる（または当たらなくなる）。
# awk の substr 比較は固定文字列なので、その揺れが起きない。
has_label() {
  local file="$1" label="$2"
  tr '<' '\n' < "${file}" | awk -v needle=">${label}" '
    {
      n = length(needle)
      if (length($0) >= n && substr($0, length($0) - n + 1) == needle) {
        found = 1
        exit
      }
    }
    END { exit !found }
  '
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

# ── D2 案件をつくる ───────────────────────────────────────
# **1タップ目の着地はここ**（2026-08-07 に写真の画面から変わった）。
RESULT=$(fetch "${WORK}/project.html" "${BASE}/demo/${PROJECT_ID}/project")
CODE="${RESULT% *}"
if [ "${CODE}" = "200" ]; then
  ok "D2 案件をつくる (200, ${RESULT#* }s)"
else
  fail "D2 案件をつくるが ${CODE}"
fi
# 文言は apps/web/lib/flowText.ts の PROJECT_STEP_TEXT.heading と同じ値。
if grep -qF "案件をつくる" "${WORK}/project.html"; then
  ok "D2 見出しが出ている"
else
  fail "D2 見出しが無い（画面の作りが変わった可能性）"
fi
# 入力欄が**見本入りで開く**こと（利用者の回答 ③B）。空で開くと商談の相手に打たせる
# ことになる。value が空文字・属性ごと無いのどちらでも落ちる。
# 施主名の欄は apps/web/app/demo/[projectId]/project/page.tsx の id="customerName"。
CUSTOMER_TAG=$(tr '<' '\n' < "${WORK}/project.html" | grep 'id="customerName"' | head -1)
CUSTOMER_VALUE=$(printf '%s' "${CUSTOMER_TAG}" | sed -n 's/.*value="\([^"]*\)".*/\1/p')
if [ -n "${CUSTOMER_VALUE}" ]; then
  ok "D2 施主名に見本が入っている"
else
  fail "D2 施主名が空で開いている（見本が入っていない）"
fi
SITE_TAG=$(tr '<' '\n' < "${WORK}/project.html" | grep 'id="siteAddress"' | head -1)
SITE_VALUE=$(printf '%s' "${SITE_TAG}" | sed -n 's/.*value="\([^"]*\)".*/\1/p')
if [ -n "${SITE_VALUE}" ]; then
  ok "D2 現場住所に見本が入っている"
else
  fail "D2 現場住所が空で開いている（見本が入っていない）"
fi
# 文言は apps/web/lib/flowText.ts の PROJECT_STEP_TEXT.next と同じ値。
if has_label "${WORK}/project.html" "次へ"; then
  ok "D2 「次へ」のボタンがある（D3 の入口）"
else
  fail "D2 「次へ」のボタンが無い（D3 へ行けない）"
fi

# ── D3 写真を撮る ─────────────────────────────────────────
RESULT=$(fetch "${WORK}/photo.html" "${BASE}/demo/${PROJECT_ID}/photo")
CODE="${RESULT% *}"
if [ "${CODE}" = "200" ]; then ok "D3 写真画面 (200, ${RESULT#* }s)"; else fail "D3 写真画面が ${CODE}"; fi
# **箇所のプルダウンは無い**（2026-08-07 にやめた）。並ぶのは**工事の枠**で、
# 枠を押すとその工事の撮影になる。枠の中には工事名と「写真を撮る」が出ている
# （文言は apps/web/lib/demoText.ts の DEMO_PHOTO_TEXT.take、
#   工事名は apps/web/lib/demoFixture.ts の LINE_SOURCE と同じ値）。
for LINE_NAME in "内装工事" "外壁工事" "給排水設備工事" "解体・廃棄物処理費"; do
  if has_label "${WORK}/photo.html" "${LINE_NAME}"; then
    ok "D3 「${LINE_NAME}」の枠がある"
  else
    fail "D3 「${LINE_NAME}」の枠が無い（この工事は撮れない）"
  fi
done
if has_label "${WORK}/photo.html" "写真を撮る"; then
  ok "D3 枠が撮影の入口になっている"
else
  fail "D3 枠に撮影の入口が無い（押しても撮れない）"
fi
# 文言は apps/web/lib/demoText.ts の DEMO_PHOTO_TEXT.skip と
# apps/web/lib/flowText.ts の PHOTO_STEP_TEXT.next と同じ値。
if has_label "${WORK}/photo.html" "写真なしで進む"; then
  ok "D3 写真を飛ばす逃げ道がある（商談は屋内で行われる）"
else
  fail "D3 「写真なしで進む」が無い"
fi
if has_label "${WORK}/photo.html" "次へ"; then
  ok "D3 「次へ」のボタンがある"
else
  fail "D3 「次へ」のボタンが無い"
fi
# **D3 の行き先は HTML から確かめられない。** 進むのはクライアント側の router.push で、
# 行き先はJSチャンクの中にある（apps/web/components/DemoPhotoStep.tsx）。
# かわりに、表のとおりの次の画面 D4 をこの案件で直接 GET する。

# ── D4 確認画面（見積回答期限 ＋ 保存 / 送信 / 修正）───────
RESULT=$(fetch "${WORK}/document.html" "${BASE}/projects/${PROJECT_ID}/document")
CODE="${RESULT% *}"
if [ "${CODE}" = "200" ]; then
  ok "D4 確認画面 (200, ${RESULT#* }s)"
else
  fail "D4 確認画面が ${CODE}"
fi
# 文言は apps/web/lib/flowText.ts の DOCUMENT_CONFIRM_TEXT と同じ値。
# ボタンは**この3つだけ**（docs/flows.md の表）。増えたらそちらを先に直す。
if grep -qF "この内容で下請けに出します" "${WORK}/document.html"; then
  ok "D4 見出しが出ている"
else
  fail "D4 見出しが無い（画面の作りが変わった可能性）"
fi
for BUTTON in "保存" "送信" "修正"; do
  if has_label "${WORK}/document.html" "${BUTTON}"; then
    ok "D4 「${BUTTON}」のボタンがある"
  else
    fail "D4 「${BUTTON}」のボタンが無い"
  fi
done
# **見積回答期限が入った状態で開く**（初期値は当日＋7日。表 D4）。空欄で出していたときに
# 実機で「作りかけに見える」と言われた。欄の存在ではなく**値**を見る（空なら落ちる）。
if grep -qF "見積回答期限" "${WORK}/document.html"; then
  ok "D4 見積回答期限の欄がある"
else
  fail "D4 見積回答期限の欄が無い"
fi
# 欄は apps/web/components/DocumentConfirmScreen.tsx の id="response-due"。
DUE_TAG=$(tr '<' '\n' < "${WORK}/document.html" | grep 'id="response-due"' | head -1)
DUE_VALUE=$(printf '%s' "${DUE_TAG}" | sed -n 's/.*value="\([^"]*\)".*/\1/p')
case "${DUE_VALUE}" in
  [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9])
    ok "D4 見積回答期限に日付が入っている（${DUE_VALUE}）" ;;
  "")
    fail "D4 見積回答期限が空で開いている（作りかけに見える）" ;;
  *)
    fail "D4 見積回答期限が日付になっていない（${DUE_VALUE}）" ;;
esac

# ── D5 送信しました（デモ）────────────────────────────────
# **D4 の「送信」そのものは押していない。** 送信は Server Action（sendFromDocumentAction）で、
# 呼び出し先IDはHTMLに載らない（クライアント部品から呼ぶのでIDはJSチャンク側にある）ため、
# bash から素直に叩けない。3タップ時代に見積書PDFを押さず比較表の合計で代用したのと同じ判断。
# かわりに、送信後に着地する D5 と、そこから自動で進む D6 を**直接 GET して**
# 画面が生きていることを見る（押せないのは送信の1回だけで、以降の画面は踏める）。
# デモの初期状態には既に依頼グループと3社の回答が入っているので、送信を押さなくても
# D6・D7・D8 の中身はそろっている（apps/web/lib/db/demoSeed.ts）。
RESULT=$(fetch "${WORK}/sent.html" "${BASE}/projects/${PROJECT_ID}/sent")
CODE="${RESULT% *}"
if [ "${CODE}" = "200" ]; then
  ok "D5 送信しました (200, ${RESULT#* }s)"
else
  fail "D5 送信しましたが ${CODE}"
fi
# 文言は apps/web/lib/flowText.ts の SENT_TEXT.heading / loading と同じ値。
if grep -qF "送信しました（デモ）" "${WORK}/sent.html"; then
  ok "D5 見出しが出ている"
else
  fail "D5 見出しが無い"
fi
if grep -qF "ロード中（デモ）" "${WORK}/sent.html"; then
  ok "D5 ロード中を流している（3秒後に D6 へ自動で進む）"
else
  fail "D5 ロード中が無い（D6 へ自動で進まない可能性）"
fi

# ── D6 受信しました（デモ）────────────────────────────────
RESULT=$(fetch "${WORK}/received.html" "${BASE}/projects/${PROJECT_ID}/received")
CODE="${RESULT% *}"
if [ "${CODE}" = "200" ]; then
  ok "D6 受信しました (200, ${RESULT#* }s)"
else
  fail "D6 受信しましたが ${CODE}"
fi
# 文言は apps/web/lib/flowText.ts の RECEIVED_TEXT.heading / toQuotes と同じ値。
if grep -qF "受信しました（デモ）" "${WORK}/received.html"; then
  ok "D6 見出しが出ている"
else
  fail "D6 見出しが無い"
fi
if grep -qF "見積もりを見る" "${WORK}/received.html"; then
  ok "D6 「見積もりを見る」がある（D7 の入口）"
else
  fail "D6 「見積もりを見る」が無い"
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
# 文言は apps/web/lib/flowText.ts の QUOTE_DOCUMENT_TEXT.adopt / hold と同じ値。
# **採用／保留は D7 でも押せる**（利用者の指示 2026-08-07。実機で「一覧で押せない。
# 詳細でしか押せない」と言われた）。一覧から消えたらここで落ちる。
for LABEL in "採用" "保留"; do
  if has_label "${WORK}/quotes.html" "${LABEL}"; then
    ok "D7 一覧に「${LABEL}」のボタンがある"
  else
    fail "D7 一覧に「${LABEL}」のボタンが無い（一覧で判断を下せない）"
  fi
done
# 文言は apps/web/lib/flowText.ts の QUOTE_LIST_TEXT.toPdf と同じ値。
# **D7 → D10 の経路はこのボタン**（利用者の指示 2026-08-07）。ここが消えると
# 表のとおりに D10 へ行けなくなるので、経路の検査としてボタンの有無を見る。
if has_label "${WORK}/quotes.html" "見積書を出す"; then
  ok "D7 「見積書を出す」のボタンがある（D10 の入口）"
else
  fail "D7 「見積書を出す」のボタンが無い（D10 へ行けない）"
fi

# ── D8 見積もり書類（1社ずつ）──────────────────────────────
# 依頼IDはデモを始めるたびに変わるので、**D7 の HTML に出ているリンクから拾う**
# （固定で書けない。ここだけは画面から拾うしかない）。
REQUEST_ID=$(grep -o "/projects/${PROJECT_ID}/quotes/[0-9a-f-]\{36\}" "${WORK}/quotes.html" \
  | head -1 | sed 's|.*/||')
if [ -z "${REQUEST_ID}" ]; then
  fail "D8 一覧から1社ぶんのリンクを拾えない（D8 へ入れない）"
else
  RESULT=$(fetch "${WORK}/quote.html" "${BASE}/projects/${PROJECT_ID}/quotes/${REQUEST_ID}")
  CODE="${RESULT% *}"
  if [ "${CODE}" = "200" ]; then
    ok "D8 見積もり書類 (200, ${RESULT#* }s)"
  else
    fail "D8 見積もり書類が ${CODE}"
  fi
  # 文言は apps/web/lib/flowText.ts の QUOTE_DOCUMENT_TEXT.adopt / hold / toList と同じ値。
  # **画面が移るのは「一覧へ」だけ**（採用・保留を押しても移らない。docs/flows.md の表）。
  for LABEL in "採用" "保留" "一覧へ"; do
    if has_label "${WORK}/quote.html" "${LABEL}"; then
      ok "D8 「${LABEL}」のボタンがある"
    else
      fail "D8 「${LABEL}」のボタンが無い"
    fi
  done
fi

# ── D9 下書き保存フォルダ ─────────────────────────────────
# D4 の「保存」から降りる枝。**保存そのものは押していない**（保存はリンクなので
# 押せるが、押す前の状態でも一覧は開ける）。ここで見るのは画面が生きていること。
RESULT=$(fetch "${WORK}/drafts.html" "${BASE}/drafts")
CODE="${RESULT% *}"
if [ "${CODE}" = "200" ]; then
  ok "D9 下書き保存フォルダ (200, ${RESULT#* }s)"
else
  fail "D9 下書き保存フォルダが ${CODE}"
fi
# 文言は apps/web/lib/flowText.ts の DRAFTS_TEXT.heading と同じ値。
if grep -qF "下書き保存フォルダ" "${WORK}/drafts.html"; then
  ok "D9 見出しが出ている"
else
  fail "D9 見出しが無い"
fi

# ── 金額の確認（検査専用。ここは利用者の経路ではない）────
# **経路の検査は D7 の「見積書を出す」で済んでいる**（上でボタンの有無を見た）。
# ここで比較表を開くのは**金額の確認だけ**のため。比較表は表（D1〜D10）に無い画面で、
# 利用者はここを通らない。
#
# **PDFそのものは押していない。** 出力は Server Action で、呼び出し先IDがHTMLに載らない
# （クライアント部品から呼ぶのでIDはJSチャンク側にある）ため bash から素直に叩けない。
# かわりに **/projects/<id>/comparison に出ている採用済みの合計**を見る。この合計と
# 見積書は同じ計算（apps/web/lib/db/pricedEstimate.ts）を通るので、ここが0円でなければ
# 書類も0円ではない。**0円のまま書類が出る事故を外から捕まえられる唯一の場所**
# （PDFのバイト列から金額は読めない。docs/failures.md 2026-08-06）。
#
# **D7 に合計を出す指示は表に無い**ので、D7 側に合計を足して済ませることはしない。
# 以前ここで見ていた3社の並びと回答済みの判定は、消したのではなく D7 に移した
# （上の「D7 一覧に 業者A/B/C」と「まだ見積もりが届いていません。が出ていない」）。
RESULT=$(fetch "${WORK}/cmp.html" "${BASE}/projects/${PROJECT_ID}/comparison")
CODE="${RESULT% *}"
if [ "${CODE}" != "200" ]; then
  fail "金額の確認: 合計を読む画面が ${CODE}"
else
  ok "金額の確認: 合計を読む画面 (200, ${RESULT#* }s)"
fi

# ラベルは apps/web/lib/quoteFlowText.ts の COMPARISON_TEXT.adoptedTotalLabel と同じ値。
TOTAL_LABEL="採用中の合計（税込）"
if ! grep -qF "${TOTAL_LABEL}" "${WORK}/cmp.html"; then
  fail "金額の確認: 「${TOTAL_LABEL}」が無い（画面の作りが変わった可能性）"
else
  # ラベルの直後に出る「1,234,567円」から数字だけを取り出す。
  # HTMLコメントを先に落とす。React は隣り合う描画の間にコメントノードを挟むことがあり、
  # 残したままだと数字と「円」が別々に見える（実際にそれで読めなかった）。
  TOTAL_YEN=$(sed 's/<!--[^>]*-->//g' "${WORK}/cmp.html" \
    | tr '<' '\n' \
    | sed -n "/${TOTAL_LABEL}/,\$p" \
    | grep -o '[0-9][0-9,]*円' | head -1 | tr -d ',円')
  if [ -z "${TOTAL_YEN}" ]; then
    fail "金額の確認: 「${TOTAL_LABEL}」の金額を読めない"
  elif [ "${TOTAL_YEN}" -gt 0 ]; then
    ok "金額の確認: 採用済みの合計が ${TOTAL_YEN}円（0円ではない）"
  else
    fail "金額の確認: 採用済みの合計が 0円（見積書も0円で出る）"
  fi
fi

# ── 他人のデモを開けないこと ──────────────────────────────
# **存在しないIDで404になっても、分離の検査にはならない。** 実在する他人の案件を
# 開こうとして404になることを見る。商談が2件同時に走る状況がこれ。
for DEMO_SCREEN in "project" "photo"; do
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 \
    "${BASE}/demo/00000000-0000-4000-8000-000000000000/${DEMO_SCREEN}" || echo 000)
  if [ "${CODE}" = "404" ]; then
    ok "デモ未開始で /demo/<uuid>/${DEMO_SCREEN} は 404"
  else
    fail "デモ未開始の /demo/<uuid>/${DEMO_SCREEN} が ${CODE}"
  fi
done

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
    "/demo/${PROJECT_ID}/project"
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
  echo "PROD DEMO CHECK OK: D1〜D10 の経路は本番で通り、待ち時間も上限内（PDFの中身は合計で確認）"
else
  echo "PROD DEMO CHECK FAILED"
  exit 1
fi
