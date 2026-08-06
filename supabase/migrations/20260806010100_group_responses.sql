-- 下請からの回答（docs/design.md 3章「下請が返す見積書に求められる内訳」）。
--
-- 旧 quote_requests は「1依頼＝1明細＝原価単価1つ」だった。ガイドラインはこの形を
-- **望ましくない行為事例①**（数量や単価等の内訳が記載されていない見積書）として
-- 名指ししている。そこで回答を2段で持つ：
--
--   quote_group_response      … 依頼1件に対する回答1件。必要経費の内訳を持つ
--   quote_group_response_line … その回答の明細ごとの数量・単価
--
-- 必要経費の内訳（法定福利費・安全衛生経費・建退共・作業日数）は**努力義務**なので
-- NOT NULL にしない（入力必須にはしない）。ただし欄は必ず出す（欄が無ければ
-- 書きようがない。事例②の回避）。「未入力」と「0と回答した」を区別する必要があるため、
-- 既定値0を入れずに NULL 可のままにする。

create table public.quote_group_responses (
  id uuid primary key default gen_random_uuid(),

  -- どの社への依頼に対する回答か。依頼が消えたら回答も消す。
  quote_group_request_id uuid not null unique
    references public.quote_group_requests (id) on delete cascade,

  -- 必要経費の内訳（努力義務。未入力を許すので NULL 可）。金額は円、作業日数は日。
  material_cost integer,
  labor_cost integer,
  legal_welfare_cost integer,
  safety_health_cost integer,
  retirement_mutual_aid_cost integer,
  work_days integer,

  -- 元請が支給する材料がある場合の記載（ガイドラインが材料費に付記を求めている）。
  material_supplied_note text not null default '',

  responded_at timestamptz not null default now(),

  -- 金額・日数に負の値を入れさせない（未入力は NULL で表す）。
  constraint quote_group_responses_amounts_non_negative check (
    coalesce(material_cost, 0) >= 0
    and coalesce(labor_cost, 0) >= 0
    and coalesce(legal_welfare_cost, 0) >= 0
    and coalesce(safety_health_cost, 0) >= 0
    and coalesce(retirement_mutual_aid_cost, 0) >= 0
    and coalesce(work_days, 0) >= 0
  )
);

create table public.quote_group_response_lines (
  id uuid primary key default gen_random_uuid(),

  response_id uuid not null
    references public.quote_group_responses (id) on delete cascade,

  -- estimates.lines（jsonb 配列）の要素が持つ安定ID。jsonb の中なので外部キーは
  -- 張れない。依頼の対象範囲に入っている明細だけを受け付ける検証は
  -- lib/db/quoteGroupResponses.ts が行う。
  line_item_id uuid not null,

  -- 下請が入れる数量と原価単価。明細ごとに両方を出させる（事例①の回避）。
  quantity numeric not null,
  cost_unit_price integer not null,

  -- 1回答につき同じ明細は1行だけ。
  unique (response_id, line_item_id),

  constraint quote_group_response_lines_non_negative check (
    quantity >= 0 and cost_unit_price >= 0
  )
);

create index quote_group_responses_request_id_idx
  on public.quote_group_responses (quote_group_request_id);
create index quote_group_response_lines_response_id_idx
  on public.quote_group_response_lines (response_id);

alter table public.quote_group_responses enable row level security;
alter table public.quote_group_response_lines enable row level security;

grant select, insert, update, delete on public.quote_group_responses to service_role;
grant select, insert, update, delete on public.quote_group_response_lines to service_role;
