"use server";

import { getCurrentUser } from "../../../../lib/auth/server";
import {
  setLegalItemSlots,
  type LegalItemSlotInput,
} from "../../../../lib/db/legalItemSlots";
import { getProjectForOwner } from "../../../../lib/db/projects";
import {
  setSiteConditionChecks,
  type SiteConditionCheckInput,
} from "../../../../lib/db/siteConditionChecks";
import {
  LEGAL_ITEM_SLOT_KEYS,
  LEGAL_ITEM_SLOT_STATUSES,
  SITE_CONDITION_CATEGORIES,
  SITE_CONDITION_MARKS,
} from "../../../../lib/db/types";

const SLOT_KEY_SET: ReadonlySet<string> = new Set(LEGAL_ITEM_SLOT_KEYS);
const CATEGORY_SET: ReadonlySet<string> = new Set(SITE_CONDITION_CATEGORIES);
const STATUS_SET: ReadonlySet<string> = new Set(LEGAL_ITEM_SLOT_STATUSES);
const MARK_SET: ReadonlySet<string> = new Set(SITE_CONDITION_MARKS);

/**
 * 法定項目スロットと施工条件の印をまとめて保存する。
 *
 * **画面での検証はバイパスできるので、同じ検証をここでも行う**
 * （app/projects/[id]/photos-actions.ts / app/q/[token]/group-actions.ts と同じ原則）。
 * 語彙（スロットキー・区分・状態）は lib/db/types.ts の配列から引き当てて確かめ、
 * ここに文字列を書き写さない。項目が増えたときにこの検証だけが取り残されないため。
 *
 * 「記入する（filled）のとき本文が要る」は lib/db/legalItemSlots.ts が保つので、
 * ここでは重ねて書かない。
 */
export async function saveLegalItemsAction(
  projectId: string,
  slots: LegalItemSlotInput[],
  checks: SiteConditionCheckInput[],
): Promise<{ ok: boolean }> {
  const ownerId = await getCurrentUser();
  if (!ownerId) {
    throw new Error("ログインしてください。");
  }

  // 案件の所有者確認。lib/db/ の upsert は project_id を鍵にするので、
  // ここを通さないと他人の案件の項目を書き換えられる。
  const project = await getProjectForOwner(projectId, ownerId);
  if (!project) {
    throw new Error("案件が見つかりません。");
  }

  for (const slot of slots) {
    if (!SLOT_KEY_SET.has(slot.slotKey) || !STATUS_SET.has(slot.status)) {
      throw new Error("法定項目の指定が不正です。");
    }
  }
  for (const check of checks) {
    if (!CATEGORY_SET.has(check.category) || !MARK_SET.has(check.mark)) {
      throw new Error("施工条件の指定が不正です。");
    }
  }

  await setLegalItemSlots(projectId, ownerId, slots);
  await setSiteConditionChecks(projectId, ownerId, checks);
  return { ok: true };
}
