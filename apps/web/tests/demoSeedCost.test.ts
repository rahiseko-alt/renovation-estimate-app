import { describe, expect, it, vi } from "vitest";

import { newDemoOwnerId } from "../lib/auth/demoOwner";

/**
 * **デモの1タップ目の待ち時間は、DBへの往復回数でほぼ決まる。**
 *
 * 1件ずつ順に入れていた頃は実行時20往復あり、本番（Vercel → Supabase）で
 * 5〜10秒かかって関数のタイムアウト境界に張り付いた。商談で見せられる速さではない。
 * `docs/failures.md` 2026-08-06 の「デモが本番で遅すぎた」を見る。
 *
 * ここは**上限**を置く。増やす向きの変更をしたら落ちる。
 * 落ちたら、まとめられる insert が残っていないかを先に疑う。
 *
 * 回数そのものより、**直列に待つ回数（波の数）**が効く。いまは6波：
 * 後始末2 → 会社設定・案件・下請3社（同時3）→ 見積・法定・条件・依頼グループ（同時4）
 * → 依頼 → 回答 → 回答明細。同じ表への複数行は1回の insert にまとめてある。
 */
const MAX_QUERIES = 12;

// 実クライアントを包んで、クエリの起点（.from）が何回呼ばれたかを数える。
const queryCount = vi.hoisted(() => ({ value: 0 }));
vi.mock("../lib/db/client", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../lib/db/client")>();
  return {
    ...original,
    getSupabaseClient: () => {
      const client = original.getSupabaseClient();
      return new Proxy(client, {
        get(target, property, receiver) {
          if (property === "from") {
            return (...args: unknown[]) => {
              queryCount.value += 1;
              return (target.from as (...a: unknown[]) => unknown)(...args);
            };
          }
          return Reflect.get(target, property, receiver);
        },
      });
    },
  };
});

const { seedDemoData } = await import("../lib/db/demoSeed");

describe("seedDemoData のDB往復回数", () => {
  it(`初めての利用者で ${MAX_QUERIES} 回以下に収まっている`, async () => {
    queryCount.value = 0;
    await seedDemoData(newDemoOwnerId());

    expect(queryCount.value).toBeLessThanOrEqual(MAX_QUERIES);
    // 0 だと数えられていないだけなので、数えられていること自体も見る。
    expect(queryCount.value).toBeGreaterThan(0);
  });
});
