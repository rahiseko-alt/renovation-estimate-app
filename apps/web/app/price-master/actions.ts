"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "../../lib/auth/server";
import { deletePriceMasterItemForOwner } from "../../lib/db/priceMaster";

/**
 * 単価マスタの削除。Server Action は一覧表示とは別の更新入口なので、
 * ここでもログイン状態と所有者を確認してから削除する
 * （saveEstimateAction と同じIDOR対策。他人のIDを渡しても何も起きない）。
 */
export async function deletePriceMasterItemAction(
  formData: FormData,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const id = String(formData.get("id") ?? "");
  await deletePriceMasterItemForOwner(id, user);
  redirect("/price-master");
}
