import { describe, expect, it } from "vitest";

import { getCompanyProfile, upsertCompanyProfile } from "../lib/db/companyProfiles";

// company_profiles は owner_id が主キー（1事業者＝1設定）なので、他のテストと
// 衝突しないよう、このファイル専用の owner を使う。
const OWNER = "company-profile-owner@example.com";

describe("companyProfiles", () => {
  it("まだ設定していない事業者には、空の既定値を返す", async () => {
    const profile = await getCompanyProfile(
      "never-set-company-profile@example.com",
    );
    expect(profile.contractorName).toBe("");
    expect(profile.representativeName).toBe("");
    expect(profile.address).toBe("");
    expect(profile.defaultSlotValues).toEqual({});
  });

  it("保存すると内容が更新され、次回の取得にも反映される", async () => {
    const saved = await upsertCompanyProfile(OWNER, {
      contractorName: "テスト工務店",
      representativeName: "代表 太郎",
      address: "東京都千代田区1-1",
      defaultSlotValues: {
        responsibility_scope: "別途協議による",
      },
    });
    expect(saved.contractorName).toBe("テスト工務店");
    expect(saved.defaultSlotValues.responsibility_scope).toBe("別途協議による");

    const reloaded = await getCompanyProfile(OWNER);
    expect(reloaded).toEqual(saved);
  });

  it("2回目の保存は、新しい内容で上書きする（1事業者＝1設定）", async () => {
    await upsertCompanyProfile(OWNER, {
      contractorName: "旧社名",
      representativeName: "旧代表",
      address: "旧住所",
      defaultSlotValues: {},
    });
    const updated = await upsertCompanyProfile(OWNER, {
      contractorName: "新社名",
      representativeName: "新代表",
      address: "新住所",
      defaultSlotValues: { quote_conditions: "新しい条件" },
    });
    expect(updated.contractorName).toBe("新社名");

    const reloaded = await getCompanyProfile(OWNER);
    expect(reloaded.contractorName).toBe("新社名");
    expect(reloaded.defaultSlotValues).toEqual({ quote_conditions: "新しい条件" });
  });
});
