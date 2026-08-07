// D8 見積もり書類（1社ずつ）が、**実務の見積書として読める中身**になっているかを見る
// （利用者の指示 2026-08-07。docs/flows.md「デモの画面の並び」D8）。
//
// **モックにしない。** ローカル Supabase に実際に案件・依頼・回答を作り、
// 読み取り（lib/db/quoteDocuments.ts）で組み立てたものを、画面と同じ部品
// （components/QuoteDocumentSheet.tsx）で描いて中身を数える。
// 型が合っているだけでは「欄はあるが値が出ていない」を捕まえられない
// （tests/quoteRequestDoc.test.tsx と同じ理由）。
//
// 見ているのは3つ：
// - 金額の合計が lib/calc.ts の計算と一致すること（画面が別の計算を持っていないこと）
// - 内訳6項目と鑑の欄が画面に出ていること
// - **未入力（null）の経費が「0円」ではなく未入力として出ること**
//   （内訳明示は努力義務。書かなかったことと0円で見積もったことは別）

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  QuoteBreakdownSheet,
  QuoteCoverSheet,
} from "../components/QuoteDocumentSheet";
import { calcEstimate, formatYen } from "../lib/calc";
import { QUOTE_DOCUMENT_TEXT } from "../lib/content";
import { upsertCompanyProfile } from "../lib/db/companyProfiles";
import { appendEstimateLine } from "../lib/db/estimates";
import { createProject } from "../lib/db/projects";
import { createQuoteGroupResponse } from "../lib/db/quoteGroupResponses";
import {
  createQuoteGroupRequest,
  createQuoteRequestGroup,
} from "../lib/db/quoteRequestGroups";
import { getQuoteDocumentSheetForRequest } from "../lib/db/quoteDocuments";
import type { QuoteDocumentSheet } from "../lib/db/quoteDocuments";
import { createSubcontractor } from "../lib/db/subcontractors";
import type { QuoteResponseCostBreakdown } from "../lib/db/types";
import { SUBCONTRACTOR_QUOTE_TEXT as TEXT } from "../lib/doc/templates/subcontractor-quote";
import { COMPANIES, QUOTE_COVER_BY_EMAIL } from "../lib/demoFixture";

// 案件・下請の登録件数には所有者ごとの上限（lib/limits.ts）がある。共用の
// owner-a@example.com を使い切らないよう、この検査専用の所有者を使う
// （tests/support/lineMarkSetup.ts と同じ理由）。
const OWNER = "quote-sheet-owner@example.com";
const CONTRACTOR_NAME = "検査元請株式会社";

/** 数量 × 単価が分かっている回答を1社ぶん作り、その1画面ぶんを取る。 */
async function setupSheet(
  name: string,
  breakdown: QuoteResponseCostBreakdown,
  /** 下請のメール。デモの3社のものを渡すと、鑑の決め打ちの欄が埋まる。 */
  email?: string,
): Promise<QuoteDocumentSheet> {
  await upsertCompanyProfile(OWNER, {
    contractorName: CONTRACTOR_NAME,
    representativeName: "検査 太郎",
    address: "東京都〇〇区0-0-0",
    defaultSlotValues: {},
  });

  const project = await createProject(
    { customerName: name, siteAddress: `${name}の現場` },
    OWNER,
  );
  // 既定行（解体・廃棄物処理費。数量1・式）に1行足して、数量が1でない行を作る。
  const estimate = await appendEstimateLine(project.id, {
    kind: "item",
    name: "クロス張替え",
    spec: "量産品",
    quantity: 12,
    unit: "㎡",
    unitPrice: 0,
    taxCategory: "standard",
  });
  const lineIds = estimate.lines.map((line) => line.id);

  const group = await createQuoteRequestGroup({ projectId: project.id }, OWNER);
  const subcontractor = await createSubcontractor(
    {
      companyName: `${name}甲社`,
      email: email ?? `${encodeURIComponent(name)}@example.com`,
    },
    OWNER,
  );
  const request = await createQuoteGroupRequest(
    {
      groupId: group.id,
      subcontractorId: subcontractor.id,
      plannedPriceBand: "under_500man",
      lineItemIds: lineIds,
    },
    OWNER,
  );
  await createQuoteGroupResponse({
    token: request.token,
    breakdown,
    lines: [
      { lineItemId: lineIds[0]!, quantity: 1, costUnitPrice: 85_000 },
      { lineItemId: lineIds[1]!, quantity: 12, costUnitPrice: 3_200 },
    ],
  });

  const sheet = await getQuoteDocumentSheetForRequest(
    project.id,
    request.id,
    OWNER,
  );
  if (!sheet) throw new Error("見積もり書類を組み立てられなかった");
  return sheet;
}

