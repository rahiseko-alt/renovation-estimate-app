// 依頼グループ（docs/design.md 7章「依頼グループの単位」）のデータアクセス。
// 画面はここだけを通す。テーブル定義は
// supabase/migrations/20260805060600_quote_request_groups.sql。
//
// 1明細＝1依頼＝1社だった旧 quote_requests を、複数社への同時依頼に作り直したもの。
// グループ（提示日時を持つ）と、社ごとの依頼（宛先・トークン・予定価格帯・回答期限・
// 対象明細の範囲）の2段構成。

import { computeResponseDueAt, meetsMinimumQuotePeriod } from "../legalPeriod";
import { getSupabaseClient } from "./client";
import { getOrCreateEstimate } from "./estimates";
import { getSubcontractorForOwner } from "./subcontractors";
import type {
  NewQuoteGroupRequestInput,
  NewQuoteRequestGroupInput,
  PlannedPriceBand,
  QuoteGroupRequest,
  QuoteGroupRequestForSubcontractor,
  QuoteGroupRequestStatus,
  QuoteRequestGroup,
} from "./types";
import { isUuid } from "./uuid";

const GROUP_COLUMNS = "id, project_id, owner_id, presented_at, created_at";

type QuoteRequestGroupRow = {
  id: string;
  project_id: string;
  owner_id: string;
  presented_at: string;
  created_at: string;
};

function toQuoteRequestGroup(row: QuoteRequestGroupRow): QuoteRequestGroup {
  return {
    id: row.id,
    projectId: row.project_id,
    ownerId: row.owner_id,
    presentedAt: row.presented_at,
    createdAt: row.created_at,
  };
}

/**
 * 依頼グループを作る。呼び出し側で案件の所有者確認（getProjectForOwner）を
 * 済ませた上で使う（他の lib/db/ の create* 関数と同じ役割分担）。
 * 提示日時はここで確定させる（テーブルの既定値 now() に任せず、以後の
 * 見積回答期限の計算に同じ時刻を使う）。
 */
export async function createQuoteRequestGroup(
  input: NewQuoteRequestGroupInput,
  ownerId: string,
): Promise<QuoteRequestGroup> {
  const { data, error } = await getSupabaseClient()
    .from("quote_request_groups")
    .insert({
      project_id: input.projectId,
      owner_id: ownerId,
      presented_at: (input.presentedAt ?? new Date()).toISOString(),
    })
    .select(GROUP_COLUMNS)
    .single();
  if (error) throw error;
  return toQuoteRequestGroup(data as QuoteRequestGroupRow);
}

/**
 * 依頼グループを消す。**依頼を1件も作れなかったときの巻き戻しにだけ使う。**
 * 依頼の付かないグループが残ると、確認画面（D4）の「もう送ったか」の判定
 * （`hasQuoteRequestGroup`）がそれを見つけて、以後の送信を素通りさせる。
 * 所有者の一致を条件に入れる（他人のグループは消さない）。
 */
export async function deleteQuoteRequestGroupForOwner(
  id: string,
  ownerId: string,
): Promise<void> {
  if (!isUuid(id)) return;

  const { error } = await getSupabaseClient()
    .from("quote_request_groups")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId);
  if (error) throw error;
}

/** 依頼グループが存在し、かつ ownerId の持ち物であるときだけ返す。それ以外は null。 */
export async function getQuoteRequestGroupForOwner(
  id: string,
  ownerId: string,
): Promise<QuoteRequestGroup | null> {
  if (!isUuid(id)) return null;

  const { data, error } = await getSupabaseClient()
    .from("quote_request_groups")
    .select(GROUP_COLUMNS)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return data ? toQuoteRequestGroup(data as QuoteRequestGroupRow) : null;
}

const REQUEST_COLUMNS =
  "id, group_id, owner_id, subcontractor_id, token, planned_price_band, response_due_at, line_item_ids, status, responded_at, imported_at, created_at";

