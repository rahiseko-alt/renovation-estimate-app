import { describe, expect, it } from "vitest";

import {
  createPhotoSignedUrl,
  deletePhotoObject,
  newPhotoStoragePath,
  uploadPhotoObject,
} from "../lib/db/photoStorage";
import {
  createPhoto,
  deletePhotoRowForOwner,
  getPhotoForOwner,
  listPhotosForProject,
} from "../lib/db/photos";
import { createProject } from "../lib/db/projects";

const OWNER_A = "owner-a@example.com";
const OWNER_B = "owner-b@example.com";

async function newProject(ownerId: string) {
  return createProject(
    { customerName: "テスト案件", siteAddress: "テスト住所" },
    ownerId,
  );
}

describe("photos（行のCRUD）", () => {
  it("登録した写真を、登録した本人は取得できる", async () => {
    const project = await newProject(OWNER_A);
    const photo = await createPhoto(
      { projectId: project.id, area: "キッチン", storagePath: `${project.id}/a.jpg` },
      OWNER_A,
    );
    expect(await getPhotoForOwner(photo.id, OWNER_A)).toEqual(photo);
  });

  it("存在しないIDはnull", async () => {
    expect(await getPhotoForOwner("no-such-id", OWNER_A)).toBeNull();
  });

  it("他人が登録した写真はIDを知っていても取得できない（IDOR対策）", async () => {
    const project = await newProject(OWNER_A);
    const photo = await createPhoto(
      { projectId: project.id, area: "浴室", storagePath: `${project.id}/b.jpg` },
      OWNER_A,
    );
    expect(await getPhotoForOwner(photo.id, OWNER_B)).toBeNull();
  });

  it("案件の写真一覧には自分が登録した写真だけが含まれる", async () => {
    const project = await newProject(OWNER_A);
    const mine = await createPhoto(
      { projectId: project.id, area: "内装", storagePath: `${project.id}/c.jpg` },
      OWNER_A,
    );
    // 別の所有者が同じ project_id を指しても（本来は起こらない値だが）一覧には出ない。
    const others = await createPhoto(
      { projectId: project.id, area: "内装", storagePath: `${project.id}/d.jpg` },
      OWNER_B,
    );
    const list = await listPhotosForProject(project.id, OWNER_A);
    expect(list.some((p) => p.id === mine.id)).toBe(true);
    expect(list.some((p) => p.id === others.id)).toBe(false);
  });

  it("自分の写真は削除できる", async () => {
    const project = await newProject(OWNER_A);
    const photo = await createPhoto(
      { projectId: project.id, area: "外壁", storagePath: `${project.id}/e.jpg` },
      OWNER_A,
    );
    expect(await deletePhotoRowForOwner(photo.id, OWNER_A)).toBe(true);
    expect(await getPhotoForOwner(photo.id, OWNER_A)).toBeNull();
  });

  it("他人の写真は削除できない（IDOR対策）", async () => {
    const project = await newProject(OWNER_A);
    const photo = await createPhoto(
      { projectId: project.id, area: "屋根", storagePath: `${project.id}/f.jpg` },
      OWNER_A,
    );
    expect(await deletePhotoRowForOwner(photo.id, OWNER_B)).toBe(false);
    expect(await getPhotoForOwner(photo.id, OWNER_A)).not.toBeNull();
  });
});

describe("photoStorage（Storage本体、ローカル Supabase の実オブジェクト）", () => {
  it("アップロード→署名付きURL発行→削除の一連が実オブジェクトに対して動く", async () => {
    const project = await newProject(OWNER_A);
    const path = newPhotoStoragePath(project.id, "image/jpeg");
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]); // JPEGの最小マーカーだけの中身
    const file = new File([bytes], "test.jpg", { type: "image/jpeg" });

    await uploadPhotoObject(path, file);

    const url = await createPhotoSignedUrl(path, 60);
    expect(url).not.toBeNull();
    expect(url).toContain(path.split("/").pop());

    await deletePhotoObject(path);

    // 削除後に同じパスへ再アップロードできる（オブジェクトが実際に消えたことの確認）。
    await uploadPhotoObject(path, file);
    await deletePhotoObject(path);
  });
});
