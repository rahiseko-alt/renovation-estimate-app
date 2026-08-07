import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentUser } from "../../../../lib/auth/server";
import { RECEIVED_TEXT } from "../../../../lib/content";
import { getProjectForOwner } from "../../../../lib/db/projects";

/**
 * D5 受信しました（デモ）（docs/flows.md「デモの画面の並び」）。
 * ボタンは「見積もりを見る」1つだけで、D6 の入口（/projects/[id]/quotes）へ渡す。
 * proxy.ts が /projects 配下にログインを要求し、所有者確認はここでも行う。
 */
export default async function ReceivedPage({
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
      <h1 className="text-2xl font-bold">{RECEIVED_TEXT.heading}</h1>
      <p className="mt-2 text-gray-700">{RECEIVED_TEXT.description}</p>

      <Link
        href={`/projects/${id}/quotes`}
        className="tap mt-8 flex items-center justify-center rounded bg-blue-800 px-6 py-4 text-lg font-bold text-white"
      >
        {RECEIVED_TEXT.toQuotes}
      </Link>
    </main>
  );
}
