-- 下請の回答を「1回で全部入るか、1つも入らないか」にする。
--
-- これまでアプリ側（lib/db/quoteGroupResponses.ts）が3回に分けて書いていた:
--   ① 回答を1件 insert
--   ② 明細行を insert
--   ③ 依頼の状態を responded に update
-- ②か③で失敗すると、①だけが残る。**この状態から復帰できない**。
-- 依頼の状態は pending のままなので下請は再送できるが、①の
-- quote_group_request_id の unique 制約に当たって必ず失敗する。
-- 下請は永久に回答できず、元請の比較表にはその社の欄が空のまま残り、
-- 何が起きたかはどちらにも表示されない。
--
-- Supabase の JS クライアントにトランザクションのAPIが無いため、3つの書き込みを
-- PostgreSQL の関数にまとめて、DB側で1つのトランザクションとして適用する。
--
-- 呼び出し前の検証（token・対象範囲・二重回答）はアプリ側に残す。ここは
-- 「まとめて書く」ことだけを引き受ける。

create function public.create_quote_group_response(
  p_request_id uuid,
  p_breakdown jsonb,
  p_lines jsonb
) returns uuid
language plpgsql
-- service_role からのみ呼ぶ（下記の grant）。定義者権限で実行する。
security definer
set search_path = public
as $$
declare
  v_response_id uuid;
begin
  insert into public.quote_group_responses (
    quote_group_request_id,
    material_cost,
    labor_cost,
    legal_welfare_cost,
    safety_health_cost,
    retirement_mutual_aid_cost,
    work_days,
    material_supplied_note
  )
  values (
    p_request_id,
    (p_breakdown ->> 'material_cost')::integer,
    (p_breakdown ->> 'labor_cost')::integer,
    (p_breakdown ->> 'legal_welfare_cost')::integer,
    (p_breakdown ->> 'safety_health_cost')::integer,
    (p_breakdown ->> 'retirement_mutual_aid_cost')::integer,
    (p_breakdown ->> 'work_days')::integer,
    coalesce(p_breakdown ->> 'material_supplied_note', '')
  )
  returning id into v_response_id;

  insert into public.quote_group_response_lines (
    response_id, line_item_id, quantity, cost_unit_price
  )
  select
    v_response_id,
    (item ->> 'line_item_id')::uuid,
    (item ->> 'quantity')::numeric,
    (item ->> 'cost_unit_price')::integer
  from jsonb_array_elements(p_lines) as item;

  -- 元請の比較表はこの状態を見る。
  update public.quote_group_requests
     set status = 'responded',
         responded_at = now()
   where id = p_request_id;

  return v_response_id;
end;
$$;

revoke execute on function public.create_quote_group_response(uuid, jsonb, jsonb) from public;
grant execute on function public.create_quote_group_response(uuid, jsonb, jsonb) to service_role;
