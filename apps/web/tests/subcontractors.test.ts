import { beforeAll, describe, expect, it } from "vitest";

import { MAX_SUBCONTRACTORS_PER_OWNER, SUBCONTRACTORS_TEXT } from "../lib/content";
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

describe("下請台帳の登録件数の上限", () => {
  // 上限まで埋める持ち主は、他のテストと分ける（このファイルの他のテストが
  // 使う OWNER_A を埋めてしまわないため）。前回の実行の残骸は tests/globalSetup.ts が消す。
  const LIMIT_OWNER = "limit-subcontractors@example.com";
  const OTHER_OWNER = "limit-subcontractors-other@example.com";

  const filled: Awaited<ReturnType<typeof createSubcontractor>>[] = [];

  beforeAll(async () => {
    for (let i = 1; i <= MAX_SUBCONTRACTORS_PER_OWNER; i += 1) {
      filled.push(
        await createSubcontractor(
          { companyName: `上限テスト建設${i}`, email: `limit-${i}@example.com` },
          LIMIT_OWNER,
        ),
      );
    }
  }, 120_000);

  it(`上限（${MAX_SUBCONTRACTORS_PER_OWNER}件）目までは登録できる`, () => {
    expect(filled).toHaveLength(MAX_SUBCONTRACTORS_PER_OWNER);
    expect(filled.at(-1)?.companyName).toBe(
      `上限テスト建設${MAX_SUBCONTRACTORS_PER_OWNER}`,
    );
    expect(filled.every((sub) => sub.id)).toBe(true);
  });

  it(`上限を超える1件（${MAX_SUBCONTRACTORS_PER_OWNER + 1}件目）は例外になる`, async () => {
    await expect(
      createSubcontractor(
        { companyName: "上限を超える建設", email: "over@example.com" },
        LIMIT_OWNER,
      ),
    ).rejects.toThrow(SUBCONTRACTORS_TEXT.failedLimit);
  });

  it("一覧は上限まで返る（既定の件数で黙って切れない）", async () => {
    const list = await listSubcontractorsForOwner(LIMIT_OWNER);
    expect(list).toHaveLength(MAX_SUBCONTRACTORS_PER_OWNER);
  });

  it("別の owner_id の件数は上限に影響しない", async () => {
    const sub = await createSubcontractor(
      { companyName: "別の持ち主の建設", email: "other@example.com" },
      OTHER_OWNER,
    );
    expect(await getSubcontractorForOwner(sub.id, OTHER_OWNER)).not.toBeNull();
    expect(await listSubcontractorsForOwner(OTHER_OWNER)).toHaveLength(1);
  });
});