/** 内訳をすべて記入した回答。 */
const FILLED_BREAKDOWN: QuoteResponseCostBreakdown = {
  materialCost: 60_000,
  laborCost: 55_000,
  legalWelfareCost: 7_700,
  safetyHealthCost: 3_000,
  retirementMutualAidCost: 1_000,
  workDays: 6,
  materialSuppliedNote: "石膏ボードは元請支給とする。",
};

/** 必要経費を書かずに返してきた回答（努力義務なので成立する）。 */
const EMPTY_BREAKDOWN: QuoteResponseCostBreakdown = {
  materialCost: null,
  laborCost: null,
  legalWelfareCost: null,
  safetyHealthCost: null,
  retirementMutualAidCost: null,
  workDays: null,
  materialSuppliedNote: "",
};

describe("D8 見積もり書類の金額", () => {
  it("小計・消費税・合計が lib/calc.ts の計算と一致する", async () => {
    const sheet = await setupSheet("D8金額", FILLED_BREAKDOWN);

    // 期待値は画面と同じ経路（lib/calc.ts）で作る。ここに掛け算を書き写すと、
    // 実装と検査が同じ間違いをしても気付けない。
    const expected = calcEstimate({
      lines: [
        {
          kind: "item",
          name: "解体・廃棄物処理費",
          spec: "",
          quantity: 1,
          unit: "式",
          unitPrice: 85_000,
          taxCategory: "standard",
        },
        {
          kind: "item",
          name: "クロス張替え",
          spec: "",
          quantity: 12,
          unit: "㎡",
          unitPrice: 3_200,
          taxCategory: "standard",
        },
      ],
      overheadRatePercent: 0,
    });

    expect(sheet.totals.netAmount).toBe(expected.netAmount);
    expect(sheet.totals.taxAmount).toBe(expected.taxAmount);
    expect(sheet.totals.grandTotal).toBe(expected.grandTotal);
    // 数量が1の行だけを見ていないこと（85,000 + 3,200 × 12 = 123,400）。
    expect(sheet.totals.netAmount).toBe(123_400);
  });

  it("鑑に出る合計が、組み立てた合計と同じ文字で出る", async () => {
    const sheet = await setupSheet("D8鑑金額", FILLED_BREAKDOWN);
    const html = renderToStaticMarkup(
      <QuoteCoverSheet cover={sheet.cover} totals={sheet.totals} />,
    );

    expect(html).toContain(`${formatYen(sheet.totals.netAmount)}円`);
    expect(html).toContain(`${formatYen(sheet.totals.grandTotal)}円`);
    // 税率は 0.1 × 100 の浮動小数点の桁を出さない。
    expect(html).toContain("10%");
    expect(html).not.toContain("10.000000000000002");
  });
});

