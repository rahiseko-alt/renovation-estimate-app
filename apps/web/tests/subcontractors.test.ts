import { describe, expect, it } from "vitest";

import {
  createSubcontractor,
  deleteSubcontractorForOwner,
  getSubcontractorForOwner,
  listSubcontractorsForOwner,
} from "../lib/db/subcontractors";

const OWNER_A = "owner-a@example.com";
const OWNER_B = "owner-b@example.com";

describe("subcontractors", () => {
  it("登録した下請を、登録した本人は取得できる", async () => {
    const sub = await createSubcontractor(
      { companyName: "テスト建設", email: "sub@example.com" },
      OWNER_A,
    );
    expect(await getSubcontractorForOwner(sub.id, OWNER_A)).toEqual(sub);
  });

  it("他人が作った下請は、IDを知っていても取得できない（IDOR対策）", async () => {
    const sub = await createSubcontractor(
      { companyName: "秘密建設", email: "secret@example.com" },
      OWNER_A,
    );
    expect(await getSubcontractorForOwner(sub.id, OWNER_B)).toBeNull();
  });

  it("一覧には自分の下請だけが出る（他人の下請は出ない）", async () => {
    const mine = await createSubcontractor(
      { companyName: "自分の下請A", email: "mine@example.com" },
      OWNER_A,
    );
    const others = await createSubcontractor(
      { companyName: "他人の下請B", email: "others@example.com" },
      OWNER_B,
    );
    const list = await listSubcontractorsForOwner(OWNER_A);
    expect(list.some((s) => s.id === mine.id)).toBe(true);
    expect(list.some((s) => s.id === others.id)).toBe(false);
  });

  it("他人の下請は削除できない（削除後も残っている）", async () => {
    const sub = await createSubcontractor(
      { companyName: "削除されない建設", email: "keep@example.com" },
      OWNER_A,
    );
    expect(await deleteSubcontractorForOwner(sub.id, OWNER_B)).toBe(false);
    expect(await getSubcontractorForOwner(sub.id, OWNER_A)).not.toBeNull();
  });

  it("自分の下請は削除でき、以後は取得できない", async () => {
    const sub = await createSubcontractor(
      { companyName: "削除される建設", email: "delete-me@example.com" },
      OWNER_A,
    );
    expect(await deleteSubcontractorForOwner(sub.id, OWNER_A)).toBe(true);
    expect(await getSubcontractorForOwner(sub.id, OWNER_A)).toBeNull();
  });
});
