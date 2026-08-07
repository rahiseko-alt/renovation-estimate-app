// 明細ごとの採用（docs/design.md 7章「取り込みは『追加』ではなく『採用』にする」）の
// データアクセス。画面はここだけを通す。テーブル定義は
// supabase/migrations/20260806010000_line_adoptions.sql。
//
// 旧実装は下請の回答を見積に新しい明細行として追加していたため、同じ工事を3社に頼んで
// 3社とも回答すると同じ工事項目が3行入った。ここでは行を足さず、「この明細はこの社の
// 依頼を採った」を1明細につき1件だけ持つ（排他は DB の unique 制約が保証する）。
// 印の書き込みは DB関数 public.mark_line が1トランザクションで行う
// （supabase/migrations/20260807020000_mark_line_atomic.sql）。採用し直しは
// (project_id, line_item_id, quote_group_request_id) への upsert で、前の採用は
// 同じトランザクションの中で保留に下がる。

import { getSupabaseClient } from "./client";
import {
  getQuoteGroupRequestForOwner,
  getQuoteRequestGroupForOwner,
} from "./quoteRequestGroups";
import type {
  AdoptLineInput,
  LineAdoption,
  LineMarkStatus,
  MarkLineInput,
} from "./types";
import { isUuid } from "./uuid";

const COLUMNS =
  "id, project_id, owner_id, line_item_id, quote_group_request_id, status, adopted_at";

type LineAdoptionRow = {
  id: string;
  project_id: string;
  owner_id: string;
  line_item_id: string;
  quote_group_request_id: string;
  status: LineMarkStatus;
  adopted_at: string;
};

function toLineAdoption(row: LineAdoptionRow): LineAdoption {
  return {
    id: row.id,
    projectId: row.project_id,
    ownerId: row.owner_id,
    lineItemId: row.line_item_id,
    quoteGroupRequestId: row.quote_group_request_id,
    status: row.status,
    adoptedAt: row.adopted_at,
  };
}

/**
 * 印を付ける前に3つ確かめる。呼び出し側（markLine）から使う。
 * - 依頼が ownerId の持ち物であること（他人の依頼IDを知っていても採用できない。IDOR対策）。
 * - その依頼が属するグループの案件が、渡された projectId と一致すること
 *   （別案件の依頼を、この案件の明細に紐づけられないようにする）。
 * - 明細が、その依頼の対象範囲（lineItemIds）に入っていること
 *   （頼んでいない明細の単価を採る経路を作らない。範囲の実在性は依頼を作る時点で
 *   createQuoteGroupRequest が見積に対して検証済み）。
 */
async function assertMarkable(
  input: AdoptLineInput,
  ownerId: string,
): Promise<void> {
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
}

/**
 * 明細1件について、社ごとの依頼に「採用」または「保留」の印を付ける。
 * 同じ社に付け直すと、その社の印だけが置き換わる（増えない）。
 *
 * **採用に付け替えたとき、それまで採用だった社は保留に下がる。** 消さない。
 * 1明細につき採用は1社までという排他（DBの部分 unique index）を守りつつ、
 * 「採用でも保留でも一覧に貯まる」（利用者の指示 2026-08-07）を両立させるには
 * これしかない。消すと、一度採ってから採り直した社が一覧から消える。
 *
 * **「下ろす」と「上げる」は1トランザクションで行う**（DB関数 public.mark_line。
 * supabase/migrations/20260807020000_mark_line_atomic.sql）。分けて書くと、
 * 上げる側が失敗したときに前の採用が保留に下がったまま残り、その明細が
 * 採用0社になる。
 */
export async function markLine(
  input: MarkLineInput,
  ownerId: string,
): Promise<LineAdoption> {
  await assertMarkable(input, ownerId);

  const { data, error } = await getSupabaseClient()
    .rpc("mark_line", {
      p_project_id: input.projectId,
      p_owner_id: ownerId,
      p_line_item_id: input.lineItemId,
      p_request_id: input.quoteGroupRequestId,
      p_status: input.status,
    })
    .single();
  if (error) throw error;
  return toLineAdoption(data as LineAdoptionRow);
}

/** `markLine` の採用側。既存の呼び出し元（比較表・デモの投入）はこちらを使う。 */
export async function adoptLine(
  input: AdoptLineInput,
  ownerId: string,
): Promise<LineAdoption> {
  return markLine({ ...input, status: "adopted" }, ownerId);
}

/**
 * 採用を取り消せたら true。採用していない明細・他人の持ち物なら何もせず false。
 * **消すのは採用の印だけ**で、同じ明細に付いている保留の印は残す。
 */
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
    .eq("status", "adopted")
    .select("id");
  if (error) throw error;
  return (data as { id: string }[]).length > 0;
}

async function listMarks(
  projectId: string,
  ownerId: string,
  status: LineMarkStatus | null,
): Promise<LineAdoption[]> {
  if (!isUuid(projectId)) return [];

  let query = getSupabaseClient()
    .from("line_adoptions")
    .select(COLUMNS)
    .eq("project_id", projectId)
    .eq("owner_id", ownerId);
  if (status !== null) query = query.eq("status", status);

  const { data, error } = await query.order("adopted_at", { ascending: true });
  if (error) throw error;
  return (data as LineAdoptionRow[]).map(toLineAdoption);
}

/**
 * 案件の**採用だけ**の一覧。比較表と見積書が「どの明細をどの社で採ったか」を
 * 描くために使う。1明細につき最大1件しか返らない（部分 unique index による）。
 *
 * **保留は返さない。** 保留の単価を見積に重ねてしまうと、採っていない社の値段が
 * 書類に出る。保留も要るときは `listLineMarksForProject` を使う。
 */
export async function listLineAdoptionsForProject(
  projectId: string,
  ownerId: string,
): Promise<LineAdoption[]> {
  return listMarks(projectId, ownerId, "adopted");
}

/**
 * 案件の**採用と保留の両方**の一覧。下請け見積もり一覧（docs/flows.md D7）が
 * 「どの社のどの明細に、採用マーク／保留マークが付いているか」を描くために使う。
 */
export async function listLineMarksForProject(
  projectId: string,
  ownerId: string,
): Promise<LineAdoption[]> {
  return listMarks(projectId, ownerId, null);
}
