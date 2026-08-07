import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentUser } from "../../../../lib/auth/server";
import { formatYen } from "../../../../lib/calc";
import { QUOTE_LIST_TEXT } from "../../../../lib/content";
import { getProjectForOwner } from "../../../../lib/db/projects";
import { listAnsweredQuoteDocuments } from "../../../../lib/db/quoteDocuments";
import type { QuoteDocumentLine } from "../../../../lib/db/quoteDocuments";

/** 明細1行に出す印。採用でも保留でもなければ「未選択」。 */
function markLabel(line: QuoteDocumentLine): string {
  if (line.mark === "adopted") return QUOTE_LIST_TEXT.adoptedMark;
  if (line.mark === "on_hold") return QUOTE_LIST_TEXT.holdMark;
  return QUOTE_LIST_TEXT.unmarked;
}

/**
 * その社が単価を返してきた明細だけを並べる。回答の無い明細は D6 でも
 * 採用・保留を押せない（ボタンを出さない）ので、ここに「未選択」で出すと
 * 選べるものと見分けが付かなくなる。
 */
function isAnswered(
  line: QuoteDocumentLine,
): line is QuoteDocumentLine & { costUnitPrice: number } {
  return line.costUnitPrice !== null;
}

/**
 * D7 下請け見積もり一覧（案件ごと。docs/flows.md「デモの画面の並び」）。
 *
 * **社ごとに1ブロック**。D6 で押した採用・保留がここに貯まる。
 * 各社から D6 へ戻れる（「見積もりを見る」）。この表に無いボタン・遷移を足さない。
 */
export default async function QuoteListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ownerId = await getCurrentUser();
  if (!ownerId) notFound();

  const project = await getProjectForOwner(id, ownerId);
  if (!project) notFound();

  const quotes = await listAnsweredQuoteDocuments(id, ownerId);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <h1 className="text-2xl font-bold">{QUOTE_LIST_TEXT.heading}</h1>
      {/* 採用したものが見積書に入ることを、一覧の側でも書く。 */}
      <p className="mt-2 text-gray-700">{QUOTE_LIST_TEXT.description}</p>

      {quotes.length === 0 ? (
        <p className="mt-6 text-gray-700">{QUOTE_LIST_TEXT.empty}</p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {quotes.map((quote) => (
            <section
              key={quote.requestId}
              className="rounded border-2 border-gray-400 p-4"
            >
              <h2 className="-mx-4 -mt-4 rounded-t bg-gray-800 px-4 py-3 text-lg font-bold text-white">
                {quote.companyName}
              </h2>

              <ul className="mt-3 flex flex-col gap-2">
                {quote.lines.filter(isAnswered).map((line) => (
                  <li
                    key={line.lineItemId}
                    className="flex items-center justify-between gap-3 border-t border-gray-300 pt-2"
                  >
                    <div>
                      <div className="font-bold">{line.name}</div>
                      <div className="tabular text-gray-700">
                        {`${formatYen(line.costUnitPrice)}円`}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded px-3 py-1 font-bold ${
                        line.mark === "adopted"
                          ? "bg-blue-800 text-white"
                          : "bg-gray-300 text-gray-900"
                      }`}
                    >
                      {markLabel(line)}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href={`/projects/${id}/quotes/${quote.requestId}`}
                className="tap mt-4 flex items-center justify-center rounded bg-blue-800 px-5 font-bold text-white"
              >
                {QUOTE_LIST_TEXT.open}
              </Link>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
