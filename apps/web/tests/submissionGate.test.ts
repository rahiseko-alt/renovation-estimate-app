import { describe, expect, it } from "vitest";

import {
  setLegalItemSlot,
  setLegalItemSlots,
} from "../lib/db/legalItemSlots";
import { createProject } from "../lib/db/projects";
import {
  setSiteConditionCheck,
  setSiteConditionChecks,
} from "../lib/db/siteConditionChecks";
import { checkSubmissionGate } from "../lib/db/submissionGate";
import {
  LEGAL_ITEM_SLOT_KEYS,
  SITE_CONDITION_CATEGORIES,
} from "../lib/db/types";

const OWNER_A = "owner-a@example.com";
const OWNER_B = "owner-b@example.com";

/** 9スロットを「値あり」、12区分を○で埋めた案件を作る（送信条件を満たした状態）。 */
async function projectReadyToSubmit(customerName: string) {
  const project = await createProject(
    { customerName, siteAddress: `${customerName}の現場` },
    OWNER_A,
  );
  for (const slotKey of LEGAL_ITEM_SLOT_KEYS) {
    await setLegalItemSlot(project.id, OWNER_A, slotKey, "filled", `値-${slotKey}`);
  }
  for (const category of SITE_CONDITION_CATEGORIES) {
    await setSiteConditionCheck(project.id, OWNER_A, category, "include");
  }
  return project;
}

