-- 下請台帳（docs/design.md 7章「画面は5つ」）。社名・メールのみ。
-- 依頼グループ（20260805060400_quote_request_groups.sql）が同時依頼の宛先として
-- ここから選ぶ。

create table public.subcontractors (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  company_name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create index subcontractors_owner_id_idx on public.subcontractors (owner_id);

alter table public.subcontractors enable row level security;

grant select, insert, update, delete on public.subcontractors to service_role;
