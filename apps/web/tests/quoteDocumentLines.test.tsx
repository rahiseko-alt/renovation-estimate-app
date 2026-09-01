// D8 の明細が、**下請が申告した数量**で出ることを見る。
//
// 2026-09-01 まで、回答画面は数量を入れさせて保存していたのに、その値を読む画面も
// 計算も1つも無かった。依頼42㎡に下請が「45㎡」と答えても 42㎡ と出ていた。
// 数量を入れさせること自体は docs/design.md 3章で一次情報から決まっている
// （ガイドラインが下請の見積書に数量の内訳を求める）ので、使う側を直した。
//
// 数量そのものの組み立ては lib/db/quoteDocuments.ts が持ち、ローカル Supabase を
// 使う tests/quoteDocuments.test.ts が見る。ここが見るのは**画面に出るか**だけ
// （DBを要さない）。

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { QuoteDocumentLines } from "../components/QuoteDocumentLines";
import { QUOTE_DOCUMENT_TEXT } from "../lib/content";
import type { QuoteDocument } from "../lib/db/quoteDocuments";

function quote(
  quantity: number,
  requestedQuantity: number | null,
): QuoteDocument {
  return {
    requestId: "request-1",
    companyName: "甲社",
    lines: [
      {
        lineItemId: "line-1",
        name: "クロス張替え",
        quantity,
        requestedQuantity,
        unit: "㎡",
        costUnitPrice: 3_000,
        mark: null,
      },
    ],
  };
}

function render(document: QuoteDocument): string {
  return renderToStaticMarkup(
    <QuoteDocumentLines projectId="project-1" quote={document} />,
  );
}

describe("D8 の明細に出る数量", () => {
  it("その社が申告した数量を出す", () => {
    const html = render(quote(45, 42));
    expect(html).toContain("45 ㎡");
  });

  it("依頼した数量と違えば、依頼した側の数量も併記する", () => {
    // 黙って置き換えると、合計が動いた理由が元請から見えない
    // （docs/design.md 7章「気付かないうちに何かが決まっていた を作らない」）。
    const html = render(quote(45, 42));
    expect(html).toContain(QUOTE_DOCUMENT_TEXT.requestedQuantity(42, "㎡"));
  });

  it("依頼と同じ数量なら併記しない", () => {
    const html = render(quote(42, null));
    expect(html).toContain("42 ㎡");
    expect(html).not.toContain(QUOTE_DOCUMENT_TEXT.requestedQuantity(42, "㎡"));
  });
});
