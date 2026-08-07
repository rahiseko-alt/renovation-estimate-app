// 書類テンプレートを HTML に描く唯一の描画器。
//
// **画面＝HTML、印刷＝ブラウザ**（docs/design.md 7章「①見積依頼書のPDFは作らない」）。
// 描画器を1つにすることで「画面と印刷がずれる余地」を構造的に消す。日本語の
// 折り返しもブラウザが正しく行う（PDF側の lib/pdf/layout.ts は折り返しを持たない）。
//
// ここは配置の解釈だけを行う。文言はテンプレート、金額は lib/calc.ts が持つ。

import { formatYen, lineAmount } from "../../calc";
import { PHOTO_MAX_PER_LINE } from "../../flowText";
import {
  visibleTo,
  type DocAudience,
  type DocBlock,
  type DocData,
  type DocTemplate,
  type LineColumnKey,
} from "../schema";

/** 明細1行分の表示値。値引き行の金額欄だけ「▲」表記にする（協議会様式の慣行）。 */
function lineCellText(
  line: DocData["lines"][number],
  key: LineColumnKey,
): string {
  switch (key) {
    case "name":
      return line.name;
    case "spec":
      return line.spec;
    case "quantity":
      return String(line.quantity);
    case "unit":
      return line.unit;
    case "unitPrice":
      return formatYen(line.unitPrice);
    case "amount": {
      const amount = lineAmount(line);
      return line.kind === "discount"
        ? `▲${formatYen(Math.abs(amount))}`
        : formatYen(amount);
    }
  }
}

function TitleBlockView({ text }: { text: string }) {
  return <h1 className="doc-title">{text}</h1>;
}

function FieldListBlockView({
  block,
  data,
  audience,
}: {
  block: Extract<DocBlock, { kind: "fieldList" }>;
  data: DocData;
  audience: DocAudience;
}) {
  const fields = block.fields.filter((field) =>
    visibleTo(audience, field.audience),
  );
  if (fields.length === 0) return null;

  return (
    <dl className={`doc-fields doc-fields--${block.align}`}>
      {fields.map((field, index) => (
        <div className="doc-field" key={`${field.label}-${index}`}>
          {field.label ? <dt>{field.label}</dt> : null}
          <dd>{field.value(data)}</dd>
        </div>
      ))}
    </dl>
  );
}

function LineTableBlockView({
  block,
  data,
  audience,
}: {
  block: Extract<DocBlock, { kind: "lineTable" }>;
  data: DocData;
  audience: DocAudience;
}) {
  const columns = block.columns.filter((column) =>
    visibleTo(audience, column.audience),
  );
  const totalRatio = columns.reduce((sum, column) => sum + column.widthRatio, 0);

  return (
    <table className="doc-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              style={{
                width: `${(column.widthRatio / totalRatio) * 100}%`,
                textAlign: column.align,
              }}
            >
              {column.heading}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.lines.map((line) => (
          <tr key={line.id}>
            {columns.map((column) => (
              <td key={column.key} style={{ textAlign: column.align }}>
                {lineCellText(line, column.key)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PhotoLineBlockView({
  block,
  data,
}: {
  block: Extract<DocBlock, { kind: "photoLine" }>;
  data: DocData;
}) {
  return (
    <div className="doc-photo-lines">
      {data.lines.map((line) => {
        // 枠は明細1つにつき1つ。中に入る写真は0枚〜複数枚（DocData の説明）。
        // 0枚のときは空の点線枠のまま出す（撮り忘れがそのまま見える）。
        const photoUrls = data.photoUrlByLineId[line.id] ?? [];
        // **撮影画面と同じく、枠は3つ横に並べる。** 1つの枠に3枚を押し込むと
        // 1枚あたりが細くなり、右側が余白のまま残る（利用者の指摘 2026-08-08）。
        // 撮っていない枠は空の点線のまま出す（撮り忘れがそのまま見える）。
        const slots = Array.from(
          { length: PHOTO_MAX_PER_LINE },
          (_, index) => photoUrls[index] ?? null,
        );
        return (
          <div className="doc-photo-line" key={line.id}>
            <div className="doc-photo-line-body">
              <span className="doc-photo-line-name">{line.name}</span>
              <span className="doc-photo-line-quantity">
                {line.quantity > 0
                  ? `${block.quantityLabel}：${line.quantity} ${line.unit}`
                  : block.emptyQuantityText}
              </span>
            </div>
            <div className="doc-photo-frames">
              {slots.map((photoUrl, index) => (
                <div className="doc-photo-frame" key={photoUrl ?? `empty-${index}`}>
                  {photoUrl === null ? null : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl} alt={`${line.name}の現況写真`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TotalsBlockView({
  block,
  data,
}: {
  block: Extract<DocBlock, { kind: "totals" }>;
  data: DocData;
}) {
  const totals = data.totals;
  if (!totals) return null;

  return (
    <dl className="doc-totals">
      {block.rows.map((row) => (
        <div
          className={row.emphasize ? "doc-total doc-total--strong" : "doc-total"}
          key={row.label}
        >
          <dt>{row.label}</dt>
          <dd className="tabular">{formatYen(row.amount(totals))}円</dd>
        </div>
      ))}
    </dl>
  );
}

function LegalItemsBlockView({
  block,
  data,
}: {
  block: Extract<DocBlock, { kind: "legalItems" }>;
  data: DocData;
}) {
  if (data.legalItems.length === 0) return null;

  return (
    <section className="doc-legal-items">
      <h2 className="doc-section-heading">{block.heading}</h2>
      <dl>
        {data.legalItems.map((item) => (
          <div className="doc-legal-item" key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function BlockView({
  block,
  data,
  audience,
}: {
  block: DocBlock;
  data: DocData;
  audience: DocAudience;
}) {
  switch (block.kind) {
    case "title":
      return <TitleBlockView text={block.text} />;
    case "fieldList":
      return (
        <FieldListBlockView block={block} data={data} audience={audience} />
      );
    case "sectionHeading":
      return <h2 className="doc-section-heading">{block.text}</h2>;
    case "lineTable":
      return <LineTableBlockView block={block} data={data} audience={audience} />;
    case "photoLine":
      return <PhotoLineBlockView block={block} data={data} />;
    case "totals":
      return <TotalsBlockView block={block} data={data} />;
    case "legalItems":
      return <LegalItemsBlockView block={block} data={data} />;
    case "notes":
      return (
        <div className="doc-notes">
          {block.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      );
  }
}

/**
 * テンプレートとデータから書類を描く。
 *
 * audience を必ず受け取る。下請向けに描くときは "subcontractor" を渡すことで、
 * 施主名など見せてはいけない欄がテンプレート側の指定に従って落ちる
 * （docs/design.md 7章「下請に見せるもの・見せないもの」）。
 */
export function DocumentView({
  template,
  data,
  audience,
}: {
  template: DocTemplate;
  data: DocData;
  audience: DocAudience;
}) {
  return (
    <article
      className="doc-page"
      style={{
        width: template.pageWidthPx,
        minHeight: template.pageHeightPx,
        padding: template.marginPx,
      }}
    >
      {template.blocks.map((block, index) => (
        <BlockView
          block={block}
          data={data}
          audience={audience}
          key={`${block.kind}-${index}`}
        />
      ))}
    </article>
  );
}
