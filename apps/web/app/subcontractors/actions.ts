"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "../../lib/auth/server";
import { FAILED_LIMIT, SUBCONTRACTORS_TEXT } from "../../lib/content";
import {
  createSubcontractor,
  deleteSubcontractorForOwner,
} from "../../lib/db/subcontractors";

/**
 * 下請台帳の登録・削除。
 *
 * Server Action は一覧表示とは別の更新入口なので、ここでもログイン状態を確認する
 * （app/price-master/actions.ts と同じIDOR対策。他人のIDを渡しても何も起きない）。
 *
 * 長さの上限はDBの制約ではなくここで止める。この列を書けるのはログイン済みの
 * 所有者だけで、`/q/[token]` のような第三者の入口ではないため、移行を足さずに
 * アプリ側の境界で受け止める。
 */
const MAX_COMPANY_NAME_LENGTH = 200;
const MAX_EMAIL_LENGTH = 320;

/**
 * メールアドレスの最低限の形。厳密な検証はしない（RFCに沿った正規表現は実務では
 * 誤って弾く方が害が大きい）。ここで見るのは「@の前後に文字があり、空白を含まない」だけ。
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

/** 件数の上限で断られた例外かどうか。文面は文言の置き場所が1つだけ持つ。 */
function isLimitError(error: unknown): boolean {
  return (
    error instanceof Error && error.message === SUBCONTRACTORS_TEXT.failedLimit
  );
}

export async function createSubcontractorAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getCurrentUser();
  if (!ownerId) {
    redirect("/login");
  }

  const companyName = String(formData.get("companyName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  const valid =
    companyName !== "" &&
    companyName.length <= MAX_COMPANY_NAME_LENGTH &&
    email.length <= MAX_EMAIL_LENGTH &&
    EMAIL_SHAPE.test(email);

  if (!valid) {
    redirect("/subcontractors?failed=1");
  }

  try {
    await createSubcontractor({ companyName, email }, ownerId);
  } catch (error) {
    // 上限に達したときだけ、入力内容の不備（failed=1）と別の理由として画面に伝える。
    // それ以外の失敗はここで握りつぶさず、そのまま投げ直す。
    if (isLimitError(error)) {
      redirect(`/subcontractors?failed=${FAILED_LIMIT}`);
    }
    throw error;
  }
  redirect("/subcontractors");
}

export async function deleteSubcontractorAction(
  formData: FormData,
): Promise<void> {
  const ownerId = await getCurrentUser();
  if (!ownerId) {
    redirect("/login");
  }

  const id = String(formData.get("id") ?? "");
  await deleteSubcontractorForOwner(id, ownerId);
  redirect("/subcontractors");
}
