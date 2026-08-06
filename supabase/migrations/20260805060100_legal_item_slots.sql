-- 法定8項目（建設業法。docs/design.md 3章）のうち、定型文で埋める9項目
-- （④責任施工範囲／⑤下請工事の工程・全体工程／⑥見積条件・他工種との関係部位・
-- 特殊部分／⑧材料費・労働災害防止対策・建設副産物の運搬及び処理の費用負担区分）。
--
-- ①工事名称・②施工場所は案件情報（projects）から自動、③設計図書（数量等を含む）は
-- 写真＋数量から導く製品仮説で、いずれも人が個別に埋める項目ではないためここには
-- 含めない（docs/design.md「まだ決めていないこと」：③の充足判定条件は未決）。
-- ⑦施工環境・施工制約は施工条件・範囲リストへの○×で表現するため別テーブル
-- （20260805060400_site_condition_checks.sql）に持つ。
--
-- 「未定」は利用者が明示的に選んだ項目にだけ印字し、入力し忘れた項目の穴埋めに
-- 使わない（docs/design.md 7章）。これを表現するため、1スロットに3状態を持たせる：
--   status = 'filled'       … value に具体的な内容が入っている
--   status = 'undetermined' … 利用者が「未定」を明示した（value は無視する）
--   status = 'unset'        … まだ何も選んでいない（既定値。送信ゲートで弾く対象）
-- text 型1列や、value に文字列 "未定" を書き込む方式では「未定」と「未入力」を
-- 区別できないため、状態列（status）と本文列（value）を分けて持つ。

create table public.legal_item_slots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id text not null,
  slot_key text not null check (slot_key in (
    'responsibility_scope',
    'subcontract_schedule',
    'overall_schedule',
    'quote_conditions',
    'trade_boundary',
    'special_parts',
    'material_cost_burden',
    'safety_measures_burden',
    'waste_disposal_burden'
  )),
  status text not null default 'unset' check (status in ('filled', 'undetermined', 'unset')),
  value text,
  updated_at timestamptz not null default now(),
  unique (project_id, slot_key),
  -- filled と主張するなら value が空であってはならない（状態と本文の矛盾を防ぐ）。
  check (status <> 'filled' or (value is not null and value <> ''))
);

create index legal_item_slots_project_id_idx on public.legal_item_slots (project_id);
create index legal_item_slots_owner_id_idx on public.legal_item_slots (owner_id);

alter table public.legal_item_slots enable row level security;

grant select, insert, update, delete on public.legal_item_slots to service_role;
