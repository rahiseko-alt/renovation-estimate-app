"use server";

import { redirect } from "next/navigation";

import { isDemoOwner } from "../../../../lib/auth/demoOwner";
import { getCurrentUser } from "../../../../lib/auth/server";
import { updateProjectForOwner } from "../../../../lib/db/projects";

/**
 * D2「案件をつくる」の「次へ」（docs/flows.md「デモの画面の並び」）。
 *
 * **案件は作らない。** D1 の seed が既に1件作っているので、ここは**更新**する
 * （作ると、デモの1回の経路で案件が2件になる）。所有者で絞るのは
 * `updateProjectForOwner` の側で、他人のIDを渡しても1行も書き換わらない。
 *
 * 空欄の弾き方は通常経路（`app/projects/new/actions.ts`）に合わせる：
 * 前後の空白を落として、どちらかが空なら同じ画面へ戻す。
 */
export async function saveDemoProjectAction(
  projectId: string,
  formData: FormData,
): Promise<void> {
  const ownerId = await getCurrentUser();
  // 画面（page.tsx）で既に確かめているが、Server Action は画面を通さずに叩けるので
  // ここでも確かめる（送信ゲートをサーバでもう一度見るのと同じ理由）。
  if (!ownerId || !isDemoOwner(ownerId)) {
    throw new Error("この案件は編集できません。");
  }

  const customerName = String(formData.get("customerName") ?? "").trim();
  const siteAddress = String(formData.get("siteAddress") ?? "").trim();

  if (!customerName || !siteAddress) {
    redirect(`/demo/${projectId}/project?failed=1`);
  }

  const updated = await updateProjectForOwner(
    projectId,
    { customerName, siteAddress },
    ownerId,
  );
  if (!updated) {
    throw new Error("この案件は編集できません。");
  }

  // D2 の次は D3（写真を撮る）。行き先を変えるときは、実装より先に
  // docs/flows.md の表を直してもらう。
  redirect(`/demo/${projectId}/photo`);
}
