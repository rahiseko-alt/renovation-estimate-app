import { describe, expect, it } from "vitest";

import { SITE_CONDITION_CATEGORIES } from "../lib/db/types";
import {
  listSiteConditionChecks,
  setSiteConditionCheck,
} from "../lib/db/siteConditionChecks";
import { createProject } from "../lib/db/projects";

const OWNER_A = "owner-a@example.com";
const OWNER_B = "owner-b@example.com";

describe("siteConditionChecks", () => {
  it("案件を作った直後は、12区分全部が unset で揃っている", async () => {
    const project = await createProject(
      { customerName: "施工条件1", siteAddress: "テスト" },
      OWNER_A,
    );
    const checks = await listSiteConditionChecks(project.id, OWNER_A);

    expect(Object.keys(checks).sort()).toEqual(
      [...SITE_CONDITION_CATEGORIES].sort(),
    );
    for (const category of SITE_CONDITION_CATEGORIES) {
      expect(checks[category].mark).toBe("unset");
    }
  });

  it("○（含める）と×（含めない）を区分ごとに独立して保存できる", async () => {
    const project = await createProject(
      { customerName: "施工条件2", siteAddress: "テスト" },
      OWNER_A,
    );

    await setSiteConditionCheck(project.id, OWNER_A, "scaffolding", "include");
    await setSiteConditionCheck(project.id, OWNER_A, "safety", "exclude");

    const checks = await listSiteConditionChecks(project.id, OWNER_A);
    expect(checks.scaffolding.mark).toBe("include");
    expect(checks.safety.mark).toBe("exclude");
    // 触っていない区分は unset のまま。
    expect(checks.materials.mark).toBe("unset");
  });

  it("同じ区分に上書きすると、最後の印だけが残る", async () => {
    const project = await createProject(
      { customerName: "施工条件3", siteAddress: "テスト" },
      OWNER_A,
    );

    await setSiteConditionCheck(project.id, OWNER_A, "transport", "include");
    await setSiteConditionCheck(project.id, OWNER_A, "transport", "exclude");

    const checks = await listSiteConditionChecks(project.id, OWNER_A);
    expect(checks.transport.mark).toBe("exclude");
  });

  it("owner_id での絞り込みが効いている", async () => {
    const mine = await createProject(
      { customerName: "施工条件4", siteAddress: "テスト" },
      OWNER_A,
    );
    await setSiteConditionCheck(mine.id, OWNER_A, "equipment", "include");

    const asOwnerB = await listSiteConditionChecks(mine.id, OWNER_B);
    expect(asOwnerB.equipment.mark).toBe("unset");
  });
});
