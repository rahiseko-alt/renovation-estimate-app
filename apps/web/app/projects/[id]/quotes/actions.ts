"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "../../../../lib/auth/server";
import { markLine } from "../../../../lib/db/lineAdoptions";
import { getProjectForOwner } from "../../../../lib/db/projects";
import { LINE_MARK_STATUSES } from "../../../../lib/db/types";
import type { LineMarkStatus } from "../../../../lib/db/types";

/**
 * D6（見積もり書類）で、明細1件にその社の「採用」または「保留」の印を付ける。
 *
 * 所有者確認をここでも行う。画面で押せなくしても Server Action は直接叩ける
 * （app/projects/[id]/comparison/actions.ts と同じ原則）。
 * 採用の排他（1明細1社）と、依頼の対象範囲の検査、採用を付け替えたときに
 * 前の社を保留へ下ろす扱いは lib/db/lineAdoptions.ts が行う。
 */
async function requireProjectOwner(projectId: string): Promise<string> {
  const ownerId = await getCurrentUser();
  if (!ownerId) {
    throw new Error("ログインしてください。");
  }
  const project = await getProjectForOwner(projectId, ownerId);
  if (!project) {
    throw new Error("案件が見つかりません。");
  }
  return ownerId;
}

export async function markLineAction(
  projectId: string,
  lineItemId: string,
  quoteGroupRequestId: string,
  status: LineMarkStatus,
): Promise<void> {
  const ownerId = await requireProjectOwner(projectId);
  // 直接叩かれたときに未知の状態が入らないようにする（型は実行時には残らない）。
  if (!LINE_MARK_STATUSES.includes(status)) {
    throw new Error("印の種類が不正です。");
  }
  await markLine(
    { projectId, lineItemId, quoteGroupRequestId, status },
    ownerId,
  );
  // 押しても画面は移らない（docs/flows.md D6）が、一覧（D7）と
  // この画面自身の印は次に開いたときに新しくする。
  revalidatePath(`/projects/${projectId}/quotes`);
  revalidatePath(`/projects/${projectId}/quotes/${quoteGroupRequestId}`);
}
