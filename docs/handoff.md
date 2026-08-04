# 引継ぎメモ（handoff）

セッションをまたぐ**揮発的な引継ぎメモ**。**このファイルは毎回上書き**（最新1件だけを保持する）。
過去の失敗の蓄積は `docs/failures.md`（append-only・消さない）を見る。

## ①今回実施

**PR #7（フェーズ0＋フェーズ1の案件登録・見積エディタ）をユーザーの明示的な指示のもと
`main` にマージした。** Vercel・Supabase の接続もユーザー側の作業として完了し、
公開URL（`https://renovation-estimate-app-web.vercel.app`）が確定した。

- `main` へのマージ後、`.github/workflows/prod-smoke.yml` の `PROD_URL` を実際の
  割当ドメインに更新し、`on:` トリガーを `workflow_dispatch` のみから
  `push: branches: ["**"]` に復元した（PR #9・マージ済み）。4項目（200・本文マーカー・
  HSTS・`/api/health`）は本番URLに対して実際に確認してから push した。
- **今後のPRのdraft解除（＝本番への自動マージ）について、ユーザーから明示的に
  「CIが緑なら自動でマージしてよい」という指示を得た。** これ以降、CIが全緑になった
  draft PRは、都度の確認なしでdraftを解除して auto-merge.yml に委ねてよい
  （ただしDB設計・セキュリティに関わる大きな判断は引き続き別途確認する）。
- **単価マスタ（フェーズ1の残りの1つ）を実装した：**
  - `lib/db/types.ts` に `PriceMasterItem` / `NewPriceMasterItemInput` を追加。
  - `lib/db/priceMaster.ts` を新設。`lib/db/projects.ts` と同じ境界（ownerId で
    絞り込まない取得関数は置かない）で `listPriceMasterForOwner` /
    `getPriceMasterItemForOwner` / `createPriceMasterItem` /
    `deletePriceMasterItemForOwner` を実装。IDOR対策のテストも同じ形で追加
    （`tests/db.test.ts` に `describe("priceMaster")` を追加、他人の単価マスタは
    取得も削除もできないことを検証）。
  - 画面：`/price-master`（一覧・削除）、`/price-master/new`（登録）。
    `/projects` からリンクを張った。
  - 見積エディタに単価マスタからの追加を統合。`EstimateLineRow` 側は変更せず、
    新規の明細行として1行追加する方式にした（既存の行を書き換えない）。
    UI部分は行数制限（max-lines 300）に触れたため、`components/PriceMasterPicker.tsx`
    に「単価マスタから選んで追加する」という単独の塊として切り出した
    （行数で機械的に割ったのではなく、後から単独で直したくなる単位で分けた）。
  - typecheck / lint / test（99件全部緑）/ `pnpm -r build` / `scripts/smoke.sh` を
    全部通した上で、実際にdevサーバを立てて Playwright で
    「単価マスタ登録 → 見積エディタで選んで追加 → 明細に反映 → 保存できる」を
    実機相当のブラウザ操作で確認した（ローカル専用の `.env.local` を使用。
    `.gitignore` で除外済みであることも確認済み。コミットはしていない）。

**現在の状態**：この単価マスタの変更はまだコミット・push前（このメモの直後に
commit → push → PR化 → CI確認 の順で進める）。

## ②今回トラブル

新規の失敗は無し。

## ③次回やる事

**フェーズ1の残り**：

- pdfme での協議会様式 PDF 出力。日本語フォントのサブセット化
- Supabase 接続後、`lib/db/` の仮のメモリ実装を実DBに差し替え
  **（ブロッカーあり。下記参照）**

**Supabase実DB移行のブロッカー**：このセッションには Supabase・Vercel の MCP接続が
無く、あなたのSupabaseプロジェクトに直接アクセスする手段が無い。実DBへの
スキーマ移行（テーブル作成・RLS設定）は、こちらがSQLを書いても、ユーザーが
SupabaseのSQL Editorに貼って実行するという手作業が必ず挟まる。また、
Vercelの環境変数（`AUTH_SECRET` / `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD`）も
ユーザーがVercelの画面で設定する必要がある（今はおそらく未設定で、本番の
ログイン画面はエラーになる）。この2つはユーザー側の作業として案内済みだが、
まだ完了の確認はできていない。

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
