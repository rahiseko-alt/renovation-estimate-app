-- 法定⑦施工環境・施工制約は、「施工条件・範囲リスト」（建設生産システム合理化推進
-- 協議会、第4版）への○×で表現する（docs/design.md 5章・7章）。
--
-- 一次情報どおり、元請は指示欄に「含める（条件内）＝include」「含めない（条件外）＝exclude」
-- を付けるだけで、自由記述は無い。legal_item_slots と同じ3状態の考え方を、値ではなく
-- 区分（category）ごとの印に適用する：
--   mark = 'include' … ○（条件内）
--   mark = 'exclude' … ×（条件外）
--   mark = 'unset'   … 未検討（既定値）
--
-- 区分は原本が挙げる項目（材料、取付加工、運搬、足場、墨出し、養生、片付、機器、
-- 図面・書類、見本、検査・確認、安全）に合わせる。

create table public.site_condition_checks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id text not null,
  category text not null check (category in (
    'materials',
    'assembly_processing',
    'transport',
    'scaffolding',
    'marking_out',
    'curing',
    'cleanup',
    'equipment',
    'drawings_documents',
    'samples',
    'inspection_confirmation',
    'safety'
  )),
  mark text not null default 'unset' check (mark in ('include', 'exclude', 'unset')),
  updated_at timestamptz not null default now(),
  unique (project_id, category)
);

create index site_condition_checks_project_id_idx on public.site_condition_checks (project_id);
create index site_condition_checks_owner_id_idx on public.site_condition_checks (owner_id);

alter table public.site_condition_checks enable row level security;

grant select, insert, update, delete on public.site_condition_checks to service_role;
