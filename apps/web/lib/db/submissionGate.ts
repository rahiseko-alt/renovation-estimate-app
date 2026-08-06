// 送信ゲート（docs/design.md 7章「送信ゲート」）。
// 依頼グループを送ってよいかどうかを、サーバ側で判定する。
//
// 判定するのは次の21項目（①②は案件情報から自動、③は写真＋数量から導く製品仮説なので
// ここでは見ない。③の充足判定条件は未決＝docs/design.md 7章）:
//   - legal_item_slots の9スロットすべてが「値あり（filled）」か「未定を明示
//     （undetermined）」のどちらかであること
//   - site_condition_checks の12区分すべてが「未検討（unset）」でないこと
// 個数は LEGAL_ITEM_SLOT_KEYS / SITE_CONDITION_CATEGORIES から数える。
// 「9個」「12個」をここに書き写さない（項目が増減したとき、この判定だけが取り残されて
// 要件が実装レベルで消えたまま緑を返すのを防ぐ）。
//
// クライアント側の検証はバイパスできるので、画面での抑止とは別に必ずここを通す
// （lib/db/photoStorage.ts / app/projects/[id]/photos-actions.ts と同じ原則）。
//
// 例外は投げない。「何が足りないか」を呼び出し側が画面に出せるよう、結果型で返す。

import { listLegalItemSlots } from "./legalItemSlots";
import { listSiteConditionChecks } from "./siteConditionChecks";
import {
  LEGAL_ITEM_SLOT_KEYS,
  SITE_CONDITION_CATEGORIES,
  type LegalItemSlotKey,
  type LegalItemSlotStatus,
  type SiteConditionCategory,
  type SiteConditionMark,
} from "./types";

export type SubmissionGateResult = {
  /** 送信してよいか。unsetSlotKeys と unsetCategories が両方とも空のときだけ true。 */
  ok: boolean;
  /** 「値あり」でも「未定を明示」でもない法定項目スロット。 */
  unsetSlotKeys: LegalItemSlotKey[];
  /** 「未検討」のままの施工条件・範囲リストの区分。 */
  unsetCategories: SiteConditionCategory[];
};

/**
 * 「値あり」か「未定を明示」か。
 * 「未定」は利用者が明示的に選んだときだけ通す。未入力の穴埋めには使わない
 * （確定していないのか聞き忘れたのかを区別できなくなるため。docs/design.md 7章）。
 */
function isSlotSatisfied(status: LegalItemSlotStatus): boolean {
  return status === "filled" || status === "undetermined";
}

/** ○（条件内）か×（条件外）が付いているか（＝未検討でないか）。 */
function isCheckSatisfied(mark: SiteConditionMark): boolean {
  return mark !== "unset";
}

/**
 * 案件が送信条件を満たしているかを判定する。呼び出し側で案件の所有者確認
 * （getProjectForOwner）を済ませた上で使う（他の lib/db/ と同じ役割分担）。
 * 参照するデータは legalItemSlots.ts / siteConditionChecks.ts の公開関数から取り、
 * ここではクエリを書かない（AGENTS.md「結合を増やさない」4）。
 */
export async function checkSubmissionGate(
  projectId: string,
  ownerId: string,
): Promise<SubmissionGateResult> {
  const [slots, checks] = await Promise.all([
    listLegalItemSlots(projectId, ownerId),
    listSiteConditionChecks(projectId, ownerId),
  ]);

  const unsetSlotKeys = LEGAL_ITEM_SLOT_KEYS.filter(
    (slotKey) => !isSlotSatisfied(slots[slotKey].status),
  );
  const unsetCategories = SITE_CONDITION_CATEGORIES.filter(
    (category) => !isCheckSatisfied(checks[category].mark),
  );

  return {
    ok: unsetSlotKeys.length === 0 && unsetCategories.length === 0,
    unsetSlotKeys,
    unsetCategories,
  };
}
