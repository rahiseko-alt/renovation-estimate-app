// 「最初からやり直す」（D2〜D10 に置いたボタン。docs/flows.md「デモの画面の並び」）。
//
// 見るのは3つ。
// ①押すと**新しい案件**で作り直し、**前の案件は残らない**
//   （商談で次の相手に見せるとき、前の相手が打った施主名や写真を持ち越さない）。
// ②**写真の実体を消せなかったときも、やり直しは成功する**。ただし識別子は
//   新しいものに移り、**前の識別子の行は残る**（残った実体を後から消すための
//   手がかり `storage_path` を捨てない）。
// ③他所のオリジンからの POST は 403（`/demo/start` と同じ確認を通していること）。
//
// ①②はローカル Supabase に実際にクエリを出して確かめる（モックにしない。
// AGENTS.md「コマンド」）。③はオリジンの確認だけを見るので、DBには触れない。
//
// **②だけは Storage の失敗を作れないので、そこ1点だけを差し替える。**
// Storage の実体を消せない状況（権限・通信）は、テストからは起こせない。
// 差し替えるのは「消せたかどうかの返り値」だけで、**その後の分岐・投入・
// DBへの問い合わせはすべて本物**を通る。

import { describe, expect, it, vi } from "vitest";

/** ②のときだけ「消せなかった」を返させるつまみ。既定は本物のまま。 */
const photoCleanup = { forceFailure: false };

vi.mock("../lib/db/demoCleanup", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/db/demoCleanup")>();
  return {
    ...actual,
    tryRemoveDemoPhotoObjects: async (ownerId: string) =>
      photoCleanup.forceFailure
        ? false
        : actual.tryRemoveDemoPhotoObjects(ownerId),
  };
});

import { POST as restartRoute } from "../app/demo/restart/route";
import { newDemoOwnerId } from "../lib/auth/demoOwner";
import { restartDemoData } from "../lib/db/demoRestart";
import { seedDemoData } from "../lib/db/demoSeed";
import { getProjectForOwner, updateProjectForOwner } from "../lib/db/projects";
import { CUSTOMER_NAME } from "../lib/demoFixture";

describe("restartDemoData", () => {
  it("新しい案件で作り直し、前の案件は消える", async () => {
    const ownerId = newDemoOwnerId();
    const before = await seedDemoData(ownerId, { ownerIsNew: true });

    const after = await restartDemoData(ownerId);

    expect(after.projectId).not.toBe(before);
    // 写真の実体を消せたときは、同じ識別子で続く（識別子が変わるのは消せなかったときだけ）。
    expect(after.ownerId).toBe(ownerId);
    // 前の案件は残らない（残ると、期限が来るまで前の相手のデータが居座る）。
    expect(await getProjectForOwner(before, ownerId)).toBeNull();
    // 新しい案件は、そのまま次の商談で見せられる状態になっている。
    expect(await getProjectForOwner(after.projectId, ownerId)).not.toBeNull();
  });

  it("写真の実体を消せなくても作り直せる。識別子が移り、前の識別子の行は残る", async () => {
    const ownerId = newDemoOwnerId();
    const before = await seedDemoData(ownerId, { ownerIsNew: true });

    photoCleanup.forceFailure = true;
    let after;
    try {
      after = await restartDemoData(ownerId);
    } finally {
      photoCleanup.forceFailure = false;
    }

    // **やり直し自体は成功する**（商談の場でデモが始められない方が損失が大きい）。
    expect(after.projectId).not.toBe(before);
    // 識別子は新しいものに移っている。
    expect(after.ownerId).not.toBe(ownerId);
    // 新しい案件は、そのまま次の商談で見せられる状態になっている。
    expect(await getProjectForOwner(after.projectId, after.ownerId)).not.toBeNull();

    // **前の案件は消さずに残す。** 消すと `photos` の行（＝実体の在り処）まで
    // 消え、残った実体を後から削除する手がかりが無くなる。
    expect(await getProjectForOwner(before, ownerId)).not.toBeNull();
  });

  it("前の相手が打ち直した施主名を持ち越さない", async () => {
    const ownerId = newDemoOwnerId();
    const before = await seedDemoData(ownerId, { ownerIsNew: true });
    // D2 で打ち直した状態を作る。
    await updateProjectForOwner(
      before,
      { customerName: "前の相手 太郎", siteAddress: "東京都千代田区0-0-0" },
      ownerId,
    );

    const after = await restartDemoData(ownerId);

    const project = await getProjectForOwner(after.projectId, after.ownerId);
    expect(project?.customerName).toBe(CUSTOMER_NAME);
  });
});

describe("POST /demo/restart", () => {
  it("他所のオリジンからは 403（デモを勝手に作り直させない）", async () => {
    const response = await restartRoute(
      new Request("https://example.test/demo/restart", {
        method: "POST",
        headers: { origin: "https://attacker.test", host: "example.test" },
      }),
    );

    expect(response.status).toBe(403);
  });

  it("Origin が付いていない POST も 403", async () => {
    const response = await restartRoute(
      new Request("https://example.test/demo/restart", {
        method: "POST",
        headers: { host: "example.test" },
      }),
    );

    expect(response.status).toBe(403);
  });
});
