// 「最初からやり直す」（D2〜D10 に置いたボタン。docs/flows.md「デモの画面の並び」）。
//
// 見るのは2つ。
// ①押すと**新しい案件**で作り直し、**前の案件は残らない**
//   （商談で次の相手に見せるとき、前の相手が打った施主名や写真を持ち越さない）。
// ②他所のオリジンからの POST は 403（`/demo/start` と同じ確認を通していること）。
//
// ①はローカル Supabase に実際にクエリを出して確かめる（モックにしない。
// AGENTS.md「コマンド」）。②はオリジンの確認だけを見るので、DBには触れない。

import { describe, expect, it } from "vitest";

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

    expect(after).not.toBe(before);
    // 前の案件は残らない（残ると、期限が来るまで前の相手のデータが居座る）。
    expect(await getProjectForOwner(before, ownerId)).toBeNull();
    // 新しい案件は、そのまま次の商談で見せられる状態になっている。
    expect(await getProjectForOwner(after, ownerId)).not.toBeNull();
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

    const project = await getProjectForOwner(after, ownerId);
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
