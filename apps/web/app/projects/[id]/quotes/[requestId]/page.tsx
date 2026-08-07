import Link from "next/link";
import { notFound } from "next/navigation";

import { QuoteDocumentLines } from "../../../../../components/QuoteDocumentLines";
import { getCurrentUser } from "../../../../../lib/auth/server";
import { QUOTE_DOCUMENT_TEXT } from "../../../../../lib/content";
import { getProjectForOwner } from "../../../../../lib/db/projects";
import { getQuoteDocumentForRequest } from "../../../../../lib/db/quoteDocuments";

/**
 * D6 見積もり書類（**1社ずつ**。docs/flows.md「デモの画面の並び」）。
 *
 * 出るのは明細ごとの採用・保留と、「一覧へ」の1つだけ。
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

  const project = await getProjectForOwner(id, ownerId);
  if (!project) notFound();

  // 他人の依頼・別案件の依頼・存在しない依頼はここで null になる。
  const quote = await getQuoteDocumentForRequest(id, requestId, ownerId);
  if (!quote) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <h1 className="text-2xl font-bold">
        {`${quote.companyName}${QUOTE_DOCUMENT_TEXT.headingSuffix}`}
      </h1>
      <p className="mt-2 text-gray-700">{QUOTE_DOCUMENT_TEXT.description}</p>

      <QuoteDocumentLines projectId={id} quote={quote} />

      <Link
        href={`/projects/${id}/quotes`}
        className="tap mt-8 flex items-center justify-center rounded bg-blue-800 px-5 font-bold text-white"
      >
        {QUOTE_DOCUMENT_TEXT.toList}
      </Link>
    </main>
  );
}