type QuoteGroupRequestRow = {
  id: string;
  group_id: string;
  owner_id: string;
  subcontractor_id: string;
  token: string;
  planned_price_band: PlannedPriceBand;
  response_due_at: string;
  line_item_ids: string[];
  status: QuoteGroupRequestStatus;
  responded_at: string | null;
  imported_at: string | null;
  created_at: string;
};

function toQuoteGroupRequest(row: QuoteGroupRequestRow): QuoteGroupRequest {
  return {
    id: row.id,
    groupId: row.group_id,
    ownerId: row.owner_id,
    subcontractorId: row.subcontractor_id,
    token: row.token,
    plannedPriceBand: row.planned_price_band,
    responseDueAt: row.response_due_at,
    lineItemIds: row.line_item_ids,
    status: row.status,
    respondedAt: row.responded_at,
    importedAt: row.imported_at,
    createdAt: row.created_at,
  };
}

/**
 * 社ごとの依頼を1件作る。見積回答期限は、渡されればその日を、渡されなければ
 * グループの提示日時と予定価格帯から計算した日を保存する
 * （docs/design.md 7章「見積期間の元になる予定価格」）。
 * 呼び出し側で案件・グループの所有者確認を済ませた上で使う。
 *
 * さらにここで2つ確かめる（CodeRabbit のレビューで指摘。IDOR / データ整合性）。
 * - subcontractorId が ownerId の持ち物であること。確かめずに insert すると、
 *   他人の下請台帳のIDを自分の依頼に紐づけられてしまう（owner_id 列はここで
 *   自分のものに上書きするが、subcontractor_id が指す行の持ち主までは検証していなかった）。
 * - lineItemIds が、対象案件の見積に実在する明細行のIDだけであること。存在しない
 *   ID・他案件のIDが紛れ込むと、比較表・採用（PR-C）が壊れた範囲を参照してしまう。
 */
export async function createQuoteGroupRequest(
  input: NewQuoteGroupRequestInput,
  ownerId: string,
): Promise<QuoteGroupRequest> {
  const group = await getQuoteRequestGroupForOwner(input.groupId, ownerId);
  if (!group) {
    throw new Error("依頼グループが見つかりません。");
  }

  const subcontractor = await getSubcontractorForOwner(
    input.subcontractorId,
    ownerId,
  );
  if (!subcontractor) {
    throw new Error("下請が見つかりません。");
  }

  const estimate = await getOrCreateEstimate(group.projectId);
  const validLineIds = new Set(estimate.lines.map((line) => line.id));
  if (input.lineItemIds.some((id) => !validLineIds.has(id))) {
    throw new Error("対象明細の範囲に、存在しない明細IDが含まれています。");
  }

  // 渡されなければ提示日時＋法定日数で自動計算する（通常経路はこのまま）。
  // 渡された期限は、**保存する直前にもう一度**法定の最短見積期間と突き合わせる。
  // ここが依頼を書き込む唯一の場所なので、どの入口から来ても法令違反の期限が
  // 保存されないことを、この1箇所で保証できる。
  const presentedAt = new Date(group.presentedAt);
  const responseDueAt =
    input.responseDueAt ??
    computeResponseDueAt(presentedAt, input.plannedPriceBand);
  if (!meetsMinimumQuotePeriod(responseDueAt, presentedAt, input.plannedPriceBand)) {
    throw new Error("見積回答期限が、法定の最短見積期間より短くなっています。");
  }

  const { data, error } = await getSupabaseClient()
    .from("quote_group_requests")
    .insert({
      group_id: input.groupId,
      owner_id: ownerId,
      subcontractor_id: input.subcontractorId,
      planned_price_band: input.plannedPriceBand,
      response_due_at: responseDueAt.toISOString(),
      line_item_ids: input.lineItemIds,
    })
    .select(REQUEST_COLUMNS)
    .single();
  if (error) throw error;
  return toQuoteGroupRequest(data as QuoteGroupRequestRow);
}

