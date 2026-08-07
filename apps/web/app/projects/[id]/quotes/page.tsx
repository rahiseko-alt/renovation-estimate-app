import Link from "next/link";
import { notFound } from "next/navigation";

import { DemoRestartButton } from "../../../../components/DemoRestartButton";
import { DownloadPdfButton } from "../../../../components/DownloadPdfButton";
import { QuoteDocumentLines } from "../../../../components/QuoteDocumentLines";
import { isDemoOwner } from "../../../../lib/auth/demoOwner";
import { getCurrentUser } from "../../../../lib/auth/server";
import { QUOTE_LIST_TEXT } from "../../../../lib/content";
import { getProjectForOwner } from "../../../../lib/db/projects";
import { listAnsweredQuoteDocuments } from "../../../../lib/db/quoteDocuments";

/**
 * D7 下請け見積もり一覧（案件ごと。docs/flows.md「デモの画面の並び」）。
 *
 * **社ごとに1ブロック**。各社から D8 へ入れる（「見積もりを見る」）。
 * この表に無いボタン・遷移を足さない。
 *
 * **採用／保留は D7 と D8 の両方で押せる**（利用者の指示 2026-08-07。
 * 実機で「一覧で押せない。詳細でしか押せない」と言われた）。押しても画面は移らず、
 * どちらで押しても同じところ（`line_adoptions`）に入る。**明細のボタンは D8 と
 * 同じ部品**（`components/QuoteDocumentLines.tsx`）をそのまま呼ぶ。ここに同じ
 * ボタンを書くと、押下状態の出し方や失敗時の文言が2箇所に分かれる
 * （AGENTS.md「結合を増やさない」2：同じ処理を呼ぶ入口は1つにする）。
 *
 * D7 → D10 は「見積書を出す」1つだけ（利用者の指示 2026-08-07）。
 * PDF を出す処理は案件詳細・比較表と同じ DownloadPdfButton を通る。
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

              {/* その社が回答していない明細にボタンが出ないのは部品側の判定
                  （costUnitPrice が null なら出さない）。D8 と同じ扱いになる。 */}
              <QuoteDocumentLines projectId={id} quote={quote} />

              <Link
                href={`/projects/${id}/quotes/${quote.requestId}`}
                className="tap mt-4 flex items-center justify-center rounded bg-blue-800 px-5 font-bold text-white"
              >
                {QUOTE_LIST_TEXT.open}
              </Link>
            </section>
          ))}

          {/* 回答が1件も無いとき（上の empty）はこのボタンを出さない。採用できる単価が
              1つも無く、押しても中身の無い書類が出るだけになるため。 */}
          <DownloadPdfButton projectId={id} label={QUOTE_LIST_TEXT.toPdf} />
        </div>
      )}

      {/* D2〜D10 に1つずつ置く「最初からやり直す」。デモの利用者にだけ出す。 */}
      {isDemoOwner(ownerId) ? <DemoRestartButton /> : null}
    </main>
  );
}
