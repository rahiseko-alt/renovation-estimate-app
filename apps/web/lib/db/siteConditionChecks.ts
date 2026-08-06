// 施工条件・範囲リスト（法定⑦施工環境・施工制約。docs/design.md 5章・7章）のデータアクセス。
// 画面はここだけを通す。テーブル定義は
// supabase/migrations/20260805060400_site_condition_checks.sql。
//
// 一次情報（建設生産システム合理化推進協議会「施工条件・範囲リスト」第4版）の
// 使い方どおり、元請は各区分に○（含める）／×（含めない）を付けるだけで、
// 自由記述は持たない。

import { getSupabaseClient } from "./client";
import {
  SITE_CONDITION_CATEGORIES,
  type SiteConditionCategory,
  type SiteConditionCheck,
  type SiteConditionMark,
} from "./types";

const COLUMNS = "id, project_id, owner_id, category, mark, updated_at";

type SiteConditionCheckRow = {
  id: string;
  project_id: string;
  owner_id: string;
  category: SiteConditionCategory;
  mark: SiteConditionMark;
  updated_at: string;
};

function toSiteConditionCheck(row: SiteConditionCheckRow): SiteConditionCheck {
  return {
    id: row.id,
    projectId: row.project_id,
    ownerId: row.owner_id,
    category: row.category,
    mark: row.mark,
    updatedAt: row.updated_at,
  };
}

/** DBにまだ行が無い区分の合成表示（未検討の状態）。 */
function unsetCheck(
  projectId: string,
  ownerId: string,
  category: SiteConditionCategory,
): SiteConditionCheck {
  return {
    id: "",
    projectId,
    ownerId,
    category,
    mark: "unset",
    updatedAt: "",
  };
}

/**
 * 案件の施工条件・範囲リストを、SITE_CONDITION_CATEGORIES の12区分全部そろえて返す。
 * DBに行が無い区分は mark "unset" として合成する。
 */
export async function listSiteConditionChecks(
  projectId: string,
  ownerId: string,
): Promise<Record<SiteConditionCategory, SiteConditionCheck>> {
  const { data, error } = await getSupabaseClient()
    .from("site_condition_checks")
    .select(COLUMNS)
    .eq("project_id", projectId)
    .eq("owner_id", ownerId);
  if (error) throw error;

  const byCategory = new Map(
    (data as SiteConditionCheckRow[]).map((row) => [row.category, toSiteConditionCheck(row)]),
  );

  const result = {} as Record<SiteConditionCategory, SiteConditionCheck>;
  for (const category of SITE_CONDITION_CATEGORIES) {
    result[category] = byCategory.get(category) ?? unsetCheck(projectId, ownerId, category);
  }
  return result;
}

/** 一括保存の入力1件。 */
export type SiteConditionCheckInput = {
  category: SiteConditionCategory;
  mark: SiteConditionMark;
};

/**
 * 区分の印をまとめて上書きする（project_id, category の組で upsert）。
 * 画面は12区分を1回の保存で送るので、1件ずつ往復させずここで1クエリにまとめる。
 *
 * 呼び出し側で案件の所有者確認（getProjectForOwner）を済ませた上で使う
 * （lib/db/submissionGate.ts と同じ役割分担）。
 */
export async function setSiteConditionChecks(
  projectId: string,
  ownerId: string,
  inputs: SiteConditionCheckInput[],
): Promise<SiteConditionCheck[]> {
  if (inputs.length === 0) return [];

  // 同じ区分を2件渡すと upsert が
  // 「ON CONFLICT DO UPDATE command cannot affect row a second time」で落ちる。
  const seen = new Set<SiteConditionCategory>();
  for (const input of inputs) {
    if (seen.has(input.category)) {
      throw new Error("同じ施工条件の区分が重複して渡されました。");
    }
    seen.add(input.category);
  }

  const updatedAt = new Date().toISOString();
  const { data, error } = await getSupabaseClient()
    .from("site_condition_checks")
    .upsert(
      inputs.map((input) => ({
        project_id: projectId,
        owner_id: ownerId,
        category: input.category,
        mark: input.mark,
        updated_at: updatedAt,
      })),
      { onConflict: "project_id,category" },
    )
    .select(COLUMNS);
  if (error) throw error;
  return (data as SiteConditionCheckRow[]).map(toSiteConditionCheck);
}

/** 区分1件の印だけを上書きする。中身は setSiteConditionChecks と同じ経路を通る。 */
export async function setSiteConditionCheck(
  projectId: string,
  ownerId: string,
  category: SiteConditionCategory,
  mark: SiteConditionMark,
): Promise<SiteConditionCheck> {
  const [check] = await setSiteConditionChecks(projectId, ownerId, [
    { category, mark },
  ]);
  if (!check) throw new Error("施工条件を保存できませんでした。");
  return check;
}
