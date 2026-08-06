// デモ利用者の識別子。
//
// **デモは無ログインで始まる。** 商談の場で相手にIDとパスワードを打たせると、
// そこで「簡単だ」という印象が壊れる。かわりに、デモを始めた時点で
// `demo:<uuid>` という使い捨ての識別子を発行し、通常のセッションCookieに載せる。
//
// この形にすると、認証まわりに新しい経路が1つも増えない：
// proxy.ts の保護判定も getCurrentUser() も owner_id による絞り込みも、
// ログイン済みの利用者とまったく同じ道を通る（AGENTS.md「結合を増やさない」2）。
//
// 訪問ごとに別のUUIDになるので、**商談が同時に2件走っても互いの操作は見えない。**
// 実データとの分離も owner_id が違うことで自然に付く。

import { randomUUID } from "node:crypto";

/**
 * デモ利用者の識別子に付ける印。
 * 実利用者の owner_id はメールアドレスなので、`:` を含むこの形とは衝突しない。
 */
export const DEMO_OWNER_PREFIX = "demo:";

/** 訪問1回ぶんの使い捨ての識別子を作る。 */
export function newDemoOwnerId(): string {
  return `${DEMO_OWNER_PREFIX}${randomUUID()}`;
}

/**
 * デモ利用者かどうか。画面の出し分け（デモ用の案内を出すか）に使う。
 * データの見せる・見せないは owner_id 一致で既に決まっているので、ここでは判定しない。
 */
export function isDemoOwner(ownerId: string): boolean {
  return ownerId.startsWith(DEMO_OWNER_PREFIX);
}
