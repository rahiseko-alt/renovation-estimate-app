import { notFound } from "next/navigation";

import { SendRequestForm } from "../../../../components/SendRequestForm";
import { getCurrentUser } from "../../../../lib/auth/server";
import { SEND_REQUEST_TEXT } from "../../../../lib/content";
import { getProjectForOwner } from "../../../../lib/db/projects";
import { listSubcontractorsForOwner } from "../../../../lib/db/subcontractors";
import { checkSubmissionGate } from "../../../../lib/db/submissionGate";

/**
 * 依頼グループの送信画面（元請だけが見る）。
 * 送信ゲートの結果をここで引き、何が足りないかをそのまま画面に出す
 * （docs/design.md 7章「自動で埋めた項目も、画面に出す」と同じ姿勢）。
 */
export default async function SendRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ownerId = await getCurrentUser();
  if (!ownerId) notFound();

  const project = await getProjectForOwner(id, ownerId);
  if (!project) notFound();

  const [gate, subcontractors] = await Promise.all([
    checkSubmissionGate(id, ownerId),
    listSubcontractorsForOwner(ownerId),
  ]);

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">{SEND_REQUEST_TEXT.heading}</h1>
      <p className="mt-1 text-gray-700">{project.workName}</p>

      <SendRequestForm
        projectId={id}
        gate={gate}
        subcontractors={subcontractors}
      />
    </main>
  );
}
