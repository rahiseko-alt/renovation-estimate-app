import { describe, expect, it } from "vitest";

import {
  DEMO_OWNER_PREFIX,
  isDemoOwner,
  newDemoOwnerId,
} from "../lib/auth/demoOwner";
import { DEMO_LEGAL_ITEM_COUNT } from "../lib/demoText";

describe("デモ利用者の識別子", () => {
  it("訪問ごとに違う（商談が同時に2件走っても互いのデータが見えない）", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newDemoOwnerId()));
    expect(ids.size).toBe(50);
  });

  it("デモかどうかを見分けられる", () => {
    expect(isDemoOwner(newDemoOwnerId())).toBe(true);
  });

  // 実利用者の owner_id はメールアドレス。ここが逆に判定されると、
  // 実データの画面にデモの案内が出る／デモに実データが混ざる。
  it("メールアドレスの利用者をデモと誤認しない", () => {
    expect(isDemoOwner("someone@example.com")).toBe(false);
    expect(isDemoOwner("")).toBe(false);
    // 先頭以外に印が含まれていても、デモ扱いにしない。
    expect(isDemoOwner(`user+${DEMO_OWNER_PREFIX}x@example.com`)).toBe(false);
  });
});

describe("デモの案内が出す件数", () => {
  // 画面の文言に数字を直接書かず、項目の定義から数える。
  // 法定項目9 + 施工条件12 = 21。項目が増減したら表示も追随する。
  it("法定項目と施工条件の合計になっている", () => {
    expect(DEMO_LEGAL_ITEM_COUNT).toBe(21);
  });
});
