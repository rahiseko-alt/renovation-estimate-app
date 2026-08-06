import { notFound } from "next/navigation";
import Link from "next/link";

import { ComparisonTable } from "../../../../components/ComparisonTable";
import { getCurrentUser } from "../../../../lib/auth/server";
import { COMPARISON_TEXT } from "../../../../lib/content";
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

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <h1 className="text-2xl font-bold">{COMPARISON_TEXT.heading}</h1>
      <p className="mt-1 text-gray-700">{project.workName}</p>

      <ComparisonTable
        projectId={id}
        comparison={comparison}
        cheapestByLineId={cheapestByLineId}
      />

      <Link href={`/projects/${id}`} className="tap mt-8 inline-flex items-center text-blue-700 underline">
        {COMPARISON_TEXT.back}
      </Link>
    </main>
  );
}
