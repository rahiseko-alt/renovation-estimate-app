# 引継ぎメモ（handoff）

セッションをまたぐ**揮発的な引継ぎメモ**。**このファイルは毎回上書き**（最新1件だけを保持する）。
過去の失敗の蓄積は `docs/failures.md`（append-only・消さない）を見る。

## ①今回実施

**フェーズ2（写真）着手前のブロッカーだった Supabase 実DB移行が完了した。**

**確認済みの外部事実（このメモの自己申告ではなく、CI run・commit・公開URLで裏が取れているもの）：**

- **PR #16 が commit `0cac300` として `main` にマージ済み（`lib/db/` の3ファイル
  ＝案件・見積・単価マスタを、仮のメモリ実装から Supabase（PostgreSQL）に差し替え）。**
  CI run（PR側の最終コミット `8dbd4d2`）：
  https://github.com/rahiseko-alt/renovation-estimate-app/actions/runs/30970951774
  （`typecheck / lint / test / build`・起動スモーク・CodeQL すべて success）。
  auto-merge run: https://github.com/rahiseko-alt/renovation-estimate-app/actions/runs/30971747913
  （CI全緑・CodeRabbitレビュークリーンを検知して自動 squash マージ）。
- **本番URLへの反映も外部事実で確認済み。** `prod-smoke.yml` は `on: push` トリガーだが、
  `auto-merge` のマージ push は `GITHUB_TOKEN` によるものでワークフロー連鎖が起きず
  自動起動しなかった（詳細は `docs/failures.md` 2026-08-05 参照）。そのため
  `workflow_dispatch` で main に対して手動起動し、確認した：
  https://github.com/rahiseko-alt/renovation-estimate-app/actions/runs/30972518026
  （head_sha が merge commit `0cac300` と一致・`prod 200 + marker` success）。

**PR #16 の実装内容の要点**（詳細はコミット履歴・PRの説明を参照）：

- `lib/db/projects.ts` / `estimates.ts` / `priceMaster.ts` の関数シグネチャ・挙動
  （所有者による絞り込み、IDOR対策の null/false、存在しないIDや形の違うIDの扱い）は
  変更なし。呼び出し側（画面・Server Action）も無変更。
- テーブル定義は `supabase/migrations/`。RLS は有効化した上でポリシーは1つも作らない
  （anon/authenticated からは何も見えない）。サーバーは service_role キーで接続し、
  所有者による絞り込みは今まで通り `lib/db/` 側の WHERE 条件で行う。
- `lib/db/estimates.ts` の `getOrCreateEstimate` は、同じ案件を2つのタブで同時に開くような
  一意制約違反の競合が起きたら作り直さず取りに行き直す。
- 既存の `tests/db.test.ts` を、モックにせずローカル Supabase（Docker）に対して実際に
  クエリを出して検証する形に変更。Supabase CLI をルートの devDependency に追加し、
  ローカル/CI とも `pnpm exec supabase start` で起動する。CI は毎回まっさらな
  ランナー上で起動するため常にまっさらだが、**ローカルは `supabase start` だけでは
  前回のデータが Docker ボリュームに残る**（`supabase db reset` 等を別途叩かない限り
  リセットされない）。接続情報はコードのどこにも決め打ちで書かず、CLI の
  `supabase status -o env` から都度取得する。
- CodeRabbit の指摘4件（`.env.example` のキー順序、`client.ts` への `server-only`
  import 追加、`ci.yml` の `supabase status` 取得を fail-fast 化、`scripts/smoke.sh` の
  環境変数 export を必要な2つだけに絞る）はコミット `8dbd4d2` で対応済み。
  再レビューは「No actionable comments were generated」。

**これで解消したもの：**

- 仮メモリ実装によるデータ揮発（再デプロイ・サーバー再起動で消えていた問題）。
- Route Handler が使えない制約（旧実装のメモリDBがモジュールグラフをまたいで
  共有されない問題。詳細は `docs/failures.md` 2026-08-04）。

## ②今回トラブル

`docs/failures.md` に2026-08-05付けで1件追記済み。見出しだけ：

1. `auto-merge`（`GITHUB_TOKEN` によるプッシュ）後は `prod-smoke.yml` 等の
   push トリガー式ワークフローが自動起動しないことに気付かず、本番反映確認が
   抜けかけた。`workflow_dispatch` で手動起動して確認した。

## ③次回やる事

**次はフェーズ2（写真）。1フェーズ1PRの運用で進める。** ブランチは squash マージ後の
運用ルールに従い `git fetch origin main && git checkout -B claude/new-app-init-hufsv1 origin/main`
で作り直し済み（`main` の最新 = commit `0cac300`）。

- **フェーズ2（写真）**：OS標準カメラで撮影（`<input type="file" accept="image/*"
  capture="environment">`。ブラウザ内に独自カメラUIは作らない）→箇所（キッチン/浴室 等。
  `PHOTO_AREAS` が `lib/content.ts` に定義済み）を選ぶ→該当する明細行に自動で紐づける。
- **保存先は Supabase Storage を使う**（今回のブロッカー解消により選択の余地が無くなった。
  以前の handoff にあった「ローカル仮実装で先に画面を作るか」の判断は不要になった）。
  バケットは非公開にする。**サーバーは service_role キーで接続するため RLS は素通りする
  （`lib/db/` と同じ構図）。** したがって所有者以外がアクセスできない保証は RLS ではなく、
  アップロード・取得・削除・署名付きURL発行のすべてで `lib/db/` 側の所有者チェックと
  同じパターン（サーバー側で案件の所有者を検証してから Storage を操作する）を必須にする。
- **写真の向きの扱い（順序を間違えると縦写真が寝る）**：canvas で再エンコードすると
  EXIF は落ちるので、**元ファイルから向きを読む → その回転を画素に適用して描画 →
  最後に圧縮**の順にする（圧縮後に EXIF を読もうとしても、もう無い）。
  自前で実装せず `browser-image-compression` 等の自動で向きを扱うライブラリを使う場合は、
  **採用したライブラリ名と、圧縮後も向きが保たれることを確認したテストを残す**
  （ブラウザによって `drawImage` が EXIF を尊重するかが割れるため、
  「手元で1回見て正しかった」では担保にならない）。

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
