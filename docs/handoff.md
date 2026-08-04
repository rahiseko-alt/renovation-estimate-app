# 引継ぎメモ（handoff）

セッションをまたぐ**揮発的な引継ぎメモ**。**このファイルは毎回上書き**（最新1件だけを保持する）。
過去の失敗の蓄積は `docs/failures.md`（append-only・消さない）を見る。

## ①今回実施

**確認済みの外部事実（このメモの自己申告ではなく、CI run・commit・公開URLで裏が取れているもの）：**

- PR #7 が commit `6f0cbab` として `main` にマージ済み（フェーズ0＋案件登録・見積エディタ）。
- PR #9 が commit `2111094` として `main` にマージ済み（`prod-smoke.yml` を実URLに接続）。
- PR #10 が commit `bc4d84c` として `main` にマージ済み（単価マスタ）。
- PR #11 が commit `c875b24` として `main` にマージ済み（PR #10 の CodeRabbit 指摘4件の修正）。
  CI run: https://github.com/rahiseko-alt/renovation-estimate-app/actions/runs/30924247255
  （typecheck/lint/test/build 成功）。prod-smoke run:
  https://github.com/rahiseko-alt/renovation-estimate-app/actions/runs/30924224378
  （`prod 200 + marker` 成功＝本番URLへの反映を確認）。

**未確認のまま（自己申告のみで外部事実の裏が無い項目。変わらず）：**

- Vercel の環境変数（`AUTH_SECRET` / `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD`）が設定済みかどうか。
- 本番URLでの実際のログイン成功（prod-smoke はトップページ・ヘルスチェックのみ）。
- Supabase 側のスキーマ移行（まだ未着手。下記「ブロッカー」参照）。

**フェーズ1の残りだった「pdfme での協議会様式 PDF 出力」を実装した。**
ユーザーから「GO」の指示を受けて着手。実装方針は当初計画の pdfme から変更している：

- **pdfme ではなく `@cantoo/pdf-lib`（pdf-libのフォーク）+ `fontkit`（本家パッケージ、
  `@pdf-lib/fontkit` ではない）を採用した。** 理由は2つ。①pdfme の
  `@pdfme/schemas` は本見積書に不要な依存（バーコード・日付ピッカー・
  署名パッド等）を大量に引き込む。②本家 `pdf-lib` + `@pdf-lib/fontkit` の
  組み合わせは、日本語フォントのサブセット化で**一部の文字を無言で欠落させる
  実害のあるバグ**を実機検証で確認した（`docs/failures.md` 2026-08-04
  参照）。`@cantoo/pdf-lib` + 本家 `fontkit` の組み合わせで、実ブラウザ
  （Chromium/PDFium）とPyMuPDFの両方で文字欠落が無いことを確認してから実装した。
- **フォントは BIZ UDPGothic（OFLライセンス、Google Fonts配布の静的TrueType）
  を採用**（`apps/web/lib/pdf/assets/`。ライセンス全文は同ディレクトリの
  `OFL.txt`）。AGENTS.md の元計画が挙げていたUI側の第一候補フォントと揃えている。
  Regular/Bold 合わせて約9.3MB。`next.config.ts` に `outputFileTracingIncludes`
  を追加し、Vercel のデプロイに含める設定をした（fs.readFileSyncで読むだけの
  ファイルはデフォルトのトレースに含まれないため）。
- **`app/**/route.ts`（Route Handler）ではなく Server Action で実装した。**
  最初 Route Handler で実装したところ、同じ案件がページでは見つかるのに
  Route Handler からは常に404になる不具合に遭遇し、実機デバッグの結果
  「Route Handler は Server Component/Server Action と別のモジュールグラフに
  バンドルされ、仮のメモリDB（`lib/db/` のモジュールスコープ `Map`）を
  共有しない」ことが根本原因と判明した（`docs/failures.md` 2026-08-04 参照）。
  `app/projects/[id]/pdf-actions.ts` の Server Action
  （`generateEstimatePdfAction`）に作り直し、結果をbase64にしてクライアント
  コンポーネント（`components/DownloadPdfButton.tsx`）に返し、ブラウザ側で
  Blobダウンロードする形にしたところ解消した。**Supabase接続後（`lib/db/` を
  実DBに差し替えた後）はこの制約自体が無くなるが、それまでは新しい呼び出し
  入口を Route Handler で作らないこと。**
- レイアウトは住宅リフォーム推進協議会の様式（工事項目／摘要／数量／単位／単価／
  金額の6列＋集計欄＋添付書類・保管の注記）。会社情報（請負者名・代表者・住所・印）
  を入力する画面がまだ無いため、その欄は省略している（未確認事項として残す）。
  明細が1ページに収まらない場合は表の見出し行を繰り返して自動改ページする。
  金額列は省略記号で詰めず、収まらなければ文字サイズを縮めて必ず全桁を表示する
  （`lib/pdf/layout.ts` の `drawNumericCell`。金額を黙って削らない設計）。

**確認済みの外部事実（PDF機能・PR #12）**：draft PR #12 として push 済み
（commit `c25537f`）。CI run（typecheck/lint/test/build）：
https://github.com/rahiseko-alt/renovation-estimate-app/actions/runs/30937470344
（成功）。prod-smoke run：
https://github.com/rahiseko-alt/renovation-estimate-app/actions/runs/30937464342
（`prod 200 + marker` 成功）。