describe("submissionGate", () => {
  it("案件を作った直後は、9スロットと12区分の全部が足りないものとして返る（何も埋めずには送れない）", async () => {
    const project = await createProject(
      { customerName: "送信ゲート1", siteAddress: "テスト" },
      OWNER_A,
    );
    const result = await checkSubmissionGate(project.id, OWNER_A);

    expect(result.ok).toBe(false);
    // 個数（9・12）を書き写さず、唯一の正である配列そのものと突き合わせる。
    expect([...result.unsetSlotKeys].sort()).toEqual(
      [...LEGAL_ITEM_SLOT_KEYS].sort(),
    );
    expect([...result.unsetCategories].sort()).toEqual(
      [...SITE_CONDITION_CATEGORIES].sort(),
    );
  });

  it("9スロットと12区分が全部埋まったときだけ送信できる（21項目そろって初めて通す）", async () => {
    const project = await projectReadyToSubmit("送信ゲート2");
    const result = await checkSubmissionGate(project.id, OWNER_A);

    expect(result.ok).toBe(true);
    expect(result.unsetSlotKeys).toEqual([]);
    expect(result.unsetCategories).toEqual([]);
  });

  it("法定項目スロットが1つでも未入力なら止まり、そのキーが結果に出る（どのキーが欠けても止まる）", async () => {
    const project = await projectReadyToSubmit("送信ゲート3");

    for (const slotKey of LEGAL_ITEM_SLOT_KEYS) {
      // 全キーについて「そのキーだけを未入力に戻す」を1つずつ試す。
      // 1つのキーだけを見た検査だと、残り8キーが検査から抜け落ちていても気付けない。
      await setLegalItemSlot(project.id, OWNER_A, slotKey, "unset", null);

      const result = await checkSubmissionGate(project.id, OWNER_A);
      expect(result.ok).toBe(false);
      expect(result.unsetSlotKeys).toEqual([slotKey]);
      expect(result.unsetCategories).toEqual([]);

      await setLegalItemSlot(project.id, OWNER_A, slotKey, "filled", `値-${slotKey}`);
    }

    expect((await checkSubmissionGate(project.id, OWNER_A)).ok).toBe(true);
  });

  it("施工条件・範囲リストの区分が1つでも未検討なら止まり、その区分が結果に出る（どの区分が欠けても止まる）", async () => {
    const project = await projectReadyToSubmit("送信ゲート4");

    for (const category of SITE_CONDITION_CATEGORIES) {
      await setSiteConditionCheck(project.id, OWNER_A, category, "unset");

      const result = await checkSubmissionGate(project.id, OWNER_A);
      expect(result.ok).toBe(false);
      expect(result.unsetCategories).toEqual([category]);
      expect(result.unsetSlotKeys).toEqual([]);

      await setSiteConditionCheck(project.id, OWNER_A, category, "include");
    }

    expect((await checkSubmissionGate(project.id, OWNER_A)).ok).toBe(true);
  });

  it("「未定を明示」なら通り、「未入力」なら止まる（確定していないのか聞き忘れたのかを区別する）", async () => {
    const project = await createProject(
      { customerName: "送信ゲート5", siteAddress: "テスト" },
      OWNER_A,
    );
    for (const category of SITE_CONDITION_CATEGORIES) {
      await setSiteConditionCheck(project.id, OWNER_A, category, "include");
    }

    // 9スロット全部を「未定」で明示した状態。ガイドラインは「未定である旨を明確に示す」ことを
    // 求めており、それを満たしているので送信できる（docs/design.md 7章）。
    for (const slotKey of LEGAL_ITEM_SLOT_KEYS) {
      await setLegalItemSlot(project.id, OWNER_A, slotKey, "undetermined", null);
    }
    expect((await checkSubmissionGate(project.id, OWNER_A)).ok).toBe(true);

    // 同じ「本文が空」でも、何も選んでいない（未入力）なら止める。
    const [firstSlotKey] = LEGAL_ITEM_SLOT_KEYS;
    await setLegalItemSlot(project.id, OWNER_A, firstSlotKey, "unset", null);
    const afterUnset = await checkSubmissionGate(project.id, OWNER_A);
    expect(afterUnset.ok).toBe(false);
    expect(afterUnset.unsetSlotKeys).toEqual([firstSlotKey]);
  });

  it("×（条件外）を付けた区分も検討済みとして通る（○だけを通す検査にしない）", async () => {
    const project = await projectReadyToSubmit("送信ゲート6");
    await setSiteConditionCheck(project.id, OWNER_A, "scaffolding", "exclude");

    const result = await checkSubmissionGate(project.id, OWNER_A);
    expect(result.ok).toBe(true);
  });

  it("他人の ownerId では、埋めた内容が見えず送信できない（IDOR対策）", async () => {
    const project = await projectReadyToSubmit("送信ゲート7");

    expect((await checkSubmissionGate(project.id, OWNER_A)).ok).toBe(true);
    expect((await checkSubmissionGate(project.id, OWNER_B)).ok).toBe(false);
  });

  it("入力画面の1回の保存だけでゲートが開く（画面から一周できることの最小条件）", async () => {
    // 法定項目・施工条件の入力画面（app/projects/[id]/legal）は、9スロットと12区分を
    // まとめて1回で保存する。その保存の形そのままでゲートが開くことを確かめる。
    // 1件ずつ埋める経路（上の projectReadyToSubmit）が通っても、画面が使う
    // 一括保存の経路に穴があれば利用者はいつまでも送信できない。
    const project = await createProject(
      { customerName: "送信ゲート8", siteAddress: "テスト" },
      OWNER_A,
    );
    expect((await checkSubmissionGate(project.id, OWNER_A)).ok).toBe(false);

    await setLegalItemSlots(
      project.id,
      OWNER_A,
      LEGAL_ITEM_SLOT_KEYS.map((slotKey) => ({
        slotKey,
        // 内容が決まっていない項目は「未定」で通る。
        status: "undetermined" as const,
        value: null,
      })),
    );
    await setSiteConditionChecks(
      project.id,
      OWNER_A,
      SITE_CONDITION_CATEGORIES.map((category) => ({
        category,
        mark: "include" as const,
      })),
    );

    const result = await checkSubmissionGate(project.id, OWNER_A);
    expect(result.ok).toBe(true);
    expect(result.unsetSlotKeys).toEqual([]);
    expect(result.unsetCategories).toEqual([]);
  });
});
