import { describe, expect, it } from "vitest";

import {
  LEGAL_ITEM_SLOT_KEYS,
  MAX_LEGAL_ITEM_SLOT_VALUE_LENGTH,
} from "../lib/db/types";
import {
  listLegalItemSlots,
  setLegalItemSlot,
  setLegalItemSlots,
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

describe("legalItemSlots の一括保存", () => {
  it("画面の1回の保存で9スロット全部が入る（1件ずつの往復に戻らない）", async () => {
    const project = await createProject(
      { customerName: "一括1", siteAddress: "テスト" },
      OWNER_A,
    );

    const saved = await setLegalItemSlots(
      project.id,
      OWNER_A,
      LEGAL_ITEM_SLOT_KEYS.map((slotKey, index) =>
        index % 2 === 0
          ? { slotKey, status: "filled" as const, value: `値-${slotKey}` }
          : { slotKey, status: "undetermined" as const, value: null },
      ),
    );
    expect(saved).toHaveLength(LEGAL_ITEM_SLOT_KEYS.length);

    const slots = await listLegalItemSlots(project.id, OWNER_A);
    for (const [index, slotKey] of LEGAL_ITEM_SLOT_KEYS.entries()) {
      expect(slots[slotKey].status).toBe(index % 2 === 0 ? "filled" : "undetermined");
    }
  });

  it("同じ内容をもう一度保存しても行が二重にならず、上書きされる", async () => {
    const project = await createProject(
      { customerName: "一括2", siteAddress: "テスト" },
      OWNER_A,
    );
    const input = [
      { slotKey: "quote_conditions" as const, status: "filled" as const, value: "一度目" },
    ];

    await setLegalItemSlots(project.id, OWNER_A, input);
    await setLegalItemSlots(project.id, OWNER_A, [
      { ...input[0]!, value: "二度目" },
    ]);

    const slots = await listLegalItemSlots(project.id, OWNER_A);
    expect(slots.quote_conditions.value).toBe("二度目");
  });

  it("同じスロットを2件渡したら保存せずに落とす（DBのupsertが落ちる前に理由を返す）", async () => {
    const project = await createProject(
      { customerName: "一括3", siteAddress: "テスト" },
      OWNER_A,
    );

    await expect(
      setLegalItemSlots(project.id, OWNER_A, [
        { slotKey: "overall_schedule", status: "filled", value: "A" },
        { slotKey: "overall_schedule", status: "filled", value: "B" },
      ]),
    ).rejects.toThrow(/重複/);

    // 落ちた保存の一部だけが残っていないこと。
    const slots = await listLegalItemSlots(project.id, OWNER_A);
    expect(slots.overall_schedule.status).toBe("unset");
  });

  it("「記入する」なのに本文が空なら、同じ保存の他のスロットも書き込まない", async () => {
    const project = await createProject(
      { customerName: "一括4", siteAddress: "テスト" },
      OWNER_A,
    );

    await expect(
      setLegalItemSlots(project.id, OWNER_A, [
        { slotKey: "trade_boundary", status: "undetermined", value: null },
        // 空白だけは「書いた」に数えない。
        { slotKey: "special_parts", status: "filled", value: "   " },
      ]),
    ).rejects.toThrow();

    const slots = await listLegalItemSlots(project.id, OWNER_A);
    expect(slots.trade_boundary.status).toBe("unset");
    expect(slots.special_parts.status).toBe("unset");
  });

  it("本文は上限ちょうどなら通り、1文字超えたら投げる", async () => {
    const project = await createProject(
      { customerName: "一括5", siteAddress: "テスト" },
      OWNER_A,
    );
    const atLimit = "あ".repeat(MAX_LEGAL_ITEM_SLOT_VALUE_LENGTH);

    await setLegalItemSlots(project.id, OWNER_A, [
      { slotKey: "material_cost_burden", status: "filled", value: atLimit },
    ]);
    const slots = await listLegalItemSlots(project.id, OWNER_A);
    expect(slots.material_cost_burden.value).toHaveLength(
      MAX_LEGAL_ITEM_SLOT_VALUE_LENGTH,
    );

    await expect(
      setLegalItemSlots(project.id, OWNER_A, [
        { slotKey: "material_cost_burden", status: "filled", value: `${atLimit}あ` },
      ]),
    ).rejects.toThrow();
  });

  it("「未定」を選んだら、画面に残っていた本文は保存しない", async () => {
    const project = await createProject(
      { customerName: "一括6", siteAddress: "テスト" },
      OWNER_A,
    );

    await setLegalItemSlots(project.id, OWNER_A, [
      {
        slotKey: "safety_measures_burden",
        status: "undetermined",
        // 「記入する」から「未定」に切り替えたとき、入力欄の文字が残っていても
        // 保存してはいけない（後で filled と誤読される余地を作らない）。
        value: "切り替える前に書いていた内容",
      },
    ]);

    const slots = await listLegalItemSlots(project.id, OWNER_A);
    expect(slots.safety_measures_burden.status).toBe("undetermined");
    expect(slots.safety_measures_burden.value).toBeNull();
  });
});
