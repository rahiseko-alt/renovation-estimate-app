-- 明細行に安定したIDを持たせる（docs/design.md 7章「現行実装からの変更点」）。
-- estimates.lines は jsonb 配列で、これまで各要素に永続IDが無かった。
-- 写真の紐づけ・下請からの単価採用（1明細1社の排他）には、明細行を一意に
-- 指す方法が要る。以後 lib/db/estimates.ts が生成する行には必ず id を持たせる
-- （lib/db/types.ts の PersistedEstimateLine 参照）。
--
-- 既存の estimates 行（本番稼働中のものも含む）にはまだ id が無いため、
-- ここで jsonb の各要素に id を注入する backfill を行う。

-- jsonb_agg は入力行の順序を保証しない（PostgreSQL公式ドキュメント）。
-- 明細の並び順（見積書に印字される順序）を変えないよう、jsonb_array_elements の
-- WITH ORDINALITY で元の位置番号を取り、jsonb_agg の中で ORDER BY する
-- （CodeRabbit のレビューで指摘）。
update public.estimates
set lines = (
  select coalesce(
    jsonb_agg(
      case
        when elem ? 'id' then elem
        else elem || jsonb_build_object('id', gen_random_uuid()::text)
      end
      order by ord
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(lines) with ordinality as t(elem, ord)
)
where lines is not null and jsonb_array_length(lines) > 0;
