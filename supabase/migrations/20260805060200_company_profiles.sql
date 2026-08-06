-- 会社設定（docs/design.md 7章「画面は5つ」）。請負者名・代表者・住所は
-- ①②の様式どちらにも印字される必須欄（5章「様式に印字されているもの」）。
-- default_slot_values は legal_item_slots（④⑤⑥⑧）の初期値のテンプレート文言で、
-- 新しい案件を作るときにここから値をコピーする（会社設定を直しても既存案件は
-- 変わらない。案件ごとに上書きできることと矛盾しないため、案件側に複製する）。
--
-- 1事業者＝1設定なので owner_id を主キーにする（案件のように複数持たない）。

create table public.company_profiles (
  owner_id text primary key,
  contractor_name text not null default '',
  representative_name text not null default '',
  address text not null default '',
  -- { [slot_key]: string } の形。キーは legal_item_slots.slot_key と同じ語彙。
  default_slot_values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.company_profiles enable row level security;

grant select, insert, update, delete on public.company_profiles to service_role;
