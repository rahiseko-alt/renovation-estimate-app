import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { calcEstimate } from "../lib/calc";
import { formatDateJst } from "../lib/doc/date";
import { DocumentView } from "../lib/doc/render/html";
import type { DocData, DocLine } from "../lib/doc/schema";
import {
  ESTIMATE_DOCUMENT_TEXT,
  ESTIMATE_TEMPLATE,
  ESTIMATE_TOTALS_ROWS,
} from "../lib/doc/templates/estimate";
import { QUOTE_REQUEST_TEMPLATE } from "../lib/doc/templates/quote-request";

function line(partial: Partial<DocLine> = {}): DocLine {
  return {
    id: "line-1",
    kind: "item",
    name: "キッチン工事",
    spec: "既存撤去共",
    quantity: 1,
    unit: "式",
    unitPrice: 100_000,
    taxCategory: "standard",
    ...partial,
  };
}

function docData(partial: Partial<DocData> = {}): DocData {
  return {
    workName: "東京都渋谷区1-2-3 リフォーム工事",
    siteAddress: "東京都渋谷区1-2-3",
    customerName: "見積 太郎",
    responseDueAt: new Date("2026-08-20T00:00:00+09:00"),
    issuedAt: new Date("2026-08-06T00:00:00+09:00"),
    lines: [line()],
    totals: null,
    photoUrlByLineId: {},
    legalItems: [],
    ...partial,
  };
}

describe("書類の日付", () => {
  it("日本時間で確定する（UTCのサーバでも前日にならない）", () => {
    // 日本時間 2026-08-07 の朝8時＝UTCでは 8/6 の23時。サーバの素の日付整形だと
    // 本番（UTC）で前日が印字される（docs/design.md 7章「タイムゾーンに注意」）。
    const morningInJapan = new Date("2026-08-07T08:00:00+09:00");
    expect(formatDateJst(morningInJapan)).toBe("2026年8月7日");
  });
});

describe("①見積依頼書", () => {
  it("法定①工事名称・法定②施工場所が書類に出ている（B4）", () => {
    const data = docData();
    const html = renderToStaticMarkup(
      <DocumentView
        template={QUOTE_REQUEST_TEMPLATE}
        data={data}
        audience="subcontractor"
      />,
    );
    expect(html).toContain(data.workName);
    expect(html).toContain(data.siteAddress);
  });

  it("見積回答期限が日本時間で印字される", () => {
    const html = renderToStaticMarkup(
      <DocumentView
        template={QUOTE_REQUEST_TEMPLATE}
        data={docData()}
        audience="subcontractor"
      />,
    );
    expect(html).toContain("2026年8月20日まで");
  });

  it("下請に渡る書類に、施主名・売価・原価が出ない（C2と同じ趣旨）", () => {
    // 型ではなく、実際に描かれた HTML そのものを検査する。下請に売価が渡ると
    // 相見積の前提が崩れる（docs/design.md 7章「下請に見せるもの・見せないもの」）。
    const data = docData({
      customerName: "秘密 花子",
      lines: [line({ unitPrice: 987_654 })],
    });
    const html = renderToStaticMarkup(
      <DocumentView
        template={QUOTE_REQUEST_TEMPLATE}
        data={data}
        audience="subcontractor"
      />,
    );
    expect(html).not.toContain("秘密 花子");
    expect(html).not.toContain("987,654");
  });

  it("写真枠は1明細につき1つ（B8）", () => {
    const data = docData({
      lines: [line({ id: "a" }), line({ id: "b", name: "浴室工事" })],
    });
    const html = renderToStaticMarkup(
      <DocumentView
        template={QUOTE_REQUEST_TEMPLATE}
        data={data}
        audience="subcontractor"
      />,
    );
    const frames = html.match(/doc-photo-frame/g) ?? [];
    expect(frames).toHaveLength(data.lines.length);
  });

  it("法定項目の定型文が、渡した順に書類へ出る", () => {
    const legalItems = [
      { label: "責任施工範囲", body: "本書に記載の工事範囲一式とします。" },
      { label: "建設副産物の運搬・処理", body: "元請の負担とします。" },
    ];
    const html = renderToStaticMarkup(
      <DocumentView
        template={QUOTE_REQUEST_TEMPLATE}
        data={docData({ legalItems })}
        audience="subcontractor"
      />,
    );
    for (const item of legalItems) {
      expect(html).toContain(item.label);
      expect(html).toContain(item.body);
    }
    expect(html.indexOf(legalItems[0]!.label)).toBeLessThan(
      html.indexOf(legalItems[1]!.label),
    );
  });
});

describe("②御見積書", () => {
  it("集計欄の項目名と並び順がテンプレートどおりに出る（B7）", () => {
    const lines = [line()];
    const totals = calcEstimate({ lines, overheadRatePercent: 10 });
    const html = renderToStaticMarkup(
      <DocumentView
        template={ESTIMATE_TEMPLATE}
        data={docData({ lines, totals })}
        audience="contractor"
      />,
    );

    // indexOf での順序比較にしない。「小計」は「直接工事費 小計」の部分文字列で、
    // 常に先の位置に当たってしまう（この検査を書いたとき実際に踏んだ）。
    // 集計欄に描かれた見出しをそのまま順に取り出して、配列ごと突き合わせる。
    const totalsSection = html.slice(html.indexOf('class="doc-totals"'));
    const renderedLabels = [...totalsSection.matchAll(/<dt>([^<]*)<\/dt>/g)].map(
      (match) => match[1],
    );
    expect(renderedLabels).toEqual(ESTIMATE_TOTALS_ROWS.map((row) => row.label));
  });

  it("宛名は施主名＋様。②は施主に出す書類なので施主名を印字する", () => {
    const html = renderToStaticMarkup(
      <DocumentView
        template={ESTIMATE_TEMPLATE}
        data={docData({ customerName: "見積 太郎" })}
        audience="contractor"
      />,
    );
    expect(html).toContain(`見積 太郎${ESTIMATE_DOCUMENT_TEXT.recipientSuffix}`);
  });

  it("同じ②を下請向けに描くと、施主名の欄が落ちる（テンプレートの見せる相手の軸）", () => {
    const html = renderToStaticMarkup(
      <DocumentView
        template={ESTIMATE_TEMPLATE}
        data={docData({ customerName: "見積 太郎" })}
        audience="subcontractor"
      />,
    );
    expect(html).not.toContain("見積 太郎");
  });

  it("明細の行が、渡した順に表へ出る（B7）", () => {
    const lines = [
      line({ id: "a", name: "先の工事" }),
      line({ id: "b", name: "後の工事" }),
    ];
    const html = renderToStaticMarkup(
      <DocumentView
        template={ESTIMATE_TEMPLATE}
        data={docData({
          lines,
          totals: calcEstimate({ lines, overheadRatePercent: 0 }),
        })}
        audience="contractor"
      />,
    );
    expect(html.indexOf("先の工事")).toBeLessThan(html.indexOf("後の工事"));
  });

  it("値引き行の金額は「▲」表記（協議会様式の慣行）", () => {
    const lines = [
      line(),
      line({ id: "d", kind: "discount", name: "値引き", unitPrice: -10_000 }),
    ];
    const html = renderToStaticMarkup(
      <DocumentView
        template={ESTIMATE_TEMPLATE}
        data={docData({
          lines,
          totals: calcEstimate({ lines, overheadRatePercent: 0 }),
        })}
        audience="contractor"
      />,
    );
    expect(html).toContain("▲10,000");
  });
});
