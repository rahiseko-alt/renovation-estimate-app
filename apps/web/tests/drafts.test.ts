import { describe, expect, it } from "vitest";

import {
  hasQuoteRequestGroup,
  listDraftProjectsForOwner,
} from "../lib/db/drafts";
import { getOrCreateEstimate } from "../lib/db/estimates";
import { createProject } from "../lib/db/projects";
import {
  createQuoteGroupRequest,
  createQuoteRequestGroup,
} from "../lib/db/quoteRequestGroups";
import { createSubcontractor } from "../lib/db/subcontractors";

// 案件の登録件数には所有者ごとの上限（lib/limits.ts）があり、共用の
// owner-a@example.com は1回の実行で既に上限近くまで使っている。
// このファイル専用の所有者を使い、他のテストの余地を削らない。
const OWNER_A = "drafts-owner@example.com";
const OWNER_B = "drafts-other-owner@example.com";

describe("drafts（下書き＝まだ下請けに出していない案件）", () => {
  it("依頼を1件でも作ると下書きから外れる", async () => {
    const project = await createProject(
      { customerName: "下書き判定1", siteAddress: "下書き判定1の現場" },
      OWNER_A,
    );

    expect(await hasQuoteRequestGroup(project.id, OWNER_A)).toBe(false);
    const draftIds = (await listDraftProjectsForOwner(OWNER_A)).map(
      (row) => row.id,
    );
    expect(draftIds).toContain(project.id);

    const estimate = await getOrCreateEstimate(project.id);
    const group = await createQuoteRequestGroup(
      { projectId: project.id },
      OWNER_A,
    );
    const subcontractor = await createSubcontractor(
      { companyName: "下書き判定1の下請", email: "drafts-1@example.com" },
      OWNER_A,
    );
    await createQuoteGroupRequest(
      {
        groupId: group.id,
        subcontractorId: subcontractor.id,
        plannedPriceBand: "under_500man",
        lineItemIds: [estimate.lines[0]!.id],
      },
      OWNER_A,
    );

    expect(await hasQuoteRequestGroup(project.id, OWNER_A)).toBe(true);
    const afterIds = (await listDraftProjectsForOwner(OWNER_A)).map(
      (row) => row.id,
    );
    expect(afterIds).not.toContain(project.id);
  });

  it("依頼が1件も付いていないグループは「出した」と数えない", async () => {
    // **1社にも届いていないのに送信済みと判定されると、押し直しても
    // 送信済みの画面へ進むだけで、下請には永久に届かない。**
    // グループの作成に成功したあと依頼の作成が落ち、巻き戻しにも失敗すると
    // この状態が残る（app/projects/[id]/send/actions.ts）。
    const project = await createProject(
      { customerName: "下書き判定3", siteAddress: "下書き判定3の現場" },
      OWNER_A,
    );

    await createQuoteRequestGroup({ projectId: project.id }, OWNER_A);

    expect(await hasQuoteRequestGroup(project.id, OWNER_A)).toBe(false);
    // 下書きにも残り続ける（続きからやり直せる）。
    const draftIds = (await listDraftProjectsForOwner(OWNER_A)).map(
      (row) => row.id,
    );
    expect(draftIds).toContain(project.id);
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
