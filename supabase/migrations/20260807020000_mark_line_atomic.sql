-- 明細の印（採用・保留）を「1回で全部入るか、1つも入らないか」にする。
--
-- これまでアプリ側（lib/db/lineAdoptions.ts の markLine）が2回に分けて書いていた:
--   ① 採用に付け替えるとき、それまで採用だった社を 'on_hold' へ下ろす
--   ② 新しい印を upsert する
-- ②で失敗すると①だけが残る。**その明細は採用0社になる**——前の社は保留に下がり、
-- 新しい社の印は入っていない。同時実行が無くても起きるし、画面にはエラーが出るだけで
-- 「前の採用が外れた」ことはどこにも表示されない。利用者は採用済みのつもりのまま
-- 見積書を出すと、その明細だけ原価単価が重ならず保存値のまま出る。
--
-- Supabase の JS クライアントにトランザクションのAPIが無いため、2つの書き込みを
-- PostgreSQL の関数にまとめて、DB側で1つのトランザクションとして適用する
-- （20260806020100_response_atomic.sql と同じ作法）。
--
-- 呼び出し前の検証（依頼の所有者・案件の一致・対象範囲）はアプリ側の assertMarkable に
-- 残す。ここは「まとめて書く」ことだけを引き受ける。

create function public.mark_line(
  p_project_id uuid,
  p_owner_id text,
  p_line_item_id uuid,
  p_request_id uuid,
  p_status text
) returns public.line_adoptions
language plpgsql
-- service_role からのみ呼ぶ（下記の grant）。定義者権限で実行する。
security definer
set search_path = public
as $$
declare
  v_row public.line_adoptions;
begin
  if p_status = 'adopted' then
    -- 先に下ろしてから上げる。逆にすると、一瞬2社が採用になって
    -- 部分 unique index（line_adoptions_adopted_one_per_line_idx）に弾かれる。
    -- **消さない。** 一度採ってから採り直した社が一覧から消えないようにする
    -- （docs/flows.md「デモの画面の並び」D7）。
    update public.line_adoptions
       set status = 'on_hold'
     where project_id = p_project_id
       and line_item_id = p_line_item_id
       and owner_id = p_owner_id
       and status = 'adopted'
       and quote_group_request_id <> p_request_id;
  end if;

  -- 同じ社に付け直すと、その社の印だけが置き換わる（増えない）。
  insert into public.line_adoptions (
    project_id, owner_id, line_item_id, quote_group_request_id, status, adopted_at
  )
  values (
    p_project_id, p_owner_id, p_line_item_id, p_request_id, p_status, now()
  )
  on conflict (project_id, line_item_id, quote_group_request_id) do update
    set status = excluded.status,
        owner_id = excluded.owner_id,
        adopted_at = excluded.adopted_at
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.mark_line(uuid, text, uuid, uuid, text) from public;
grant execute on function public.mark_line(uuid, text, uuid, uuid, text) to service_role;
