// 会社設定（docs/design.md 7章「画面は5つ」）のデータアクセス。画面はここだけを通す。
// 1事業者＝1設定（owner_id が主キー）。テーブル定義は
// supabase/migrations/20260805060200_company_profiles.sql。

import { getSupabaseClient } from "./client";
import type {
  CompanyProfile,
  LegalItemSlotKey,
  UpdateCompanyProfileInput,
} from "./types";

const COLUMNS =
  "owner_id, contractor_name, representative_name, address, default_slot_values, updated_at";

type CompanyProfileRow = {
  owner_id: string;
  contractor_name: string;
  representative_name: string;
  address: string;
  default_slot_values: Partial<Record<LegalItemSlotKey, string>>;
  updated_at: string;
};

function toCompanyProfile(row: CompanyProfileRow): CompanyProfile {
  return {
    ownerId: row.owner_id,
    contractorName: row.contractor_name,
    representativeName: row.representative_name,
    address: row.address,
    defaultSlotValues: row.default_slot_values,
    updatedAt: row.updated_at,
  };
}

/** まだ設定していない事業者には、空の既定値を返す（未設定をエラーにしない）。 */
export async function getCompanyProfile(ownerId: string): Promise<CompanyProfile> {
  const { data, error } = await getSupabaseClient()
    .from("company_profiles")
    .select(COLUMNS)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  if (data) return toCompanyProfile(data as CompanyProfileRow);
  return {
    ownerId,
    contractorName: "",
    representativeName: "",
    address: "",
    defaultSlotValues: {},
    updatedAt: "",
  };
}

export async function upsertCompanyProfile(
  ownerId: string,
  input: UpdateCompanyProfileInput,
): Promise<CompanyProfile> {
  const { data, error } = await getSupabaseClient()
    .from("company_profiles")
    .upsert(
      {
        owner_id: ownerId,
        contractor_name: input.contractorName,
        representative_name: input.representativeName,
        address: input.address,
        default_slot_values: input.defaultSlotValues,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" },
    )
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toCompanyProfile(data as CompanyProfileRow);
}
