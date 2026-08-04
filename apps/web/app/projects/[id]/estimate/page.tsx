import { notFound } from "next/navigation";

import { EstimateEditor } from "../../../../components/EstimateEditor";
import { ESTIMATE_EDITOR_TEXT } from "../../../../lib/content";
import { getOrCreateEstimate } from "../../../../lib/db/estimates";
import { getProject } from "../../../../lib/db/projects";

export default async function EstimatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const estimate = await getOrCreateEstimate(id);

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">
        {ESTIMATE_EDITOR_TEXT.heading}：{project.customerName}
      </h1>
      <EstimateEditor
        projectId={project.id}
        initialLines={estimate.lines}
        initialOverheadRatePercent={estimate.overheadRatePercent}
      />
    </main>
  );
}
