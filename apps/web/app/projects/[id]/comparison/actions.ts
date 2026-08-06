"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "../../../../lib/auth/server";
import { adoptLine, cancelLineAdoption } from "../../../../lib/db/lineAdoptions";
import { getProjectForOwner } from "../../../../lib/db/projects";

/**
 * 明細1件について、社ごとの依頼を採用する／採用をやめる。
 *
 * 所有者確認をここでも行う。画面で押せなくしても Server Action は直接叩ける
 * （app/projects/[id]/photos-actions.ts と同じ原則）。
 * 採用の排他（1明細1社）と、依頼の対象範囲の検査は lib/db/lineAdoptions.ts が行う。
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

export async function adoptLineAction(
  projectId: string,
  lineItemId: string,
  quoteGroupRequestId: string,
): Promise<void> {
  const ownerId = await requireProjectOwner(projectId);
  await adoptLine({ projectId, lineItemId, quoteGroupRequestId }, ownerId);
  revalidatePath(`/projects/${projectId}/comparison`);
}

export async function cancelLineAdoptionAction(
  projectId: string,
  lineItemId: string,
): Promise<void> {
  const ownerId = await requireProjectOwner(projectId);
  await cancelLineAdoption(projectId, lineItemId, ownerId);
  revalidatePath(`/projects/${projectId}/comparison`);
}
