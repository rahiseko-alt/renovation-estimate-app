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

/** 区分1件の印を上書きする（project_id, category の組で upsert）。 */
export async function setSiteConditionCheck(
  projectId: string,
  ownerId: string,
  category: SiteConditionCategory,
  mark: SiteConditionMark,
): Promise<SiteConditionCheck> {
  const { data, error } = await getSupabaseClient()
    .from("site_condition_checks")
    .upsert(
      {
        project_id: projectId,
        owner_id: ownerId,
        category,
        mark,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,category" },
    )
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toSiteConditionCheck(data as SiteConditionCheckRow);
}
