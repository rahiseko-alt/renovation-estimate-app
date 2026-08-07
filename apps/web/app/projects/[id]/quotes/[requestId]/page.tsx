import Link from "next/link";
import { notFound } from "next/navigation";

import { DemoRestartButton } from "../../../../../components/DemoRestartButton";
import { QuoteDocumentLines } from "../../../../../components/QuoteDocumentLines";
import {
  QuoteBreakdownSheet,
  QuoteCoverSheet,
} from "../../../../../components/QuoteDocumentSheet";
import { isDemoOwner } from "../../../../../lib/auth/demoOwner";
import { getCurrentUser } from "../../../../../lib/auth/server";
import { QUOTE_DOCUMENT_TEXT } from "../../../../../lib/content";
import { getQuoteDocumentSheetForRequest } from "../../../../../lib/db/quoteDocuments";
import { SUBCONTRACTOR_QUOTE_TEXT } from "../../../../../lib/doc/templates/subcontractor-quote";

/**
 * D8 見積もり書類（**1社ずつ**。docs/flows.md「デモの画面の並び」）。
 *
 * **実務の見積書として読める中身を出す**（利用者の指示 2026-08-07。実機で
 * 「詳細画面が詳細じゃない。もっとリアルな情報が無いと意味がない」と言われた）。
 * 鑑（表紙）→ 内訳明示と法令の注意文 → 工事内訳（明細）の順で並べる。
 * 何を載せるかは `docs/design.md` 3章の一次情報が決めており、ここでは決めない。
 *
 * 出る操作は明細ごとの採用・保留と、「一覧へ」の1つだけ。
 * **画面が移るのは「一覧へ」を押したときだけ**（明細のボタンを押しても移らない）。
 * この表に無いボタン・遷移を足さない。
 *
 * proxy.ts が /projects 配下にログインを要求する。所有者確認はここでも行う
 * （デモの利用者も同じ経路を通る）。
 */
export default async function QuoteDocumentPage({
  params,
}: {
  params: Promise<{ id: string; requestId: string }>;
}) {
  const { id, requestId } = await params;
  const ownerId = await getCurrentUser();
  if (!ownerId) notFound();

  // 他人の依頼・別案件の依頼・存在しない依頼・**他人の案件**は、ここで null になる
  // （`getQuoteDocumentSheetForRequest` が中で `getProjectForOwner` を通す）。
  // **この手前で案件を引き直さない。** 同じ引数で2回引くことになり、本番では
  // 1往復0.5秒前後がそのまま表示時間に乗る（`docs/failures.md` 2026-08-06）。
  const sheet = await getQuoteDocumentSheetForRequest(id, requestId, ownerId);
  if (!sheet) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <h1 className="text-2xl font-bold">
        {`${sheet.quote.companyName}${QUOTE_DOCUMENT_TEXT.headingSuffix}`}
      </h1>
      <p className="mt-2 text-gray-700">{QUOTE_DOCUMENT_TEXT.description}</p>

      <QuoteCoverSheet cover={sheet.cover} totals={sheet.totals} />
      <QuoteBreakdownSheet breakdown={sheet.breakdown} />

      <h2 className="mt-6 text-lg font-bold">
        {SUBCONTRACTOR_QUOTE_TEXT.linesHeading}
      </h2>
      <QuoteDocumentLines projectId={id} quote={sheet.quote} />

      <Link
        href={`/projects/${id}/quotes`}
        className="tap mt-8 flex items-center justify-center rounded bg-blue-800 px-5 font-bold text-white"
      >
        {QUOTE_DOCUMENT_TEXT.toList}
      </Link>

      {/* D2〜D10 に1つずつ置く「最初からやり直す」。デモの利用者にだけ出す。 */}
      {isDemoOwner(ownerId) ? <DemoRestartButton /> : null}
    </main>
  );
}