/** グループに属する社ごとの依頼一覧。呼び出し側で所有者確認を済ませた上で使う。 */
export async function listQuoteGroupRequestsForGroup(
  groupId: string,
  ownerId: string,
): Promise<QuoteGroupRequest[]> {
  if (!isUuid(groupId)) return [];

  const { data, error } = await getSupabaseClient()
    .from("quote_group_requests")
    .select(REQUEST_COLUMNS)
    .eq("group_id", groupId)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as QuoteGroupRequestRow[]).map(toQuoteGroupRequest);
}

/** 社ごとの依頼が存在し、かつ ownerId の持ち物であるときだけ返す。それ以外は null。 */
export async function getQuoteGroupRequestForOwner(
  id: string,
  ownerId: string,
): Promise<QuoteGroupRequest | null> {
  if (!isUuid(id)) return null;

  const { data, error } = await getSupabaseClient()
    .from("quote_group_requests")
    .select(REQUEST_COLUMNS)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return data ? toQuoteGroupRequest(data as QuoteGroupRequestRow) : null;
}

type QuoteGroupRequestForSubcontractorRow = {
  id: string;
  token: string;
  response_due_at: string;
  line_item_ids: string[];
  status: QuoteGroupRequestStatus;
  quote_request_groups: {
    projects: {
      work_name: string;
      site_address: string;
    };
  };
};

/**
 * token から、下請に見せてよい範囲だけを取得する。下請の回答画面専用の入口で、
 * owner による絞り込みは行わない（token そのものが資格情報。ここ以外から呼ばない）。
 *
 * 戻り値の型（QuoteGroupRequestForSubcontractor）が、売価・掛率・原価・owner_id・
 * 施主名を意図的に持たない。ここで select する列自体も、その型を組み立てるのに
 * 要るものだけに絞る（select * にしない）。他社の値が混ざる経路も無い
 * （token 1件に対して行が1件だけ返るクエリのため）。
 */
export async function getQuoteGroupRequestForSubcontractor(
  token: string,
): Promise<QuoteGroupRequestForSubcontractor | null> {
  if (!isUuid(token)) return null;

  const { data, error } = await getSupabaseClient()
    .from("quote_group_requests")
    .select(
      `
        id,
        token,
        response_due_at,
        line_item_ids,
        status,
        quote_request_groups!inner (
          projects!inner ( work_name, site_address )
        )
      `,
    )
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as QuoteGroupRequestForSubcontractorRow;
  return {
    id: row.id,
    token: row.token,
    workName: row.quote_request_groups.projects.work_name,
    siteAddress: row.quote_request_groups.projects.site_address,
    responseDueAt: row.response_due_at,
    lineItemIds: row.line_item_ids,
    status: row.status,
  };
}

/**
 * 下請の回答画面に出す明細。**金額を持たない**（id・工事項目・摘要・数量・単位だけ）。
 * estimates.lines は元請の売価 unitPrice を持っているので、そのまま渡さない
 * （docs/design.md 7章「下請に見せるもの・見せないもの」）。
 */
export type QuoteLineForSubcontractor = {
  id: string;
  name: string;
  spec: string;
  quantity: number;
  unit: string;
};

/**
 * token から、その依頼が対象にしている明細だけを、金額を落とした形で取る。
 * 依頼の対象範囲（line_item_ids）に入っている明細だけを返す。範囲外の明細は
 * 同じ案件のものでも返さない。
 */
export async function listQuoteLinesForSubcontractor(
  token: string,
): Promise<QuoteLineForSubcontractor[]> {
  if (!isUuid(token)) return [];

  const { data, error } = await getSupabaseClient()
    .from("quote_group_requests")
    .select(
      `
        line_item_ids,
        quote_request_groups!inner ( project_id )
      `,
    )
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return [];

  const row = data as unknown as {
    line_item_ids: string[];
    quote_request_groups: { project_id: string };
  };

  const estimate = await getOrCreateEstimate(row.quote_request_groups.project_id);
  const requested = new Set(row.line_item_ids);
  return estimate.lines
    .filter((line) => requested.has(line.id))
    .map((line) => ({
      id: line.id,
      name: line.name,
      spec: line.spec,
      quantity: line.quantity,
      unit: line.unit,
    }));
}
