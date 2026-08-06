import { afterEach, describe, expect, it, vi } from "vitest";

import { newDemoOwnerId } from "../lib/auth/demoOwner";
import { DEFAULT_PHOTO_AREA } from "../lib/content";
import { createPhoto } from "../lib/db/photos";
import { getProjectForOwner } from "../lib/db/projects";

// ストレージの失敗を作るためにモックする。この検査だけの都合なので、
// 実 Supabase を使う他のDB検査（tests/demoSeed.test.ts）とはファイルを分ける。
const tryDeletePhotoObject = vi.hoisted(() => vi.fn());
vi.mock("../lib/db/photoStorage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/db/photoStorage")>()),
  tryDeletePhotoObject,
}));

const { purgeExpiredDemoData, seedDemoData } = await import("../lib/db/demoSeed");

afterEach(() => {
  vi.mocked(tryDeletePhotoObject).mockReset();
});

/**
 * 掃除は「ストレージ → DB行」の順で消す。**行を先に消すと storage_path が失われ、
 * 残ったオブジェクトを二度と回収できない。** だからストレージの削除に失敗した案件は、
 * その回では消さずに残す（次にデモが始まったときにやり直せる）。
 */
describe("purgeExpiredDemoData と写真ストレージ", () => {
  it("ストレージの削除に失敗した案件は、DBからも消さない", async () => {
    const ownerId = newDemoOwnerId();
    const projectId = await seedDemoData(ownerId);
    await createPhoto(
      { projectId, area: DEFAULT_PHOTO_AREA, storagePath: `${projectId}/dummy.jpg` },
      ownerId,
    );

    vi.mocked(tryDeletePhotoObject).mockResolvedValue(false);
    await purgeExpiredDemoData(new Date(Date.now() + 60_000));

    // 件数では見ない。掃除は他の期限切れデモも一緒に消すので安定しない。
    // 行が残っていること自体が要点で、次の掃除で storage_path をもう一度引ける。
    expect(await getProjectForOwner(projectId, ownerId)).not.toBeNull();
  });

  it("ストレージを消せた案件は、続けてDBからも消す", async () => {
    const ownerId = newDemoOwnerId();
    const projectId = await seedDemoData(ownerId);
    await createPhoto(
      { projectId, area: DEFAULT_PHOTO_AREA, storagePath: `${projectId}/dummy.jpg` },
      ownerId,
    );

    vi.mocked(tryDeletePhotoObject).mockResolvedValue(true);
    await purgeExpiredDemoData(new Date(Date.now() + 60_000));

    expect(await getProjectForOwner(projectId, ownerId)).toBeNull();
  });

  it("失敗した案件だけを残し、成功した案件は消す", async () => {
    const keptOwner = newDemoOwnerId();
    const removedOwner = newDemoOwnerId();
    const keptProject = await seedDemoData(keptOwner);
    const removedProject = await seedDemoData(removedOwner);

    await createPhoto(
      { projectId: keptProject, area: DEFAULT_PHOTO_AREA, storagePath: `${keptProject}/a.jpg` },
      keptOwner,
    );
    await createPhoto(
      {
        projectId: removedProject,
        area: DEFAULT_PHOTO_AREA,
        storagePath: `${removedProject}/b.jpg`,
      },
      removedOwner,
    );

    // 片方の写真だけ消せない状況を作る。
    vi.mocked(tryDeletePhotoObject).mockImplementation(
      async (path: string) => !path.startsWith(keptProject),
    );
    await purgeExpiredDemoData(new Date(Date.now() + 60_000));

    expect(await getProjectForOwner(keptProject, keptOwner)).not.toBeNull();
    expect(await getProjectForOwner(removedProject, removedOwner)).toBeNull();
  });
});