describe("D8 見積もり書類の中身", () => {
  it("鑑（表紙）の欄が出る", async () => {
    const sheet = await setupSheet("D8鑑", FILLED_BREAKDOWN);
    const html = renderToStaticMarkup(
      <QuoteCoverSheet cover={sheet.cover} totals={sheet.totals} />,
    );

    // 一致した欄（docs/design.md 3章）が、ラベルと値の両方で出ていること。
    for (const label of [
      TEXT.quoteNumberLabel,
      TEXT.issuedAtLabel,
      TEXT.workNameLabel,
      TEXT.workPlaceLabel,
      TEXT.workPeriodLabel,
      TEXT.validUntilLabel,
      TEXT.paymentTermsLabel,
      TEXT.deliveryPlaceLabel,
      TEXT.netAmountLabel,
      TEXT.taxRateLabel,
      TEXT.taxAmountLabel,
      TEXT.grandTotalLabel,
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain(TEXT.title);
    // 宛先は元請の会社設定＋「御中」（②の「様」と取り違えていないこと）。
    expect(html).toContain(`${CONTRACTOR_NAME} ${TEXT.recipientSuffix}`);
    expect(html).toContain(sheet.cover.issuer.companyName);
    expect(html).toContain(sheet.cover.workName);
    expect(html).toContain(TEXT.closing);
  });

  it("デモの3社でない下請の鑑は、埋められない欄を「未入力」で出す（架空の値を作らない）", async () => {
    // 住所・TEL・担当・支払条件・受渡場所・見積番号・工期・有効期限は、
    // いまDBに欄が無く、デモの3社にだけ決め打ちの値がある。**それ以外の社に当てない**
    // （実在の下請の見積書に架空の住所や電話が載る。2026-08-07 のレビュー指摘）。
    const sheet = await setupSheet("D8鑑デモ外", FILLED_BREAKDOWN);

    expect(sheet.cover.quoteNumber).toBeNull();
    expect(sheet.cover.issuer.address).toBeNull();
    expect(sheet.cover.issuer.tel).toBeNull();
    expect(sheet.cover.issuer.contactName).toBeNull();
    expect(sheet.cover.workPeriodStart).toBeNull();
    expect(sheet.cover.workPeriodEnd).toBeNull();
    expect(sheet.cover.validUntil).toBeNull();
    expect(sheet.cover.paymentTerms).toBeNull();
    expect(sheet.cover.deliveryPlace).toBeNull();

    const html = renderToStaticMarkup(
      <QuoteCoverSheet cover={sheet.cover} totals={sheet.totals} />,
    );
    // ラベルは残す（欄が消えると様式が崩れる）。値は「未入力」。
    expect(html).toContain(TEXT.issuerTelLabel);
    expect(html).toContain(QUOTE_DOCUMENT_TEXT.notEntered);
    // DBにある社名とメールは、そのまま出る。
    expect(html).toContain(sheet.cover.issuer.companyName);
    expect(html).toContain(sheet.cover.issuer.email);
  });

  it("デモの3社の鑑には、決め打ちの住所・TEL・担当が出る", async () => {
    const demoEmail = COMPANIES[0]!.email;
    const sheet = await setupSheet("D8鑑デモ社", FILLED_BREAKDOWN, demoEmail);
    const html = renderToStaticMarkup(
      <QuoteCoverSheet cover={sheet.cover} totals={sheet.totals} />,
    );

    const fixture = QUOTE_COVER_BY_EMAIL[demoEmail]!;
    expect(html).toContain(fixture.tel);
    expect(html).toContain(fixture.contactName);
    expect(html).toContain(fixture.address);
  });

  it("内訳の6項目と、様式に印字される法令の注意文が出る", async () => {
    const sheet = await setupSheet("D8内訳", FILLED_BREAKDOWN);
    const html = renderToStaticMarkup(
      <QuoteBreakdownSheet breakdown={sheet.breakdown} />,
    );

    // 建設業法第20条第1項が名指ししている記載事項（5経費＋作業日数）。
    for (const label of [
      TEXT.materialCostLabel,
      TEXT.laborCostLabel,
      TEXT.legalWelfareCostLabel,
      TEXT.safetyHealthCostLabel,
      TEXT.retirementMutualAidCostLabel,
      TEXT.workDaysLabel,
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain(`${formatYen(60_000)}円`);
    expect(html).toContain(`${formatYen(7_700)}円`);
    expect(html).toContain(TEXT.workDaysValue(6));
    // 元請支給材料の付記。
    expect(html).toContain("石膏ボードは元請支給とする。");
    // 注意文は原文のまま。要約・言い換えをしていないこと。
    expect(html).toContain("建設業法第20条第２項、第６項において禁止されています。");
    expect(html).toContain("建設業法第20条第４項により");
  });

  it("未入力の経費を「0円」と書かない（努力義務なので空で返ってくる）", async () => {
    const sheet = await setupSheet("D8未入力", EMPTY_BREAKDOWN);

    // 読み取りの側で 0 に埋めていないこと。
    expect(sheet.breakdown?.safetyHealthCost).toBeNull();
    expect(sheet.breakdown?.workDays).toBeNull();

    const html = renderToStaticMarkup(
      <QuoteBreakdownSheet breakdown={sheet.breakdown} />,
    );
    expect(html).toContain(QUOTE_DOCUMENT_TEXT.notEntered);
    expect(html).not.toContain("0円");
    // 元請支給材料の付記は、空欄のままにせず「なし」と出す
    // （書き忘れと「支給が無い」を読み分けられるようにする）。
    expect(html).toContain(TEXT.materialSuppliedNone);
  });
});
