import { describe, expect, it } from "vitest";

import { LEGAL_ITEM_SLOT_KEYS } from "../lib/db/types";
import {
  listLegalItemSlots,
  setLegalItemSlot,
} from "../lib/db/legalItemSlots";
import { createProject } from "../lib/db/projects";

const OWNER_A = "owner-a@example.com";
const OWNER_B = "owner-b@example.com";

describe("legalItemSlots", () => {
  it("案件を作った直後は、9キー全部が unset で揃っている", async () => {
    const project = await createProject(
      { customerName: "法定項目1", siteAddress: "テスト" },
      OWNER_A,
    );
    const slots = await listLegalItemSlots(project.id, OWNER_A);

    expect(Object.keys(slots).sort()).toEqual([...LEGAL_ITEM_SLOT_KEYS].sort());
    for (const slotKey of LEGAL_ITEM_SLOT_KEYS) {
      expect(slots[slotKey].status).toBe("unset");
      expect(slots[slotKey].value).toBeNull();
    }
  });

  it("「未定を明示」と「未入力」を区別して保存・復元できる（A3）", async () => {
    const project = await createProject(
      { customerName: "法定項目2", siteAddress: "テスト" },
      OWNER_A,
    );

    await setLegalItemSlot(
      project.id,
      OWNER_A,
      "responsibility_scope",
      "undetermined",
      null,
    );

    const slots = await listLegalItemSlots(project.id, OWNER_A);
    // 明示的に「未定」を選んだスロットと、まだ触っていないスロットは別の値。
    expect(slots.responsibility_scope.status).toBe("undetermined");
    expect(slots.subcontract_schedule.status).toBe("unset");
    expect(slots.responsibility_scope.status).not.toBe(
      slots.subcontract_schedule.status,
    );
  });

  it("値ありに変えると value が入り、状態を戻すと value も消える", async () => {
    const project = await createProject(
      { customerName: "法定項目3", siteAddress: "テスト" },
      OWNER_A,
    );

    const filled = await setLegalItemSlot(
      project.id,
      OWNER_A,
      "quote_conditions",
      "filled",
      "見積は別途協議のうえ確定する。",
    );
    expect(filled.status).toBe("filled");
    expect(filled.value).toBe("見積は別途協議のうえ確定する。");

    // 「未定」に戻すと、以前の本文が残らない（未定なのに本文が見える状態を作らない）。
    const undetermined = await setLegalItemSlot(
      project.id,
      OWNER_A,
      "quote_conditions",
      "undetermined",
      "この値は無視されるはず",
    );
    expect(undetermined.status).toBe("undetermined");
    expect(undetermined.value).toBeNull();
  });

  it("filled なのに value が空だと保存できない", async () => {
    const project = await createProject(
      { customerName: "法定項目4", siteAddress: "テスト" },
      OWNER_A,
    );
    await expect(
      setLegalItemSlot(project.id, OWNER_A, "trade_boundary", "filled", ""),
    ).rejects.toThrow();
    await expect(
      setLegalItemSlot(project.id, OWNER_A, "trade_boundary", "filled", null),
    ).rejects.toThrow();
  });

  it("9キー全部について、3状態を個別に保存・区別できる（A4）", async () => {
    const project = await createProject(
      { customerName: "法定項目5", siteAddress: "テスト" },
      OWNER_A,
    );

    for (const [index, slotKey] of LEGAL_ITEM_SLOT_KEYS.entries()) {
      // キーごとに異なる状態を割り当て、取り違えが起きていないかを確かめる。
      if (index % 3 === 0) {
        await setLegalItemSlot(project.id, OWNER_A, slotKey, "filled", `値-${slotKey}`);
      } else if (index % 3 === 1) {
        await setLegalItemSlot(project.id, OWNER_A, slotKey, "undetermined", null);
      }
      // index % 3 === 2 のキーは触らず unset のまま残す。
    }

    const slots = await listLegalItemSlots(project.id, OWNER_A);
    for (const [index, slotKey] of LEGAL_ITEM_SLOT_KEYS.entries()) {
      if (index % 3 === 0) {
        expect(slots[slotKey].status).toBe("filled");
        expect(slots[slotKey].value).toBe(`値-${slotKey}`);
      } else if (index % 3 === 1) {
        expect(slots[slotKey].status).toBe("undetermined");
        expect(slots[slotKey].value).toBeNull();
      } else {
        expect(slots[slotKey].status).toBe("unset");
      }
    }
  });

  it("owner_id での絞り込みが効いている（他人の ownerId では自分の書き込みが見えない）", async () => {
    // legalItemSlots.ts 自体は案件の所有者確認をしない（Server Action 側で
    // getProjectForOwner を済ませた後に呼ばれる前提）。ここでは、渡す ownerId を
    // 取り違えたときにデータが混ざらないこと（owner_id の絞り込みそのものが
    // 効いていること）を確かめる。
    const mine = await createProject(
      { customerName: "自分の案件", siteAddress: "テスト" },
      OWNER_A,
    );
    await setLegalItemSlot(mine.id, OWNER_A, "special_parts", "filled", "自分の値");

    const asOwnerB = await listLegalItemSlots(mine.id, OWNER_B);
    expect(asOwnerB.special_parts.status).toBe("unset");

    const asOwnerA = await listLegalItemSlots(mine.id, OWNER_A);
    expect(asOwnerA.special_parts.status).toBe("filled");
  });
});
