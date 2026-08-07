import { describe, expect, it } from "vitest";

import {
  hasQuoteRequestGroup,
  listDraftProjectsForOwner,
} from "../lib/db/drafts";
import { createProject } from "../lib/db/projects";
import { createQuoteRequestGroup } from "../lib/db/quoteRequestGroups";

// 案件の登録件数には所有者ごとの上限（lib/limits.ts）があり、共用の
// owner-a@example.com は1回の実行で既に上限近くまで使っている。
// このファイル専用の所有者を使い、他のテストの余地を削らない。
const OWNER_A = "drafts-owner@example.com";
const OWNER_B = "drafts-other-owner@example.com";

describe("drafts（下書き＝まだ下請けに出していない案件）", () => {
  it("依頼グループを作ると下書きから外れる", async () => {
    const project = await createProject(
      { customerName: "下書き判定1", siteAddress: "下書き判定1の現場" },
      OWNER_A,
    );

    expect(await hasQuoteRequestGroup(project.id, OWNER_A)).toBe(false);
    const draftIds = (await listDraftProjectsForOwner(OWNER_A)).map(
      (row) => row.id,
    );
    expect(draftIds).toContain(project.id);

    await createQuoteRequestGroup({ projectId: project.id }, OWNER_A);

    expect(await hasQuoteRequestGroup(project.id, OWNER_A)).toBe(true);
    const afterIds = (await listDraftProjectsForOwner(OWNER_A)).map(
      (row) => row.id,
    );
    expect(afterIds).not.toContain(project.id);
  });

  it("他人の案件は下書きに出ない（所有者で絞る）", async () => {
    const project = await createProject(
      { customerName: "下書き判定2", siteAddress: "下書き判定2の現場" },
      OWNER_A,
    );

    const otherIds = (await listDraftProjectsForOwner(OWNER_B)).map(
      (row) => row.id,
    );
    expect(otherIds).not.toContain(project.id);
    // 他人のIDを知っていても「出したかどうか」は読めない。
    expect(await hasQuoteRequestGroup(project.id, OWNER_B)).toBe(false);
  });

  it("案件IDの形が不正なら、DBに触らず false を返す", async () => {
    expect(await hasQuoteRequestGroup("not-a-uuid", OWNER_A)).toBe(false);
  });
});
