import Link from "next/link";
import { redirect } from "next/navigation";

import { DemoRestartButton } from "../../components/DemoRestartButton";
import { isDemoOwner } from "../../lib/auth/demoOwner";
import { getCurrentUser } from "../../lib/auth/server";
import { DRAFTS_TEXT } from "../../lib/content";
import { listDraftProjectsForOwner } from "../../lib/db/drafts";

/**
 * D8 下書き保存フォルダ（docs/flows.md「デモの画面の並び」）。
 *
 * 下書き＝**まだ下請けに出していない案件**。その定義とクエリは lib/db/drafts.ts が持ち、
 * 下書き用のテーブルも列も作っていない。
 *
 * proxy.ts がログインを要求する（デモの利用者もセッションを持つので同じく通る）。
 */
export default async function DraftsPage() {
  const ownerId = await getCurrentUser();
  if (!ownerId) redirect("/login");

  const drafts = await listDraftProjectsForOwner(ownerId);

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">{DRAFTS_TEXT.heading}</h1>
      <p className="mt-2 text-gray-700">{DRAFTS_TEXT.description}</p>

      {drafts.length === 0 ? (
        <p className="mt-6 text-gray-700">{DRAFTS_TEXT.empty}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {drafts.map((project) => (
            <li
              key={project.id}
              className="flex flex-col rounded border-2 border-gray-400 px-5 py-3"
            >
              <span className="text-lg font-bold">{project.workName}</span>
              <span className="mt-1 text-gray-700">{project.siteAddress}</span>
              <Link
                href={`/projects/${project.id}/document`}
                className="tap mt-3 flex items-center justify-center rounded bg-blue-800 px-5 py-3 font-bold text-white"
              >
                {DRAFTS_TEXT.resume}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* D2〜D10 に1つずつ置く「最初からやり直す」。デモの利用者にだけ出す。 */}
      {isDemoOwner(ownerId) ? <DemoRestartButton /> : null}
    </main>
  );
}
