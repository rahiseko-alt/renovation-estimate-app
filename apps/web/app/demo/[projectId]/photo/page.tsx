import { notFound } from "next/navigation";

import { DemoBanner } from "../../../../components/DemoBanner";
import { DemoPhotoStep } from "../../../../components/DemoPhotoStep";
import { getCurrentUser } from "../../../../lib/auth/server";
import { isDemoOwner } from "../../../../lib/auth/demoOwner";
import { DEMO_PHOTO_TEXT } from "../../../../lib/demoText";
import { getProjectForOwner } from "../../../../lib/db/projects";

/**
 * デモの1タップ目の着地点。
 *
 * `/demo` は proxy.ts の保護対象に入れていない（保護対象はログインを要求する範囲で、
 * デモは無ログインで始まるため）。かわりに、ここでデモの識別子であることと
 * 案件の所有者であることの両方を確かめる。実利用者がURLを直打ちしても開かない。
 */
export default async function DemoPhotoPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const ownerId = await getCurrentUser();
  if (!ownerId || !isDemoOwner(ownerId)) notFound();

  const project = await getProjectForOwner(projectId, ownerId);
  if (!project) notFound();

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <DemoBanner />
      <h1 className="mt-4 text-2xl font-bold">{DEMO_PHOTO_TEXT.heading}</h1>
      <p className="mt-2 text-gray-700">{DEMO_PHOTO_TEXT.description}</p>

      <DemoPhotoStep
        projectId={projectId}
        nextHref={`/projects/${projectId}/comparison`}
      />
    </main>
  );
}
