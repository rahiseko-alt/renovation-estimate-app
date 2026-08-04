import { notFound, redirect } from "next/navigation";

import { EstimateEditor } from "../../../../components/EstimateEditor";
import { getCurrentUser } from "../../../../lib/auth/server";
import { ESTIMATE_EDITOR_TEXT } from "../../../../lib/content";
import { getOrCreateEstimate } from "../../../../lib/db/estimates";
import { getProjectForOwner } from "../../../../lib/db/projects";
import { listPriceMasterForOwner } from "../../../../lib/db/priceMaster";

export default async function EstimatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const project = await getProjectForOwner(id, user);
  if (!project) notFound();

  const estimate = await getOrCreateEstimate(id);
  const priceMasterItems = await listPriceMasterForOwner(user);

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">
        {ESTIMATE_EDITOR_TEXT.heading}：{project.customerName}
      </h1>
      <EstimateEditor
        projectId={project.id}
        initialLines={estimate.lines}
        initialOverheadRatePercent={estimate.overheadRatePercent}
        priceMasterItems={priceMasterItems}
      />
    </main>
  );
}
