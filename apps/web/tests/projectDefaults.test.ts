import { describe, expect, it } from "vitest";

import { upsertCompanyProfile } from "../lib/db/companyProfiles";
import { listLegalItemSlots, setLegalItemSlot } from "../lib/db/legalItemSlots";
import { applyCompanyDefaultsToProject } from "../lib/db/projectDefaults";
import { createProject } from "../lib/db/projects";
import {
  COMPANY_DEFAULT_SLOT_KEYS,
  LEGAL_ITEM_SLOT_KEYS,
} from "../lib/db/types";

// company_profiles は owner_id が主キー（1事業者＝1設定）なので、他のテストの
// 会社設定と衝突しないよう、このファイル専用の owner を使う。
const OWNER = "project-defaults-owner@example.com";
const OWNER_WITHOUT_PROFILE = "project-defaults-no-profile@example.com";

async function newProject(ownerId: string, name: string) {
  return createProject(
    { customerName: name, siteAddress: "東京都港区0-0-0" },
    ownerId,
  );
}

describe("applyCompanyDefaultsToProject", () => {
  it("会社設定の定型文が、新しい案件の法定項目に入る", async () => {
    await upsertCompanyProfile(OWNER, {
      contractorName: "定型文テスト工務店",
      representativeName: "代表 太郎",
      address: "東京都千代田区1-1",
      defaultSlotValues: {
        responsibility_scope: "内装仕上げ工事一式",
        waste_disposal_burden: "元請の負担とする",
      },
    });

    const project = await newProject(OWNER, "定型文1");
    await applyCompanyDefaultsToProject(project.id, OWNER);

    const slots = await listLegalItemSlots(project.id, OWNER);
    expect(slots.responsibility_scope.status).toBe("filled");
    expect(slots.responsibility_scope.value).toBe("内装仕上げ工事一式");
    expect(slots.waste_disposal_burden.value).toBe("元請の負担とする");
  });

  it("定型文の無いスロットは未入力のまま残る（空で埋めない）", async () => {
    await upsertCompanyProfile(OWNER, {
      contractorName: "定型文テスト工務店",
      representativeName: "代表 太郎",
      address: "東京都千代田区1-1",
      defaultSlotValues: { responsibility_scope: "内装仕上げ工事一式" },
    });

    const project = await newProject(OWNER, "定型文2");
    await applyCompanyDefaultsToProject(project.id, OWNER);

    const slots = await listLegalItemSlots(project.id, OWNER);
    for (const slotKey of LEGAL_ITEM_SLOT_KEYS) {
      if (slotKey === "responsibility_scope") continue;
      expect(slots[slotKey].status).toBe("unset");
      expect(slots[slotKey].value).toBeNull();
    }
  });

  it("空文字の定型文は入れない（「記入する（中身は空）」を作らない）", async () => {
    await upsertCompanyProfile(OWNER, {
      contractorName: "定型文テスト工務店",
      representativeName: "代表 太郎",
      address: "東京都千代田区1-1",
      // 空白だけの定型文も、書いていないものとして扱う。
      defaultSlotValues: { quote_conditions: "   ", trade_boundary: "" },
    });

    const project = await newProject(OWNER, "定型文3");
    await applyCompanyDefaultsToProject(project.id, OWNER);

    const slots = await listLegalItemSlots(project.id, OWNER);
    expect(slots.quote_conditions.status).toBe("unset");
    expect(slots.trade_boundary.status).toBe("unset");
  });

  it("会社設定が1件も無い事業者でも失敗せず、全スロットが未入力のまま始まる", async () => {
    const project = await newProject(OWNER_WITHOUT_PROFILE, "定型文4");
    await applyCompanyDefaultsToProject(project.id, OWNER_WITHOUT_PROFILE);

    const slots = await listLegalItemSlots(project.id, OWNER_WITHOUT_PROFILE);
    for (const slotKey of LEGAL_ITEM_SLOT_KEYS) {
      expect(slots[slotKey].status).toBe("unset");
    }
  });

  it("⑤の工程スロットには定型文を入れない（案件ごとの日付なので会社共通にしない）", async () => {
    // 会社設定の入力欄は COMPANY_DEFAULT_SLOT_KEYS の7つしか出さないが、
    // DBの jsonb には任意のキーが入りうる。⑤が紛れ込んでも複製しないことを確かめる。
    await upsertCompanyProfile(OWNER, {
      contractorName: "定型文テスト工務店",
      representativeName: "代表 太郎",
      address: "東京都千代田区1-1",
      defaultSlotValues: {
        responsibility_scope: "内装仕上げ工事一式",
        subcontract_schedule: "紛れ込んだ工程",
        overall_schedule: "紛れ込んだ全体工程",
      },
    });

    const project = await newProject(OWNER, "定型文5");
    await applyCompanyDefaultsToProject(project.id, OWNER);

    const slots = await listLegalItemSlots(project.id, OWNER);
    expect(slots.responsibility_scope.status).toBe("filled");
    expect(slots.subcontract_schedule.status).toBe("unset");
    expect(slots.overall_schedule.status).toBe("unset");
    expect(COMPANY_DEFAULT_SLOT_KEYS).not.toContain("subcontract_schedule");
    expect(COMPANY_DEFAULT_SLOT_KEYS).not.toContain("overall_schedule");
  });

  it("案件ごとに上書きした内容は、あとで会社設定を変えても変わらない", async () => {
    await upsertCompanyProfile(OWNER, {
      contractorName: "定型文テスト工務店",
      representativeName: "代表 太郎",
      address: "東京都千代田区1-1",
      defaultSlotValues: { responsibility_scope: "作成時の定型文" },
    });

    const project = await newProject(OWNER, "定型文6");
    await applyCompanyDefaultsToProject(project.id, OWNER);
    await setLegalItemSlot(
      project.id,
      OWNER,
      "responsibility_scope",
      "filled",
      "この案件だけの内容",
    );

    // 会社設定をあとから直しても、既にある案件は追随しない（複製であって参照ではない）。
    await upsertCompanyProfile(OWNER, {
      contractorName: "定型文テスト工務店",
      representativeName: "代表 太郎",
      address: "東京都千代田区1-1",
      defaultSlotValues: { responsibility_scope: "あとから直した定型文" },
    });

    const slots = await listLegalItemSlots(project.id, OWNER);
    expect(slots.responsibility_scope.value).toBe("この案件だけの内容");
  });
});