**ローカルでの観測（外部事実の裏はまだ無い。上の commit `c25537f` 時点の話）**：
typecheck・lint・test・`pnpm -r build`・`pnpm audit`・`scripts/smoke.sh` を
ローカルで実行し、いずれも通った。本番相当ビルド（`next build && next start`）を
起動し、Playwright（スクラッチ実行）で「案件作成→見積エディタに複数行
（値引き含む）入力→保存→PDFダウンロード→ダウンロードしたPDFの内容を
pdf-libで読み直して検証、PyMuPDFで画像化して目視確認」を行い、金額・値引きの
▲表記・税額・合計が正しく反映されることと、未ログインでは案件詳細ページ自体が
ログイン画面に飛ぶことを、この場では確認した。これらはローカル観測であり、
CI run や公開URLでの裏は取れていない（別途 CI の結果自体が外部事実）。

**PR #12 への CodeRabbit レビューで4件の指摘を受け、3件を修正・1件は
検証のうえ反証してこのメモの直後に別 commit として push する：**

1. **`EstimateLine.name`／`spec` に文字数上限が無く、`lib/pdf/layout.ts` の
   `fitText`（1文字ずつ削って幅を測る実装）と組み合わせると、長大な文字列を
   保存してPDF生成時にCPUを浪費させられる（CWE-400・Major）。** 修正：
   `lib/calc.ts` に `MAX_TEXT_LENGTH`（200文字）を追加し `assertValidLine` で
   検証。`fitText` 自体も二分探索に書き換え、幅の再計測回数を線形に抑えた。
2. **見積の明細行数に上限が無く、`generateEstimatePdfAction` が全行を
   無制限にPDF化してbase64にする（CWE-400・Major）。** 修正：
   `lib/calc.ts` に `MAX_LINE_COUNT`（500行）を追加し `calcEstimate` で検証
   （`saveEstimateAction` は `calcEstimate` を通すので保存時点で弾かれる）。
3. `docs/handoff.md` のPDF機能の節が、CI run・commit の裏が無い自己申告の
   ままだった指摘。この節がその修正版（上の「確認済みの外部事実」参照）。
4. **反証した1件**：`apps/web/lib/pdf/assets/OFL.txt` が埋め込んでいる
   BIZUDPGothicではなくBIZ UDMinchoのライセンスに見える、という指摘。
   `diff <(curl 実際の Google Fonts 公式リポジトリの ofl/bizudpgothic/OFL.txt)
   apps/web/lib/pdf/assets/OFL.txt` で差分が無いことを確認済み（`bizudgothic`
   側のOFL.txtとも一致し、Morisawaの複数バリアントを1つの上流リポジトリで
   まとめているための表記と判断）。PR上でCodeRabbitに根拠付きで返信済み。

上記1・2の修正は typecheck・lint・test（120件全部緑。9件追加）を
ローカルで確認済み。まだ push していない（このメモの直後に行う）。

## ②今回トラブル

`docs/failures.md` に2026-08-04付けで2件追記した（要約）：

1. **pdf-lib + @pdf-lib/fontkit の日本語サブセット化バグ**：保存は例外なく
   成功するのに、一部の文字が無言で欠落する。`@cantoo/pdf-lib` + 本家
   `fontkit` に差し替えて解消。教訓：PDF生成の「保存成功」は「正しく描画
   される」の証明にならない。生成後に別のレンダラで実際に開いて確認する。
2. **Route Handler と Server Action/ページで仮メモリDBのインスタンスが
   共有されない**：教訓・回避策は上の①に記載のとおり。Supabase移行までは
   新しい呼び出し入口を Route Handler で作らない。

## ③次回やる事

**フェーズ1は今回でほぼ完了**（単価マスタ・PDF出力まで実装済み）。残るのは：

- Supabase 接続後、`lib/db/` の仮のメモリ実装を実DBに差し替え
  **（ブロッカーあり。下記参照）**
- （任意・優先度低）会社情報（請負者名・代表者・住所・印）の設定画面。
  無いと見積書PDFのその欄が空のまま。

**Supabase実DB移行のブロッカー**（変わらず）：このセッションには
Supabase・Vercel の MCP接続が無く、あなたのSupabaseプロジェクトに直接
アクセスする手段が無い。実DBへのスキーマ移行（テーブル作成・RLS設定）は、
こちらがSQLを書いても、ユーザーがSupabaseのSQL Editorに貼って実行する
という手作業が必ず挟まる。また、Vercelの環境変数（`AUTH_SECRET` /
`DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD`）もユーザーがVercelの画面で
設定する必要がある。次回セッションの最初に、本番URLで実際にログイン
できるかを確認すること。

その後の想定（元の実装計画より。計画書自体はこのリポジトリには無い）：

- **フェーズ2（写真）**：OS標準カメラで撮影→箇所（キッチン/浴室 等）を選ぶ→
  該当する明細行に自動で紐づける。
- **フェーズ3（下請とのやり取り）**：明細を選んで見積依頼リンクを発行し、下請はログイン不要で
  単価だけ入力できる回答画面から回答。取り込むと原価→掛率→売価に反映される。
- **フェーズ4（UX仕上げ）**：50代の現場作業者が実機・実ブラウザで一連の流れを通しで
  操作できることを確認する（対話系の自動テスト基盤の導入もここで検討）。

**検討事項**：アプリ全体のE2E/対話コンポーネントテスト基盤（Playwright or Testing Library）の
導入。今回もPlaywrightはスクラッチ実行のみ（リポジトリ未導入）で確認した。
フェーズ4「UXの実機確認」で正式に扱うか、もっと早い段階で入れるかは要判断。

**まだ埋まっていない前提**（顧客に聞く必要がある、変わらず）:

- 既存の見積書（Excel/PDF）の現物
- 諸経費率の実際の数字、有効期限の日数
- 本番で実在の顧客情報を扱うときの社外ホスティング可否
