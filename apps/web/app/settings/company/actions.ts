"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "../../../lib/auth/server";
import { upsertCompanyProfile } from "../../../lib/db/companyProfiles";
import {
  COMPANY_DEFAULT_SLOT_KEYS,
  MAX_COMPANY_FIELD_LENGTH,
  MAX_LEGAL_ITEM_SLOT_VALUE_LENGTH,
  type CompanyDefaultSlotKey,
} from "../../../lib/db/types";

/**
 * 会社設定の保存。
 *
 * Server Action は表示とは別の更新入口なので、ここでもログイン状態を確認する
 * （app/subcontractors/actions.ts と同じIDOR対策。他人のIDを渡しても何も起きない）。
 *
 * **受け取るキーは COMPANY_DEFAULT_SLOT_KEYS だけ。** クライアントから来た
 * オブジェクトをそのまま保存すると、画面に無いスロットや無関係なキーを
 * 混ぜ込まれる。語彙は `lib/db/types.ts` が唯一の正で、ここには書き写さない。
 */
const SLOT_KEY_SET: ReadonlySet<string> = new Set(COMPANY_DEFAULT_SLOT_KEYS);

export async function saveCompanyProfileAction(
  contractorName: string,
  representativeName: string,
  address: string,
  defaultSlotValues: Record<string, string>,
): Promise<void> {
  const ownerId = await getCurrentUser();
  if (!ownerId) {
    redirect("/login");
  }

  const fields = [contractorName, representativeName, address];
  if (fields.some((field) => field.length > MAX_COMPANY_FIELD_LENGTH)) {
    throw new Error("入力が長すぎます。");
  }

  const cleaned: Partial<Record<CompanyDefaultSlotKey, string>> = {};
  for (const [key, rawValue] of Object.entries(defaultSlotValues)) {
    if (!SLOT_KEY_SET.has(key)) continue;
    const value = String(rawValue ?? "").trim();
    if (value === "") continue;
    if (value.length > MAX_LEGAL_ITEM_SLOT_VALUE_LENGTH) {
      throw new Error("定型文が長すぎます。");
    }
    cleaned[key as CompanyDefaultSlotKey] = value;
  }

  await upsertCompanyProfile(ownerId, {
    contractorName: contractorName.trim(),
    representativeName: representativeName.trim(),
    address: address.trim(),
    defaultSlotValues: cleaned,
  });
}
