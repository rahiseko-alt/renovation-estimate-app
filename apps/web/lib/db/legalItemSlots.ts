// 法定項目スロット（建設業法。docs/design.md 3章・7章）のデータアクセス。
// 画面はここだけを通す。テーブル定義は supabase/migrations/20260805060100_legal_item_slots.sql。
//
// 「未定」は利用者が明示的に選んだ項目にだけ持たせ、入力し忘れとは区別する。
// status="filled" のとき value を必須にする検証は移行（check 制約）にもあるが、
// ここでも確かめる（外部入力の境界であり、DBの制約エラーより分かりやすい理由で
// 早めに落とすため）。

import { getSupabaseClient } from "./client";
import {
  LEGAL_ITEM_SLOT_KEYS,
  MAX_LEGAL_ITEM_SLOT_VALUE_LENGTH,
  type LegalItemSlot,
  type LegalItemSlotKey,
  type LegalItemSlotStatus,
} from "./types";

/** 一括保存の入力1件。画面はスロットの3状態をそのまま渡す。 */
export type LegalItemSlotInput = {
  slotKey: LegalItemSlotKey;
  status: LegalItemSlotStatus;
  value: string | null;
};

const COLUMNS = "id, project_id, owner_id, slot_key, status, value, updated_at";

type LegalItemSlotRow = {
  id: string;
  project_id: string;
  owner_id: string;
  slot_key: LegalItemSlotKey;
  status: LegalItemSlotStatus;
  value: string | null;
  updated_at: string;
};

function toLegalItemSlot(row: LegalItemSlotRow): LegalItemSlot {
  return {
    id: row.id,
    projectId: row.project_id,
    ownerId: row.owner_id,
    slotKey: row.slot_key,
    status: row.status,
    value: row.value,
    updatedAt: row.updated_at,
  };
}

/** DBにまだ行が無いスロットの合成表示（何も選んでいない状態）。 */
function unsetSlot(
  projectId: string,
  ownerId: string,
  slotKey: LegalItemSlotKey,
): LegalItemSlot {
  return {
    id: "",
    projectId,
    ownerId,
    slotKey,
    status: "unset",
    value: null,
    updatedAt: "",
  };
}

/**
 * 案件の法定項目スロットを、LEGAL_ITEM_SLOT_KEYS の9キー全部そろえて返す。
 * DBに行が無いキーは status "unset" として合成する。呼び出し側は
 * 「9キー全部そろっている」前提でループできる（8個などをハードコードしない）。
 */
export async function listLegalItemSlots(
  projectId: string,
  ownerId: string,
): Promise<Record<LegalItemSlotKey, LegalItemSlot>> {
  const { data, error } = await getSupabaseClient()
    .from("legal_item_slots")
    .select(COLUMNS)
    .eq("project_id", projectId)
    .eq("owner_id", ownerId);
  if (error) throw error;

  const bySlotKey = new Map(
    (data as LegalItemSlotRow[]).map((row) => [row.slot_key, toLegalItemSlot(row)]),
  );

  const result = {} as Record<LegalItemSlotKey, LegalItemSlot>;
  for (const slotKey of LEGAL_ITEM_SLOT_KEYS) {
    result[slotKey] = bySlotKey.get(slotKey) ?? unsetSlot(projectId, ownerId, slotKey);
  }
  return result;
}

/**
 * upsert に渡す1行を組み立てる。
 * status が "filled" でなければ、渡された value は無視して null に置き換える
 * （「未定」や「未入力」に本文が残っていると、後で filled と誤読される余地が生まれるため。
 * status と value を必ず一致させる不変条件を、呼び出し側の入力に関わらずここで保つ）。
 */
function toUpsertRow(
  projectId: string,
  ownerId: string,
  input: LegalItemSlotInput,
  updatedAt: string,
): Record<string, unknown> {
  const trimmed = input.status === "filled" ? (input.value ?? "").trim() : "";
  if (input.status === "filled" && trimmed === "") {
    throw new Error("値ありにする場合は value が必要です。");
  }
  if (trimmed.length > MAX_LEGAL_ITEM_SLOT_VALUE_LENGTH) {
    throw new Error("法定項目の内容が長すぎます。");
  }

  return {
    project_id: projectId,
    owner_id: ownerId,
    slot_key: input.slotKey,
    status: input.status,
    value: input.status === "filled" ? trimmed : null,
    updated_at: updatedAt,
  };
}

/**
 * スロットをまとめて上書きする（project_id, slot_key の組で upsert）。
 * 画面は9スロットを1回の保存で送るので、1件ずつ往復させずここで1クエリにまとめる。
 *
 * 呼び出し側で案件の所有者確認（getProjectForOwner）を済ませた上で使う
 * （lib/db/submissionGate.ts と同じ役割分担）。
 */
export async function setLegalItemSlots(
  projectId: string,
  ownerId: string,
  inputs: LegalItemSlotInput[],
): Promise<LegalItemSlot[]> {
  if (inputs.length === 0) return [];

  // 同じスロットを2件渡すと Postgres の upsert が
  // 「ON CONFLICT DO UPDATE command cannot affect row a second time」で落ちる。
  // DBのエラーより前に、何が重複しているか分かる形で止める。
  const seen = new Set<LegalItemSlotKey>();
  for (const input of inputs) {
    if (seen.has(input.slotKey)) {
      throw new Error("同じ法定項目が重複して渡されました。");
    }
    seen.add(input.slotKey);
  }

  const updatedAt = new Date().toISOString();
  const rows = inputs.map((input) =>
    toUpsertRow(projectId, ownerId, input, updatedAt),
  );

  const { data, error } = await getSupabaseClient()
    .from("legal_item_slots")
    .upsert(rows, { onConflict: "project_id,slot_key" })
    .select(COLUMNS);
  if (error) throw error;
  return (data as LegalItemSlotRow[]).map(toLegalItemSlot);
}

/** スロット1件だけを上書きする。中身は setLegalItemSlots と同じ経路を通る。 */
export async function setLegalItemSlot(
  projectId: string,
  ownerId: string,
  slotKey: LegalItemSlotKey,
  status: LegalItemSlotStatus,
  value: string | null,
): Promise<LegalItemSlot> {
  const [slot] = await setLegalItemSlots(projectId, ownerId, [
    { slotKey, status, value },
  ]);
  if (!slot) throw new Error("法定項目を保存できませんでした。");
  return slot;
}
