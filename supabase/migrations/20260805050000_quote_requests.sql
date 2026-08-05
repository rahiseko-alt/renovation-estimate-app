-- フェーズ3（下請とのやり取り）：明細1件ぶんの見積依頼と、下請からの回答。
-- 20260805022403_init.sql / 20260805043056_photos.sql と同じ規約（owner_id は
-- メールアドレス文字列、RLS は有効化してポリシーは作らない、service_role へ明示 grant）
-- に合わせる。
--
-- 個々の明細行（estimates.lines の jsonb 配列要素）には永続IDが無い
-- （20260805043056_photos.sql のコメント参照）。そのため見積との紐づけは、
-- 依頼を作った時点の工事項目・摘要・数量・単位をこのテーブルにスナップショットとして
-- 複製する形にする。以後に見積側の明細を編集・削除しても、この依頼の内容は変わらない
-- （下請が見ている内容と、依頼した側の記録を一致させ続けるため）。
--
-- token は下請が回答する画面（/q/[token]、ログイン不要）の資格情報そのもの。
-- 推測されない値である必要があるため uuid（gen_random_uuid()）を使う。
-- この画面ではサーバーが service_role で接続するため、token を知っていることだけを
-- 検証の根拠にする（owner_id によるアプリコード側の絞り込みは、依頼を作る側・
-- 取り込む側の操作にだけ及ぶ）。

create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id text not null,
  token uuid not null default gen_random_uuid(),

  -- 依頼した時点の明細のスナップショット。
  item_name text not null,
  item_spec text not null,
  quantity numeric not null,
  unit text not null,
  tax_category text not null,

  -- 掛率。下請の回答（原価単価）が届いたとき、この率を掛けて売価単価を出す
  -- （lib/calc.ts の sellingUnitPrice）。依頼ごとに持つ（案件・明細ごとに変えられる）。
  markup_rate numeric not null,

  -- 下請の回答（原価単価・円の整数）。回答が届くまでは null。
  cost_unit_price integer,

  -- pending: 回答待ち / responded: 回答が届いた（未取り込み） / imported: 見積に取り込み済み。
  status text not null default 'pending'
    check (status in ('pending', 'responded', 'imported')),

  responded_at timestamptz,
  imported_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index quote_requests_token_idx on public.quote_requests (token);
create index quote_requests_project_id_idx on public.quote_requests (project_id);
create index quote_requests_owner_id_idx on public.quote_requests (owner_id);

alter table public.quote_requests enable row level security;

grant select, insert, update, delete on public.quote_requests to service_role;
