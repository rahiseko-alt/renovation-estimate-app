import { notFound } from "next/navigation";

import { DemoRestartButton } from "../../../../components/DemoRestartButton";
import { DownloadPdfButton } from "../../../../components/DownloadPdfButton";
import { QuoteAdoptionMatrix } from "../../../../components/QuoteAdoptionMatrix";
import { isDemoOwner } from "../../../../lib/auth/demoOwner";
import { getCurrentUser } from "../../../../lib/auth/server";
import { QUOTE_LIST_TEXT } from "../../../../lib/content";
import { getProjectForOwner } from "../../../../lib/db/projects";
import { listAnsweredQuoteDocuments } from "../../../../lib/db/quoteDocuments";

/**
 * D7 下請け見積もり一覧（案件ごと。docs/flows.md「デモの画面の並び」）。
 *
 * **工事が行・社が列の表**（利用者の指示 2026-08-08）。同じ工事の3社の単価が
 * 同じ行に並ぶ。社名の横の「詳細」から D8 へ入る。この表に無いボタン・遷移を足さない。
 *
 * **この画面で押せるのは採用だけ**（同・利用者の指示）。単価のマスがそのまま
 * 採用のボタンで、押しても画面は移らない。**保留は D8 で押す**
 * （2026-08-07 の「一覧でも保留を押せる」はこの指示で置き換わった。
 * 経緯は docs/flows.md「D7 を表にした（2026-08-08）」）。
 *
 * 表は `components/QuoteAdoptionMatrix.tsx` が持ち、書き込みは D8 と同じ
 * Server Action を通る（AGENTS.md「結合を増やさない」2）。
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
        <div className="mt-2 flex flex-col gap-6">
          {/* その社が回答していない明細のマスが押せないのは部品側の判定
              （costUnitPrice が null なら押せない）。D8 と同じ扱いになる。 */}
          <QuoteAdoptionMatrix projectId={id} quotes={quotes} />

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
