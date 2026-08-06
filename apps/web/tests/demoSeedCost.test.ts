import { describe, expect, it, vi } from "vitest";

import { newDemoOwnerId } from "../lib/auth/demoOwner";

/**
 * **デモの1タップ目の待ち時間は、DBへの往復回数でほぼ決まる。**
 *
 * 1件ずつ順に入れていた頃は実行時20往復あり、本番（Vercel → Supabase）で
 * 5〜10秒かかって関数のタイムアウト境界に張り付いた。商談で見せられる速さではない。
 * `docs/failures.md` 2026-08-06 の
 * 「デモが本番で遅すぎて「動かん」状態だった（機能は動いていた）」を見る。
 *
 * ここは**上限**を置く。増やす向きの変更をしたら落ちる。
 * 落ちたら、まとめられる insert が残っていないかを先に疑う。
 *
 * 回数そのものより、**直列に待つ回数（波の数）**が効く。デモの1タップ目はいま5波：
 * 会社設定・案件・下請3社（同時3）→ 見積・法定・条件・依頼グループ（同時4）
 * → 依頼 → 回答・採用（同時2）→ 回答明細。同じ表への複数行は1回の insert にまとめてある。
 * 後始末は、使い捨ての owner_id を発行した直後で消す対象が無いため飛ばしている。
 */
const MAX_QUERIES = 11;

/**
 * CLI（scripts/seed-demo.sh）は実在の利用者に入れ直すので後始末が要る。
 * こちらは商談の待ち時間に乗らないが、青天井にはしない。
 */
const MAX_QUERIES_WITH_CLEANUP = MAX_QUERIES + 2;

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
        // receiver に Proxy を渡すと、プロトタイプ側のメソッドが this を見失う
        // （SupabaseClient.from は this.rest を読む）。必ず target に束縛する。
        get(target, property) {
          const value = Reflect.get(target, property, target);
          if (typeof value !== "function") return value;
          const bound = (value as (...a: unknown[]) => unknown).bind(target);
          if (property !== "from") return bound;
          return (...args: unknown[]) => {
            queryCount.value += 1;
            return bound(...args);
          };
        },
      });
    },
  };
});

const { seedDemoData } = await import("../lib/db/demoSeed");

describe("seedDemoData のDB往復回数", () => {
  it(`デモの1タップ目（後始末なし）で ${MAX_QUERIES} 回以下に収まっている`, async () => {
    queryCount.value = 0;
    await seedDemoData(newDemoOwnerId(), { ownerIsNew: true });

    expect(queryCount.value).toBeLessThanOrEqual(MAX_QUERIES);
    // 0 だと数えられていないだけなので、数えられていること自体も見る。
    expect(queryCount.value).toBeGreaterThan(0);
  });

  it(`CLI（後始末あり）で ${MAX_QUERIES_WITH_CLEANUP} 回以下に収まっている`, async () => {
    queryCount.value = 0;
    await seedDemoData(newDemoOwnerId());

    expect(queryCount.value).toBeLessThanOrEqual(MAX_QUERIES_WITH_CLEANUP);
    expect(queryCount.value).toBeGreaterThan(0);
  });
});
