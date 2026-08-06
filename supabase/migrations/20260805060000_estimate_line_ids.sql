-- 明細行に安定したIDを持たせる（docs/design.md 7章「現行実装からの変更点」）。
-- estimates.lines は jsonb 配列で、これまで各要素に永続IDが無かった。
-- 写真の紐づけ・下請からの単価採用（1明細1社の排他）には、明細行を一意に
-- 指す方法が要る。以後 lib/db/estimates.ts が生成する行には必ず id を持たせる
-- （lib/db/types.ts の PersistedEstimateLine 参照）。
--
-- 既存の estimates 行（本番稼働中のものも含む）にはまだ id が無いため、
-- ここで jsonb の各要素に id を注入する backfill を行う。

update public.estimates
set lines = (
  select coalesce(
    jsonb_agg(
      case
        when elem ? 'id' then elem
        else elem || jsonb_build_object('id', gen_random_uuid()::text)
      end
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(lines) as elem
)
where lines is not null and jsonb_array_length(lines) > 0;
