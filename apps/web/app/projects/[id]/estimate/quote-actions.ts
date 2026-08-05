"use server";

import {
  MAX_MARKUP_RATE,
  MAX_QUANTITY_MAGNITUDE,
  MAX_TEXT_LENGTH,
  isValidTaxCategory,
  sellingUnitPrice,
  type EstimateLine,
} from "../../../../lib/calc";
import { getCurrentUser } from "../../../../lib/auth/server";
import { UNITS } from "../../../../lib/content";
import { appendEstimateLine } from "../../../../lib/db/estimates";
import { getProjectForOwner } from "../../../../lib/db/projects";
import {
  createQuoteRequest,
  getQuoteRequestForOwner,
  markQuoteRequestImported,
} from "../../../../lib/db/quoteRequests";
import type { QuoteRequest } from "../../../../lib/db/types";

const UNIT_SET: ReadonlySet<string> = new Set(UNITS);

/**
 * 見積エディタの明細1行から、下請への見積依頼を作る。
 * saveEstimateAction と同じ理由（IDOR対策）で、ログイン状態と案件の所有者を
 * ここでも確かめる。明細に永続IDが無いため（lib/db/quoteRequests.ts 参照）、
 * 依頼した時点の工事項目・摘要・数量・単位・税区分をスナップショットとして受け取る。
 * これらはまだ保存前（未保存）の入力かもしれないので、calcEstimate と同じ水準の
 * 検証をここでも行う。
 */
export async function requestQuoteAction(
  projectId: string,
  item: {
    name: string;
    spec: string;
    quantity: number;
    unit: string;
    taxCategory: string;
  },
  markupRate: number,
): Promise<QuoteRequest> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("ログインしていません。");
  }

  const project = await getProjectForOwner(projectId, user);
  if (!project) {
    throw new Error("案件が見つかりません。");
  }

  if (item.name.trim() === "" || item.name.length > MAX_TEXT_LENGTH) {
    throw new Error("工事項目が不正です。");
  }
  if (item.spec.length > MAX_TEXT_LENGTH) {
    throw new Error("摘要が不正です。");
  }
  if (!UNIT_SET.has(item.unit)) {
    throw new Error("単位が不正です。");
  }
  if (
    !Number.isFinite(item.quantity) ||
    Math.abs(item.quantity) > MAX_QUANTITY_MAGNITUDE
  ) {
    throw new Error("数量が不正です。");
  }
  if (!isValidTaxCategory(item.taxCategory)) {
    throw new Error("税区分が不正です。");
  }
  if (
    !Number.isFinite(markupRate) ||
    markupRate < 0 ||
    markupRate > MAX_MARKUP_RATE
  ) {
    throw new Error("掛率が不正です。");
  }

  return createQuoteRequest(
    {
      projectId,
      itemName: item.name,
      itemSpec: item.spec,
      quantity: item.quantity,
      unit: item.unit,
      taxCategory: item.taxCategory,
      markupRate,
    },
    user,
  );
}

/**
 * 下請からの回答を見積に取り込む。原価単価に依頼作成時の掛率を掛けて売価単価を出し、
 * 新しい明細行として追加する（既存の行を探して書き換えない。明細に永続IDが無いため、
 * 依頼を作ってから見積側で行を編集・削除していても安全に取り込める形にしている）。
 */
export async function importQuoteResponseAction(
  projectId: string,
  quoteRequestId: string,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("ログインしていません。");
  }

  const project = await getProjectForOwner(projectId, user);
  if (!project) {
    throw new Error("案件が見つかりません。");
  }

  const quoteRequest = await getQuoteRequestForOwner(quoteRequestId, user);
  if (!quoteRequest || quoteRequest.projectId !== projectId) {
    throw new Error("依頼が見つかりません。");
  }
  if (quoteRequest.status !== "responded" || quoteRequest.costUnitPrice === null) {
    throw new Error("まだ回答が届いていない、または既に取り込み済みです。");
  }

  // 見積に行を足す前に、先に取り込み済みへ切り替える（status=responded の行にしか
  // 書き込まない update）。二重クリック等で importQuoteResponseAction が2回同時に
  // 走っても、後から来た方はここで null を受け取って何もせず例外になる。
  // 逆の順序（先に行を足してから取り込み済みにする）だと、2回とも「まだ responded」の
  // まま行を足せてしまい、同じ明細が2行入る。
  const imported = await markQuoteRequestImported(quoteRequestId, user);
  if (!imported) {
    throw new Error("既に取り込み済みです。");
  }

  const unitPrice = sellingUnitPrice(
    imported.costUnitPrice ?? quoteRequest.costUnitPrice,
    imported.markupRate,
  );

  const newLine: EstimateLine = {
    kind: "item",
    name: imported.itemName,
    spec: imported.itemSpec,
    quantity: imported.quantity,
    unit: imported.unit,
    unitPrice,
    taxCategory: imported.taxCategory,
  };

  // 読んで・足して・書き直すのではなく、見積側の楽観ロック（appendEstimateLine）に
  // 1行だけ渡す。複数の依頼をほぼ同時に取り込んでも、互いの追加が上書きし合わない。
  await appendEstimateLine(projectId, newLine);
}
