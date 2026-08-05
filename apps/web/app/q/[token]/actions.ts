"use server";

import { MAX_UNIT_PRICE } from "../../../lib/calc";
import { submitQuoteResponse } from "../../../lib/db/quoteRequests";

/**
 * 下請の回答を受け取る、ログイン不要の入口。proxy.ts はこのパスにログインを要求しない
 * （下請にログインさせない設計。lib/content.ts QUOTE_RESPONSE_TEXT 参照）。
 * token を知っていることだけが資格情報なので、それ以外の権限確認は行わない
 * （lib/db/quoteRequests.ts のコメント参照）。
 *
 * 原価単価は外部（ログインしていない相手）からの入力そのものなので、画面側の検証を
 * バイパスできる前提でここでも同じ範囲（0以上・整数・calc.ts の MAX_UNIT_PRICE 以下）
 * を確かめる。
 */
export async function submitQuoteResponseAction(
  token: string,
  costUnitPrice: number,
): Promise<{ ok: boolean }> {
  if (
    !Number.isInteger(costUnitPrice) ||
    costUnitPrice < 0 ||
    costUnitPrice > MAX_UNIT_PRICE
  ) {
    throw new Error("原価単価が不正です。");
  }

  const updated = await submitQuoteResponse(token, costUnitPrice);
  if (!updated) {
    throw new Error("この依頼は見つからないか、既に回答済みです。");
  }
  return { ok: true };
}
