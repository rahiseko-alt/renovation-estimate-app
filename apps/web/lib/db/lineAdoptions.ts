// 明細ごとの採用（docs/design.md 7章「取り込みは『追加』ではなく『採用』にする」）の
// データアクセス。画面はここだけを通す。テーブル定義は
// supabase/migrations/20260806010000_line_adoptions.sql。
//
// 旧実装は下請の回答を見積に新しい明細行として追加していたため、同じ工事を3社に頼んで
// 3社とも回答すると同じ工事項目が3行入った。ここでは行を足さず、「この明細はこの社の
// 依頼を採った」を1明細につき1件だけ持つ（排他は DB の unique 制約が保証する）。
// 採用し直しは同じ (project_id, line_item_id) への upsert なので、前の採用が置き換わる。

import { getSupabaseClient } from "./client";
import {
  getQuoteGroupRequestForOwner,
  getQuoteRequestGroupForOwner,
} from "./quoteRequestGroups";
import type { AdoptLineInput, LineAdoption } from "./types";
import { isUuid } from "./uuid";

const COLUMNS =
  "id, project_id, owner_id, line_item_id, quote_group_request_id, adopted_at";

type LineAdoptionRow = {
  id: string;
  project_id: string;
  owner_id: string;
  line_item_id: string;
  quote_group_request_id: string;
  adopted_at: string;
};

function toLineAdoption(row: LineAdoptionRow): LineAdoption {
  return {
    id: row.id,
    projectId: row.project_id,
    ownerId: row.owner_id,
    lineItemId: row.line_item_id,
    quoteGroupRequestId: row.quote_group_request_id,
    adoptedAt: row.adopted_at,
  };
}

/**
 * 明細1件について、社ごとの依頼を1件採用する。既に採用済みならその採用を置き換える
 * （追加にならない）。
 *
 * 採用する前に3つ確かめる。
 * - 依頼が ownerId の持ち物であること（他人の依頼IDを知っていても採用できない。IDOR対策）。
 * - その依頼が属するグループの案件が、渡された projectId と一致すること
 *   （別案件の依頼を、この案件の明細に紐づけられないようにする）。
 * - 明細が、その依頼の対象範囲（lineItemIds）に入っていること
 *   （頼んでいない明細の単価を採る経路を作らない。範囲の実在性は依頼を作る時点で
 *   createQuoteGroupRequest が見積に対して検証済み）。
 */
export async function adoptLine(
  input: AdoptLineInput,
  ownerId: string,
): Promise<LineAdoption> {
  const request = await getQuoteGroupRequestForOwner(
    input.quoteGroupRequestId,
    ownerId,
  );
  if (!request) {
    throw new Error("依頼が見つかりません。");
  }

  const group = await getQuoteRequestGroupForOwner(request.groupId, ownerId);
  if (!group || group.projectId !== input.projectId) {
    throw new Error("依頼が、この案件のものではありません。");
  }

  if (!request.lineItemIds.includes(input.lineItemId)) {
    throw new Error("この明細は、その依頼の対象範囲に入っていません。");
  }

  const { data, error } = await getSupabaseClient()
    .from("line_adoptions")
    .upsert(
      {
        project_id: input.projectId,
        owner_id: ownerId,
        line_item_id: input.lineItemId,
        quote_group_request_id: input.quoteGroupRequestId,
        adopted_at: new Date().toISOString(),
      },
      { onConflict: "project_id,line_item_id" },
    )
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toLineAdoption(data as LineAdoptionRow);
}

/** 採用を取り消せたら true。採用していない明細・他人の持ち物なら何もせず false。 */
export async function cancelLineAdoption(
  projectId: string,
  lineItemId: string,
  ownerId: string,
): Promise<boolean> {
  if (!isUuid(projectId) || !isUuid(lineItemId)) return false;

  const { data, error } = await getSupabaseClient()
    .from("line_adoptions")
    .delete()
    .eq("project_id", projectId)
    .eq("line_item_id", lineItemId)
    .eq("owner_id", ownerId)
    .select("id");
  if (error) throw error;
  return (data as { id: string }[]).length > 0;
}

/**
 * 案件の採用一覧。比較表が「どの明細をどの社で採ったか」を描くために使う。
 * 1明細につき最大1件しか返らない（unique 制約による）。
 */
export async function listLineAdoptionsForProject(
  projectId: string,
  ownerId: string,
): Promise<LineAdoption[]> {
  if (!isUuid(projectId)) return [];

  const { data, error } = await getSupabaseClient()
    .from("line_adoptions")
    .select(COLUMNS)
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .order("adopted_at", { ascending: true });
  if (error) throw error;
  return (data as LineAdoptionRow[]).map(toLineAdoption);
}
