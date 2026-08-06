import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LegalItemsForm } from "../../../../components/LegalItemsForm";
import { getCurrentUser } from "../../../../lib/auth/server";
import { LEGAL_ITEMS_TEXT } from "../../../../lib/content";
import { listLegalItemSlots } from "../../../../lib/db/legalItemSlots";
import { getProjectForOwner } from "../../../../lib/db/projects";
import { listSiteConditionChecks } from "../../../../lib/db/siteConditionChecks";

/**
 * 法定項目・施工条件の入力画面（元請だけが見る）。
 * ここで埋めた内容を lib/db/submissionGate.ts が検査し、依頼を送れるかを決める。
 */
export default async function LegalItemsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ownerId = await getCurrentUser();
  if (!ownerId) redirect("/login");

  const project = await getProjectForOwner(id, ownerId);
  if (!project) notFound();

  const [slots, checks] = await Promise.all([
    listLegalItemSlots(id, ownerId),
    listSiteConditionChecks(id, ownerId),
  ]);

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">{LEGAL_ITEMS_TEXT.heading}</h1>
      <p className="mt-1 text-gray-700">{project.customerName}</p>
      <p className="mt-2 text-gray-700">{LEGAL_ITEMS_TEXT.description}</p>

      <LegalItemsForm projectId={id} slots={slots} checks={checks} />

      <Link
        href={`/projects/${id}`}
        className="tap mt-8 flex items-center justify-center rounded border-2 border-gray-500 px-5 py-3 font-bold"
      >
        {LEGAL_ITEMS_TEXT.back}
      </Link>
    </main>
  );
}
