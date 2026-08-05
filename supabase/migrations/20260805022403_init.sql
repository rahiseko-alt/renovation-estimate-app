-- 案件・見積・単価マスタの初期スキーマ。
-- lib/db/projects.ts / estimates.ts / priceMaster.ts が想定する形に合わせている
-- （画面・API はこれらのファイルだけを通す。テーブルを直接見に行かない）。
--
-- owner_id はメールアドレス文字列（lib/auth/credentials.ts の verifyCredentials が返す値）。
-- Supabase Auth 未導入のデモ認証のため auth.uid() は使えず、所有者による絞り込みは
-- 今まで通りアプリコード側（lib/db/）の WHERE 条件で行う。
--
-- RLS は有効化するが、anon / authenticated ロール向けのポリシーは1つも作らない
-- （＝それらのロールからは何も見えない）。サーバーは service_role キーで接続し、
-- service_role は Supabase の仕様として RLS を無条件にバイパスする。
-- 本物の Supabase Auth を導入したら、authenticated ロール向けに
-- owner_id = auth.uid()::text 相当のポリシーをここに追加していく。

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  customer_name text not null,
  site_address text not null,
  created_at timestamptz not null default now()
);

create index projects_owner_id_idx on public.projects (owner_id);

alter table public.projects enable row level security;

-- Supabase の既定（auto_expose_new_tables 無効）では、新しいテーブルは
-- service_role であっても SELECT/INSERT/UPDATE/DELETE を自動では持たない
-- （構造系の権限だけが入る）。RLS が「見せない」層なら、これは「そもそも権限が無い」層で、
-- 両方揃って初めてサーバーからの想定した読み書きができる。
grant select, insert, update, delete on public.projects to service_role;

-- 見積は「案件1件につき1件（改版なし）」に単純化している
-- （lib/db/estimates.ts のコメントと同じ前提。改版履歴を持つ場合もこのファイルと
-- lib/db/estimates.ts の中だけを直せばよい）。
create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  lines jsonb not null,
  overhead_rate_percent numeric not null default 0,
  overhead_tax_category text not null default 'standard',
  updated_at timestamptz not null default now(),
  unique (project_id)
);

alter table public.estimates enable row level security;

grant select, insert, update, delete on public.estimates to service_role;

create table public.price_master_items (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  name text not null,
  spec text not null,
  unit text not null,
  unit_price integer not null,
  tax_category text not null,
  created_at timestamptz not null default now()
);

create index price_master_items_owner_id_idx on public.price_master_items (owner_id);

alter table public.price_master_items enable row level security;

grant select, insert, update, delete on public.price_master_items to service_role;
