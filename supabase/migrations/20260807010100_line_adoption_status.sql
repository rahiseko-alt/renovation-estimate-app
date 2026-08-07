-- 明細ごとの印を「採用」の2値から「採用 / 保留」の3状態にする
-- （docs/flows.md「デモの画面の並び」D6・D7。利用者の指示 2026-08-07）。
--
-- これまでこの表は「採用したか、していないか」しか表せなかった。行があれば採用、
-- 無ければ未採用。**「保留」を置く場所がどこにも無かった**（DBにも型にも定数にも）。
--
-- 利用者が決めた仕様：
--   - 印は明細ごとに付ける（1通まるごとではない）。
--   - **1明細につき採用は1社まで**（これまでどおりの排他）。
--   - **保留は、あとで採用に変えられる**。採用の一歩手前の置き場であって、
--     不採用の記録ではない。
--   - 採用でも保留でも、案件ごとの一覧に貯まる。
--
-- 保留は1明細に複数社あってよい（3社のうち1社を採用し、2社を保留にできる）ので、
-- **これまでの unique (project_id, line_item_id) はそのままでは使えない**。
-- 2段に分ける：
--   1. (project_id, line_item_id, quote_group_request_id) の unique
--      … 同じ社に同じ明細で2つの印を付けさせない
--   2. status = 'adopted' に限った部分 unique index
--      … 1明細につき採用は1社までを、これまでどおり**DBの制約で**保証する
--      （アプリ側の「気を付ける」で守らない。元のテーブルと同じ姿勢）。
--
-- 既存行はすべて「採用」なので、既定値 'adopted' でそのまま意味が変わらない。

alter table public.line_adoptions
  add column status text not null default 'adopted'
    check (status in ('adopted', 'on_hold'));

comment on column public.line_adoptions.status is
  'adopted: 採用 / on_hold: 保留（あとで採用に変えられる）。';

-- adopted_at は「採用した時刻」ではなく「印を付けた時刻」になる。列名は変えない
-- （改名すると既存のコードとテストを広く触ることになり、意味の変化に見合わない）。
comment on column public.line_adoptions.adopted_at is
  '印を付けた時刻（採用・保留のどちらでも入る）。';

-- 1明細1社の排他を、採用に限って引き継ぐ。
-- 先に部分 index を作ってから元の制約を落とす（落としてから作ると、その間だけ
-- 排他が無い状態ができる）。
create unique index line_adoptions_adopted_one_per_line_idx
  on public.line_adoptions (project_id, line_item_id)
  where status = 'adopted';

alter table public.line_adoptions
  drop constraint line_adoptions_project_id_line_item_id_key;

-- 同じ社が同じ明細に2つの印を持たない（採用と保留を同時に持つ状態を作らない）。
alter table public.line_adoptions
  add constraint line_adoptions_one_mark_per_company
    unique (project_id, line_item_id, quote_group_request_id);
