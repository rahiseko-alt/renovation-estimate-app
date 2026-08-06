-- 依頼グループ（docs/design.md 7章「依頼グループの単位」）。
-- 1明細＝1依頼＝1社だった旧設計（quote_requests テーブル）を、複数社への同時依頼に
-- 作り直す。旧テーブルは既存の画面・Server Action がまだ参照しているため、
-- このマイグレーションでは削除・変更しない（作り直しは別PRで、新しい画面が
-- 新テーブルに載せ替わってから旧テーブルを退役させる）。
--
-- グループ＝一度の「依頼を出す」でまとめて出したもの。提示日時（presented_at）を持つ。
-- 建設業法の見積期間（3章）は「契約内容の提示から契約締結まで」の期間なので、
-- 起算点として提示日時をここに記録する。
--
-- 社ごとの依頼（quote_group_requests）は、宛先・トークン・予定価格帯・回答期限・
-- 対象明細の範囲を持つ。社ごとに工事範囲や予定価格帯が違いうるため
-- （docs/design.md 7章「依頼グループの単位」）、グループではなく行ごとに持つ。
--
-- 予定価格帯から見積期間（3章の表）を経て回答期限を出す計算は、日本時間で確定させる
-- 必要がある（本番はUTCで動くため、SQL側の now() 依存の計算にしない）。
-- そのためこのテーブルは「元請が選んだ帯」と「計算済みの期限」の両方を持ち、
-- 計算そのものはアプリ側（lib/db/quoteRequestGroups.ts）で行う。

create table public.quote_request_groups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id text not null,
  presented_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index quote_request_groups_project_id_idx on public.quote_request_groups (project_id);
create index quote_request_groups_owner_id_idx on public.quote_request_groups (owner_id);

alter table public.quote_request_groups enable row level security;

grant select, insert, update, delete on public.quote_request_groups to service_role;

create table public.quote_group_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.quote_request_groups (id) on delete cascade,
  owner_id text not null,
  subcontractor_id uuid not null references public.subcontractors (id),
  token uuid not null default gen_random_uuid(),

  -- 元請が選ぶ3択（docs/design.md 3章の見積期間の表に対応）。
  -- 依頼を出す時点では単価が空で明細から予定価格を計算できないため、
  -- 元請が自分で選ぶ（自動計算はしない）。
  planned_price_band text not null check (planned_price_band in (
    'under_500man',
    'between_500man_and_5000man',
    'over_5000man'
  )),

  -- 予定価格帯とグループの提示日時から計算した回答期限（アプリ側で計算して保存）。
  response_due_at timestamptz not null,

  -- 対象明細の範囲。estimates.lines の各要素が持つ id（PersistedEstimateLine.id）を指す。
  -- 社ごとに範囲が違いうるため配列で持つ。
  line_item_ids uuid[] not null default '{}',

  -- pending: 回答待ち / responded: 回答が届いた（未取り込み） / imported: 見積に取り込み済み。
  status text not null default 'pending'
    check (status in ('pending', 'responded', 'imported')),

  responded_at timestamptz,
  imported_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index quote_group_requests_token_idx on public.quote_group_requests (token);
create index quote_group_requests_group_id_idx on public.quote_group_requests (group_id);
create index quote_group_requests_owner_id_idx on public.quote_group_requests (owner_id);

alter table public.quote_group_requests enable row level security;

grant select, insert, update, delete on public.quote_group_requests to service_role;
