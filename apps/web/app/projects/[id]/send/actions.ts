"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "../../../../lib/auth/server";
import { getOrCreateEstimate } from "../../../../lib/db/estimates";
import { getProjectForOwner } from "../../../../lib/db/projects";
import {
  createQuoteGroupRequest,
  createQuoteRequestGroup,
} from "../../../../lib/db/quoteRequestGroups";
import { checkSubmissionGate } from "../../../../lib/db/submissionGate";
import { PLANNED_PRICE_BANDS, type PlannedPriceBand } from "../../../../lib/db/types";

const PRICE_BAND_SET: ReadonlySet<string> = new Set(PLANNED_PRICE_BANDS);

/**
 * 依頼グループを作り、選んだ下請ぶんの依頼を1件ずつ作る。
 *
 * **送信ゲートをここでも通す。** 画面側でボタンを押せなくしていても Server Action は
 * 直接叩けるので、クライアント側の抑止だけに頼らない（docs/design.md 7章
 * 「サーバ側でも同じ検査をする」。app/projects/[id]/photos-actions.ts と同じ原則）。
 *
 * 予定価格帯が未選択のまま送らせない（同章「未選択のまま送信させない」）。
 * 見積回答期限はグループの提示日時と帯から lib/legalPeriod.ts が決める。
 */
export async function sendQuoteRequestGroupAction(
  projectId: string,
  subcontractorIds: string[],
  plannedPriceBand: string,
): Promise<void> {
  const ownerId = await getCurrentUser();
  if (!ownerId) {
    throw new Error("ログインしてください。");
  }
  const project = await getProjectForOwner(projectId, ownerId);
  if (!project) {
    throw new Error("案件が見つかりません。");
  }

  // 画面のチェックボックスでは重複しないが、Server Action は直接叩ける。
  // 重複したまま回すと、同じ社に2本のトークンが出て比較表に同じ社が2列並ぶ。
  const uniqueSubcontractorIds = [...new Set(subcontractorIds)];
  if (uniqueSubcontractorIds.length === 0) {
    throw new Error("送り先を1社以上選んでください。");
  }
  if (!PRICE_BAND_SET.has(plannedPriceBand)) {
    throw new Error("予定価格帯を選んでください。");
  }

  const gate = await checkSubmissionGate(projectId, ownerId);
  if (!gate.ok) {
    throw new Error("法定項目に未記入があるため送信できません。");
  }

  // 依頼の対象は見積の全明細。単価は下請が埋めるので、ここでは範囲だけを渡す。
  const estimate = await getOrCreateEstimate(projectId);
  const lineItemIds = estimate.lines.map((line) => line.id);

  const group = await createQuoteRequestGroup({ projectId }, ownerId);
  for (const subcontractorId of uniqueSubcontractorIds) {
    await createQuoteGroupRequest(
      {
        groupId: group.id,
        subcontractorId,
        plannedPriceBand: plannedPriceBand as PlannedPriceBand,
        lineItemIds,
      },
      ownerId,
    );
  }

  redirect(`/projects/${projectId}/comparison`);
}
