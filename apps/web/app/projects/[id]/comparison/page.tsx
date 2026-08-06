import { notFound } from "next/navigation";
import Link from "next/link";

import { AdoptedTotal } from "../../../../components/AdoptedTotal";
import { ComparisonTable } from "../../../../components/ComparisonTable";
import { DemoBanner } from "../../../../components/DemoBanner";
import { DownloadPdfButton } from "../../../../components/DownloadPdfButton";
import { isDemoOwner } from "../../../../lib/auth/demoOwner";
import { getCurrentUser } from "../../../../lib/auth/server";
import { COMPARISON_TEXT } from "../../../../lib/content";
import {
  DEMO_COMPARISON_TEXT,
  DEMO_LEGAL_ITEM_COUNT,
} from "../../../../lib/demoText";
import {
  cheapestRequestIdByLineId,
  getComparisonForProject,
} from "../../../../lib/db/comparison";
import { getProjectForOwner } from "../../../../lib/db/projects";

/**
 * 比較表と採用の画面（元請だけが見る。他社の単価が並ぶ）。
 * proxy.ts が /projects 配下にログインを要求する。所有者確認はここでも行う。
 */
export default async function ComparisonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ownerId = await getCurrentUser();
  if (!ownerId) notFound();

  const project = await getProjectForOwner(id, ownerId);
  if (!project) notFound();

  const comparison = await getComparisonForProject(id, ownerId);
  const cheapestByLineId = cheapestRequestIdByLineId(comparison);

  // デモは3タップ目でここから見積書へ抜ける。実利用者の画面には足さない
  // （案件詳細に同じボタンが既にあり、2箇所に増やす理由が無い）。
  const demo = isDemoOwner(ownerId);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      {demo ? <DemoBanner /> : null}
      <h1 className={`text-2xl font-bold${demo ? " mt-4" : ""}`}>
        {demo ? DEMO_COMPARISON_TEXT.heading : COMPARISON_TEXT.heading}
      </h1>
      <p className="mt-1 text-gray-700">{project.workName}</p>
      {demo ? (
        <p className="mt-2 text-gray-700">{DEMO_COMPARISON_TEXT.description}</p>
      ) : null}

      <ComparisonTable
        projectId={id}
        comparison={comparison}
        cheapestByLineId={cheapestByLineId}
      />

      {/* 採用しているぶんの合計。見積書を押す前に金額が見える（部品側にその理由を書いた）。 */}
      <AdoptedTotal totals={comparison.adoptedTotals} />

      {demo ? (
        <div className="mt-8 flex flex-col gap-3">
          <DownloadPdfButton projectId={id} />
          <p className="text-gray-700">
            {DEMO_COMPARISON_TEXT.legalNote(DEMO_LEGAL_ITEM_COUNT)}
            <Link
              href={`/projects/${id}/legal`}
              className="tap ml-2 inline-flex items-center text-blue-700 underline"
            >
              {DEMO_COMPARISON_TEXT.legalLink}
            </Link>
          </p>
        </div>
      ) : null}

      <Link href={`/projects/${id}`} className="tap mt-8 inline-flex items-center text-blue-700 underline">
        {COMPARISON_TEXT.back}
      </Link>
    </main>
  );
}
