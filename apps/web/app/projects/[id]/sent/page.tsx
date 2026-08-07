import { notFound } from "next/navigation";

import { DemoRestartButton } from "../../../../components/DemoRestartButton";
import { SentAutoAdvance } from "../../../../components/SentAutoAdvance";
import { isDemoOwner } from "../../../../lib/auth/demoOwner";
import { getCurrentUser } from "../../../../lib/auth/server";
import { SENT_TEXT } from "../../../../lib/content";
import { getProjectForOwner } from "../../../../lib/db/projects";

/**
 * D4 送信しました（デモ）（docs/flows.md「デモの画面の並び」）。
 * ボタンは無く、ロード中を流してから D5 へ自動で進む。
 * proxy.ts が /projects 配下にログインを要求し、所有者確認はここでも行う。
 */
export default async function SentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ownerId = await getCurrentUser();
  if (!ownerId) notFound();

  const project = await getProjectForOwner(id, ownerId);
  if (!project) notFound();

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">{SENT_TEXT.heading}</h1>
      <p className="mt-2 text-gray-700">{SENT_TEXT.description}</p>

      <SentAutoAdvance nextHref={`/projects/${id}/received`} />

      {/* D2〜D10 に1つずつ置く「最初からやり直す」。デモの利用者にだけ出す。 */}
      {isDemoOwner(ownerId) ? <DemoRestartButton /> : null}
    </main>
  );
}
