-- 明細ごとの「採用」（docs/design.md 7章「取り込みは『追加』ではなく『採用』にする」）。
--
-- 旧実装（app/projects/[id]/estimate/quote-actions.ts の取り込み）は、下請の回答を
-- 見積に**新しい明細行として追加**していた。二重取り込みの防止も依頼1件単位だったため、
-- 同じ工事を3社に頼んで3社とも回答すると、同じ工事項目が見積に3行入ってしまう。
--
-- そこで「どの明細行について、どの社の依頼を採ったか」を1明細につき1件だけ持つ。
-- 明細行は増えない（この表が指すだけ）。**1明細1社の排他は unique 制約で保証する**
-- （アプリ側の「気を付ける」で守らない。docs/design.md 7章「関数の契約で守る」と同じ姿勢）。
-- 採用し直しは同じ (project_id, line_item_id) への upsert になり、前の採用が置き換わる。
--
-- line_item_id は estimates.lines（jsonb 配列）の各要素が持つ id
-- （PersistedEstimateLine.id）。jsonb の中の値なので外部キーは張れない。代わりに、
-- 採用の入口（lib/db/lineAdoptions.ts）で「その明細が、採用しようとしている依頼の
-- 対象範囲（quote_group_requests.line_item_ids）に入っていること」を確かめる
-- （依頼していない明細の単価を採る経路を作らない）。

create table public.line_adoptions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id text not null,

  -- 採用した明細行（estimates.lines の要素が持つ安定ID）。
  line_item_id uuid not null,

  -- 採用した社ごとの依頼。依頼が消えたら採用も消す（採用元が無い採用を残さない）。
  quote_group_request_id uuid not null
    references public.quote_group_requests (id) on delete cascade,

  adopted_at timestamptz not null default now(),

  -- 1明細につき採用は1社まで（排他）。docs/design.md 7章。
  unique (project_id, line_item_id)
);

create index line_adoptions_project_id_idx on public.line_adoptions (project_id);
create index line_adoptions_owner_id_idx on public.line_adoptions (owner_id);
create index line_adoptions_quote_group_request_id_idx
  on public.line_adoptions (quote_group_request_id);

alter table public.line_adoptions enable row level security;

grant select, insert, update, delete on public.line_adoptions to service_role;
