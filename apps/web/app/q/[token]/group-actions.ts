"use server";

// 下請の回答を受け取る、ログイン不要の入口（作り直した版）。
// proxy.ts はこのパスにログインを要求しない。token を知っていることだけが資格情報。
//
// **ここが第三者から直接叩かれる唯一のServer Action**なので、画面側の検証を
// バイパスできる前提で、同じ検証をここでも行う
// （app/projects/[id]/photos-actions.ts が既存の同種原則）。
// 「その明細がこの依頼の対象範囲か」は lib/db/quoteGroupResponses.ts が確かめる。

import { MAX_QUANTITY_MAGNITUDE, MAX_UNIT_PRICE } from "../../../lib/calc";
import { createQuoteGroupResponse } from "../../../lib/db/quoteGroupResponses";
import type {
  QuoteResponseCostBreakdown,
  QuoteResponseLine,
} from "../../../lib/db/types";

/** 必要経費の内訳の上限。人が手で書く額の桁を大きく超える値を弾く。 */
const MAX_BREAKDOWN_AMOUNT = MAX_UNIT_PRICE;
/** 作業日数の上限。1件のリフォーム工事として現実的な範囲に収める。 */
const MAX_WORK_DAYS = 3_650;
/**
 * 元請支給材料の付記の上限。ログインしていない相手から届く自由文なので、
 * 際限なく受け取らない（DBの check 制約でも同じ値で止める）。
 */
const MAX_NOTE_LENGTH = 2_000;

function assertOptionalAmount(value: number | null, max: number): void {
  if (value === null) return;
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new Error("内訳の値が不正です。");
  }
}

function assertLines(lines: QuoteResponseLine[]): void {
  if (lines.length === 0) {
    throw new Error("明細が1件もありません。");
  }
  for (const line of lines) {
    if (
      !Number.isFinite(line.quantity) ||
      line.quantity < 0 ||
      line.quantity > MAX_QUANTITY_MAGNITUDE
    ) {
      throw new Error("数量が不正です。");
    }
    if (
      !Number.isInteger(line.costUnitPrice) ||
      line.costUnitPrice < 0 ||
      line.costUnitPrice > MAX_UNIT_PRICE
    ) {
      throw new Error("単価が不正です。");
    }
  }
}

export async function submitQuoteGroupResponseAction(
  token: string,
  lines: QuoteResponseLine[],
  breakdown: QuoteResponseCostBreakdown,
): Promise<{ ok: boolean }> {
  assertLines(lines);

  assertOptionalAmount(breakdown.materialCost, MAX_BREAKDOWN_AMOUNT);
  assertOptionalAmount(breakdown.laborCost, MAX_BREAKDOWN_AMOUNT);
  assertOptionalAmount(breakdown.legalWelfareCost, MAX_BREAKDOWN_AMOUNT);
  assertOptionalAmount(breakdown.safetyHealthCost, MAX_BREAKDOWN_AMOUNT);
  assertOptionalAmount(breakdown.retirementMutualAidCost, MAX_BREAKDOWN_AMOUNT);
  assertOptionalAmount(breakdown.workDays, MAX_WORK_DAYS);

  if (breakdown.materialSuppliedNote.length > MAX_NOTE_LENGTH) {
    throw new Error("元請支給の材料の記載が長すぎます。");
  }

  await createQuoteGroupResponse({ token, lines, breakdown });
  return { ok: true };
}
