"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "../../../../lib/auth/server";
import { DOCUMENT_CONFIRM_TEXT } from "../../../../lib/content";
import { formatDateJst } from "../../../../lib/doc/date";
import {
  computeResponseDueAt,
  meetsMinimumQuotePeriod,
  responseDueAtFromDateInput,
} from "../../../../lib/legalPeriod";
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
 * 依頼グループを作り、選んだ下請ぶんの依頼を1件ずつ作る。**行き先は決めない。**
 *
 * 送信の実体をここに置き、redirect は呼び出し側に持たせている。行き先は画面ごとに
 * 違う（送信画面は比較表へ、確認画面D3は送信しました画面へ）が、**送信そのものは
 * 1つしかない**ため（AGENTS.md「結合を増やさない」2）。行き先を引数で受け取る形に
 * すると、直接叩ける Server Action に転送先を渡せることになるので採らない。
 *
 * **送信ゲートをここでも通す。** 画面側でボタンを押せなくしていても Server Action は
 * 直接叩けるので、クライアント側の抑止だけに頼らない（docs/design.md 7章
 * 「サーバ側でも同じ検査をする」。app/projects/[id]/photos-actions.ts と同じ原則）。
 *
 * 予定価格帯が未選択のまま送らせない（同章「未選択のまま送信させない」）。
 *
 * 見積回答期限は responseDueDate を渡さなければグループの提示日時と帯から
 * lib/legalPeriod.ts が決める（/projects/[id]/send の通常経路はこれまでどおり）。
 * 確認画面（D4）だけが、元請の打ち直した日付を渡してくる。
 */
export async function sendQuoteRequestGroup(
  projectId: string,
  subcontractorIds: string[],
  plannedPriceBand: string,
  /** 元請が打ち直した見積回答期限（YYYY-MM-DD・日本時間）。省略すると自動計算。 */
  responseDueDate?: string,
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
  const band = plannedPriceBand as PlannedPriceBand;

  // 期限を渡されたときだけ確かめる。**画面が弾いていても、ここでも弾く**
  // （この関数は Server Action なので直接叩ける）。グループを作る前に判定して、
  // 依頼の付かない空のグループが残らないようにする。
  let responseDueAt: Date | undefined;
  if (responseDueDate !== undefined) {
    const now = new Date();
    const parsed = responseDueAtFromDateInput(responseDueDate);
    if (!parsed) {
      throw new Error(DOCUMENT_CONFIRM_TEXT.responseDueMissing);
    }
    if (!meetsMinimumQuotePeriod(parsed, now, band)) {
      throw new Error(
        DOCUMENT_CONFIRM_TEXT.responseDueTooEarly(
          formatDateJst(computeResponseDueAt(now, band)),
        ),
      );
    }
    responseDueAt = parsed;
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
        plannedPriceBand: band,
        lineItemIds,
        responseDueAt,
      },
      ownerId,
    );
  }
}

/**
 * 送信画面（/projects/[id]/send）の送信ボタンが呼ぶ入口。
 * 送信そのものは sendQuoteRequestGroup に任せ、ここは行き先だけを持つ。
 */
export async function sendQuoteRequestGroupAction(
  projectId: string,
  subcontractorIds: string[],
  plannedPriceBand: string,
): Promise<void> {
  await sendQuoteRequestGroup(projectId, subcontractorIds, plannedPriceBand);
  redirect(`/projects/${projectId}/comparison`);
}
