# 引継ぎメモ（handoff）

セッションをまたぐ**揮発的な引継ぎメモ**。**このファイルは毎回上書き**（最新1件だけを保持する）。
過去の失敗の蓄積は `docs/failures.md`（append-only・消さない）を見る。

## ①今回実施

**フェーズ1（見積が作れてPDFが出る）が完了した。**

**確認済みの外部事実（このメモの自己申告ではなく、CI run・commit・公開URLで裏が取れているもの）：**

- PR #7 が commit `6f0cbab` として `main` にマージ済み（フェーズ0＋案件登録・見積エディタ）。
- PR #9 が commit `2111094` として `main` にマージ済み（`prod-smoke.yml` を実URLに接続）。
- PR #10 が commit `bc4d84c` として `main` にマージ済み（単価マスタ）。
- PR #11 が commit `c875b24` として `main` にマージ済み（PR #10 の CodeRabbit 指摘4件の修正）。
- **PR #12 が commit `2808031` として `main` にマージ済み（見積書PDF出力。フェーズ1完了）。**
  CI run: https://github.com/rahiseko-alt/renovation-estimate-app/actions/runs/30938608457
  （typecheck/lint/test/build 成功）。prod-smoke run:
  https://github.com/rahiseko-alt/renovation-estimate-app/actions/runs/30938599501
  （`prod 200 + marker` 成功＝本番URLへの反映を確認）。

**未確認のまま（自己申告のみで外部事実の裏が無い項目。変わらず）：**

- Vercel の環境変数（`AUTH_SECRET` / `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD`）が設定済みかどうか。
- 本番URLでの実際のログイン成功（prod-smoke はトップページ・ヘルスチェックのみ）。
- Supabase 側のスキーマ移行（まだ未着手。下記「ブロッカー」参照）。

**PR #12（見積書PDF出力）の実装内容の要点**（詳細はコミット履歴・PRの説明を参照）：

- pdfme ではなく `@cantoo/pdf-lib`（pdf-libのフォーク）+ 本家 `fontkit` を採用。
  理由・調査過程は `docs/failures.md` 2026-08-04 の2件を参照。
- フォントは BIZ UDPGothic（OFLライセンス。`apps/web/lib/pdf/assets/OFL.txt`）。
- Route Handler ではなく Server Action（`app/projects/[id]/pdf-actions.ts`）で実装。
  理由は `docs/failures.md` 参照（仮メモリDBがモジュールグラフをまたいで共有されない）。
- CodeRabbit のレビューで CWE-400（DoS）2件の指摘を受け、その場で修正：
  工事項目・摘要に文字数上限（`MAX_TEXT_LENGTH` 200文字）、明細行数に上限
  （`MAX_LINE_COUNT` 500行）を `lib/calc.ts` に追加。PDFの `fitText` も
  二分探索に書き換えた。フォントライセンス表記への指摘は診た上で反証し
  （Google Fonts公式リポジトリとSHA-256一致を確認）、CodeRabbit側が撤回した。

**運用の変更を決めた：次フェーズからは「1フェーズ＝1PR」にする。**
今回はフェーズ1で5つのPR（#7, #9, #10, #11, #12）に分かれ、squashマージのたびに
ブランチを作り直す手間と、CodeRabbitのレビュー回数の多さが問題になった
（ユーザーからの指摘）。次回以降は、フェーズの中は同じブランチにdraftのまま積み続け、
フェーズの機能が全部そろってローカル検証（typecheck/lint/test/build/smoke）が
通ってから初めてdraftを解除する。CodeRabbitの本格レビューとauto-mergeもそこで
1回だけ走る。手動で `@coderabbitai review` を呼べば、マージせずに途中で
レビューだけ受けることもできる。

## ②今回トラブル

`docs/failures.md` に2026-08-04付けで2件追記済み（要約）：

1. **pdf-lib + @pdf-lib/fontkit の日本語サブセット化バグ**：保存は例外なく
   成功するのに、一部の文字が無言で欠落する。`@cantoo/pdf-lib` + 本家
   `fontkit` に差し替えて解消。教訓：PDF生成の「保存成功」は「正しく描画
   される」の証明にならない。生成後に別のレンダラで実際に開いて確認する。
2. **Route Handler と Server Action/ページで仮メモリDBのインスタンスが
   共有されない**：Supabase移行までは新しい呼び出し入口を Route Handler で
   作らない。

新規の失敗はもう1件：**squashマージ後、同じブランチに新しいコミットを積む前に
`origin/main` を再取得せずに作業を始めてしまい、PR#12が一時的に本当の
コンフリクト状態（`mergeable_state: "dirty"`）になった。** `docs/failures.md`
2026-08-03 の教訓（squashマージ後は必ずブランチを作り直す）を知っていながら
同じ失敗を再度やった。`git checkout -B <branch> origin/main` → 旧ブランチの
コミットを `cherry-pick` → 旧リモートブランチを `git merge` で取り込んで
復旧した。

## ③次回やる事

**フェーズ1は完了。次はフェーズ2（写真）。1フェーズ1PRの運用で進める。**

- **フェーズ2（写真）**：OS標準カメラで撮影→箇所（キッチン/浴室 等）を選ぶ→
  該当する明細行に自動で紐づける。実装計画の詳細は `mitsumoriappspec.md` や
  過去のplanファイルは無いため、着手前に方針を簡潔に確認してから進める
  （Supabase Storageの利用が前提だが、下記ブロッカーの影響を受ける）。

**Supabase実DB移行のブロッカー**（変わらず。フェーズ2の写真機能はSupabase
Storageが前提のため、この解消が前提条件になる可能性が高い）：このセッションには
Supabase・Vercel の MCP接続が無く、あなたのSupabaseプロジェクトに直接
アクセスする手段が無い。実DBへのスキーマ移行（テーブル作成・RLS設定）は、
こちらがSQLを書いても、ユーザーがSupabaseのSQL Editorに貼って実行する
という手作業が必ず挟まる。また、Vercelの環境変数（`AUTH_SECRET` /
`DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD`）もユーザーがVercelの画面で
設定する必要がある。次回セッションの最初に、本番URLで実際にログイン
できるかを確認すること。

その後の想定（元の実装計画より。計画書自体はこのリポジトリには無い）：

- **フェーズ3（下請とのやり取り）**：明細を選んで見積依頼リンクを発行し、下請はログイン不要で
  単価だけ入力できる回答画面から回答。取り込むと原価→掛率→売価に反映される。
- **フェーズ4（UX仕上げ）**：50代の現場作業者が実機・実ブラウザで一連の流れを通しで
  操作できることを確認する（対話系の自動テスト基盤の導入もここで検討）。

**検討事項**：アプリ全体のE2E/対話コンポーネントテスト基盤（Playwright or Testing Library）の
導入。今回もPlaywrightはスクラッチ実行のみ（リポジトリ未導入）で確認した。
フェーズ4「UXの実機確認」で正式に扱うか、もっと早い段階で入れるかは要判断。

**任意・優先度低**：会社情報（請負者名・代表者・住所・印）の設定画面。無いと
見積書PDFのその欄が空のまま。

**まだ埋まっていない前提**（顧客に聞く必要がある、変わらず）:

- 既存の見積書（Excel/PDF）の現物
- 諸経費率の実際の数字、有効期限の日数
- 本番で実在の顧客情報を扱うときの社外ホスティング可否
