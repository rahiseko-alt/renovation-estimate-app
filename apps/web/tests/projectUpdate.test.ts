// 案件の更新（施主名・現場住所の書き換え）。
//
// D2「案件をつくる」（docs/flows.md「デモの画面の並び」）が通る経路。案件は D1 の
// seed で既に作られているので、この画面は**作らずに書き換える**。
// ローカル Supabase に実際にクエリを出して確かめる（モックにしない。AGENTS.md「コマンド」）。

import { describe, expect, it } from "vitest";

import {
  createProject,
  getProjectForOwner,
  updateProjectForOwner,
} from "../lib/db/projects";

const OWNER = "project-update@example.com";
const OTHER_OWNER = "project-update-other@example.com";

describe("updateProjectForOwner", () => {
  it("作った本人は施主名と現場住所を書き換えられる", async () => {
    const project = await createProject(
      { customerName: "更新前の施主", siteAddress: "東京都新宿区0-0-0" },
      OWNER,
    );

    const updated = await updateProjectForOwner(
      project.id,
      { customerName: "更新後の施主", siteAddress: "東京都渋谷区9-9-9" },
      OWNER,
    );
    expect(updated?.customerName).toBe("更新後の施主");
    expect(updated?.siteAddress).toBe("東京都渋谷区9-9-9");

    const reloaded = await getProjectForOwner(project.id, OWNER);
    expect(reloaded?.customerName).toBe("更新後の施主");
    expect(reloaded?.siteAddress).toBe("東京都渋谷区9-9-9");
  });

  it("住所を書き換えても工事名は変わらない（デモの作り直しの目印になっているため）", async () => {
    const project = await createProject(
      { customerName: "工事名の施主", siteAddress: "東京都港区1-1-1" },
      OWNER,
    );
    const workNameBefore = project.workName;

    const updated = await updateProjectForOwner(
      project.id,
      { customerName: "工事名の施主2", siteAddress: "神奈川県横浜市2-2-2" },
      OWNER,
    );
    expect(updated?.workName).toBe(workNameBefore);

    const reloaded = await getProjectForOwner(project.id, OWNER);
    expect(reloaded?.workName).toBe(workNameBefore);
  });

  it("他人の案件はIDを知っていても書き換えられない（IDOR対策）", async () => {
    const project = await createProject(
      { customerName: "他人の施主", siteAddress: "東京都台東区3-3-3" },
      OWNER,
    );

    expect(
      await updateProjectForOwner(
        project.id,
        { customerName: "乗っ取り", siteAddress: "乗っ取り住所" },
        OTHER_OWNER,
      ),
    ).toBeNull();

    const reloaded = await getProjectForOwner(project.id, OWNER);
    expect(reloaded?.customerName).toBe("他人の施主");
    expect(reloaded?.siteAddress).toBe("東京都台東区3-3-3");
  });

  it("UUIDでないIDを渡しても例外にならず、何も書き換えない", async () => {
    await expect(
      updateProjectForOwner(
        "no-such-id",
        { customerName: "書き換えない", siteAddress: "書き換えない" },
        OWNER,
      ),
    ).resolves.toBeNull();
  });
});
