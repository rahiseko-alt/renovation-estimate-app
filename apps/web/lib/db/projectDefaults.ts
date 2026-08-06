// 新しい案件に、会社設定の定型文を初期値として入れる
// （supabase/migrations/20260805060200_company_profiles.sql の設計どおり
// 「新しい案件を作るときにここから値をコピーする」）。
//
// **なぜ参照ではなく複製なのか。** 法定項目は案件ごとに上書きできる。参照のままだと、
// 会社設定を直した瞬間に、既に下請へ送った案件の内容まで遡って変わってしまう。
// 送った書類と画面の内容が食い違うのは事故なので、作成時点の値をその案件に固定する。
//
// **なぜ会社設定でも法定項目でもなく、この独立したファイルなのか。**
// この処理は company_profiles と legal_item_slots の両方を知る必要がある。
// どちらかの中に置くと、片方がもう片方を import することになり、
// 「他の機能の内部を直接触らない」（AGENTS.md）が崩れる。組み立てだけをここに置き、
// 双方は今までどおり互いを知らないままにする。

import { getCompanyProfile } from "./companyProfiles";
import { setLegalItemSlots, type LegalItemSlotInput } from "./legalItemSlots";
import { COMPANY_DEFAULT_SLOT_KEYS, type LegalItemSlot } from "./types";

/**
 * 会社設定の定型文を、その案件の法定項目へ複製する。
 *
 * 空文字の定型文は入れない。空で書き込むと、スロットの状態が「未入力」ではなく
 * 「記入する（中身は空）」に見えてしまい、送信ゲートの意味が変わる。
 * 何も設定していない事業者では1件も書かず、9スロットすべてが未入力のまま始まる。
 *
 * 既に値のある案件へ後から呼ぶ用途は想定していない（案件の作成直後にだけ呼ぶ）。
 */
export async function applyCompanyDefaultsToProject(
  projectId: string,
  ownerId: string,
): Promise<LegalItemSlot[]> {
  const profile = await getCompanyProfile(ownerId);

  const inputs: LegalItemSlotInput[] = [];
  for (const slotKey of COMPANY_DEFAULT_SLOT_KEYS) {
    const value = (profile.defaultSlotValues[slotKey] ?? "").trim();
    if (value === "") continue;
    inputs.push({ slotKey, status: "filled", value });
  }

  return setLegalItemSlots(projectId, ownerId, inputs);
}
