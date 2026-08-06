import { describe, expect, it } from "vitest";

import * as DEMO_FIXTURE from "../lib/demoFixture";
import {
  DEMO_CONTENT_VERSION,
  demoContentVersion,
} from "../lib/demoVersion";

/**
 * デモの中身を直したのに版が変わらないと、**既にデモ中の人へ古い案件を返し続ける**
 * （`docs/failures.md` 2026-08-06「見た感じ変わってない」）。
 *
 * 版は `lib/demoFixture.ts` の export 全部から作る。**名前を並べる形にしない。**
 * 一度その形にしたら `DEMO_WORK_NAME` が漏れていた（CodeRabbit の指摘）。
 * ここでは「どの export を落としても版が変わる」ことを見て、漏れを機械で止める。
 */
describe("DEMO_CONTENT_VERSION", () => {
  it("デモの中身のどの値を変えても版が変わる（含め漏れが無い）", () => {
    const fixture = { ...DEMO_FIXTURE } as Record<string, unknown>;
    const keys = Object.keys(fixture);
    // 0件だと下のループが一度も回らず、何も検査しないまま緑になる。
    expect(keys.length).toBeGreaterThan(0);

    for (const key of keys) {
      const withoutKey = { ...fixture };
      delete withoutKey[key];
      expect(
        demoContentVersion(withoutKey),
        `${key} が版の材料に入っていない。直しても古いデモが返り続ける`,
      ).not.toBe(DEMO_CONTENT_VERSION);
    }
  });

  it("同じ中身なら毎回同じ版になる（デプロイのたびに作り直させない）", () => {
    expect(demoContentVersion({ ...DEMO_FIXTURE })).toBe(DEMO_CONTENT_VERSION);
    // 呼ぶたびに変わらないこと自体も見る（乱数や時刻が混ざっていない）。
    expect(demoContentVersion({ ...DEMO_FIXTURE })).toBe(
      demoContentVersion({ ...DEMO_FIXTURE }),
    );
  });

  it("Cookie に載る形（短い16進）になっている", () => {
    expect(DEMO_CONTENT_VERSION).toMatch(/^[0-9a-f]{12}$/);
  });
});
