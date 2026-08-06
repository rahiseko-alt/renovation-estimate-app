import { afterEach, describe, expect, it, vi } from "vitest";

import { newDemoOwnerId } from "../lib/auth/demoOwner";
import { DEFAULT_PHOTO_AREA } from "../lib/content";
import { getCompanyProfile } from "../lib/db/companyProfiles";
import { createPhoto } from "../lib/db/photos";
import { createProject, getProjectForOwner } from "../lib/db/projects";
import { listSubcontractorsForOwner } from "../lib/db/subcontractors";

// ストレージの失敗を作るためにモックする。この検査だけの都合なので、
// 実 Supabase を使う他のDB検査（tests/demoSeed.test.ts）とはファイルを分ける。
const tryDeletePhotoObject = vi.hoisted(() => vi.fn());
vi.mock("../lib/db/photoStorage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/db/photoStorage")>()),
  tryDeletePhotoObject,
}));

const { purgeExpiredDemoData } = await import("../lib/db/demoCleanup");
const { seedDemoData } = await import("../lib/db/demoSeed");

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

/**
 * 下請台帳と会社設定は案件に紐づかず `owner_id` 単位で消すしかない。
 * **デモ利用者も画面から2件目の案件を作れる**ので、案件が1件でも残る所有者の
 * これらを消すと、残った案件から下請と請負者名が消える。
 */
describe("purgeExpiredDemoData と owner_id 単位のデータ", () => {
  it("案件が残る所有者の下請台帳・会社設定は消さない", async () => {
    const ownerId = newDemoOwnerId();
    const demoProject = await seedDemoData(ownerId);
    // 同じデモ利用者が画面から作った2件目。写真が消せず残る状況にする。
    await createPhoto(
      { projectId: demoProject, area: DEFAULT_PHOTO_AREA, storagePath: `${demoProject}/a.jpg` },
      ownerId,
    );

    vi.mocked(tryDeletePhotoObject).mockResolvedValue(false);
    await purgeExpiredDemoData(new Date(Date.now() + 60_000));

    // 案件が残っているので、下請台帳も会社設定もそのまま。
    expect(await getProjectForOwner(demoProject, ownerId)).not.toBeNull();
    expect(await listSubcontractorsForOwner(ownerId)).not.toHaveLength(0);
    // 未設定なら空文字が返る作りなので、請負者名が残っているかで見る。
    expect((await getCompanyProfile(ownerId)).contractorName).not.toBe("");
  });

  // 直した不具合そのもの。**同じ所有者が案件を2件持ち、片方だけが消える**とき、
  // 残る側から下請と請負者名が消えていた。
  it("同じ所有者の案件が片方だけ消えるとき、下請台帳・会社設定を残す", async () => {
    const ownerId = newDemoOwnerId();
    const kept = await seedDemoData(ownerId);
    // 同じデモ利用者が画面から作った2件目。写真が無いので掃除の対象になる。
    const removed = await createProject(
      { customerName: "見本 次郎", siteAddress: "東京都港区0-0-0" },
      ownerId,
    );

    // 1件目だけ写真を消せない状況にして、残る側と消える側を作る。
    await createPhoto(
      { projectId: kept, area: DEFAULT_PHOTO_AREA, storagePath: `${kept}/a.jpg` },
      ownerId,
    );
    vi.mocked(tryDeletePhotoObject).mockResolvedValue(false);

    await purgeExpiredDemoData(new Date(Date.now() + 60_000));

    expect(await getProjectForOwner(removed.id, ownerId)).toBeNull();
    expect(await getProjectForOwner(kept, ownerId)).not.toBeNull();
    // 残った案件の側から、下請と請負者名が消えていないこと。
    expect(await listSubcontractorsForOwner(ownerId)).not.toHaveLength(0);
    expect((await getCompanyProfile(ownerId)).contractorName).not.toBe("");
  });

  it("案件が1件も残らない所有者の下請台帳・会社設定は消す", async () => {
    const ownerId = newDemoOwnerId();
    const demoProject = await seedDemoData(ownerId);

    vi.mocked(tryDeletePhotoObject).mockResolvedValue(true);
    await purgeExpiredDemoData(new Date(Date.now() + 60_000));

    expect(await getProjectForOwner(demoProject, ownerId)).toBeNull();
    expect(await listSubcontractorsForOwner(ownerId)).toHaveLength(0);
    expect((await getCompanyProfile(ownerId)).contractorName).toBe("");
  });
});
