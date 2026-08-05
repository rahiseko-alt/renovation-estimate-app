import { notFound, redirect } from "next/navigation";

import { EstimateEditor } from "../../../../components/EstimateEditor";
import { QuoteRequestsList } from "../../../../components/QuoteRequestsList";
import { getCurrentUser } from "../../../../lib/auth/server";
import { ESTIMATE_EDITOR_TEXT } from "../../../../lib/content";
import { getOrCreateEstimate } from "../../../../lib/db/estimates";
import { getProjectForOwner } from "../../../../lib/db/projects";
import { listPriceMasterForOwner } from "../../../../lib/db/priceMaster";
import { listQuoteRequestsForProject } from "../../../../lib/db/quoteRequests";

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
  const quoteRequests = await listQuoteRequestsForProject(id, user);

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">
        {ESTIMATE_EDITOR_TEXT.heading}：{project.customerName}
      </h1>
      <EstimateEditor
        // 見積依頼の取り込み（取り込むと明細が増える）は保存を経由してこのページを
        // 再読み込みする形で反映する。updatedAt をキーにすることで、取り込み後の
        // 再読み込みで新しい明細を初期値として持つエディタに作り直す。
        key={estimate.updatedAt}
        projectId={project.id}
        initialLines={estimate.lines}
        initialOverheadRatePercent={estimate.overheadRatePercent}
        priceMasterItems={priceMasterItems}
      />
      <QuoteRequestsList projectId={project.id} initialQuoteRequests={quoteRequests} />
    </main>
  );
}
