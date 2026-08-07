import Link from "next/link";
import { redirect } from "next/navigation";

import { DemoRestartButton } from "../../components/DemoRestartButton";
import { isDemoOwner } from "../../lib/auth/demoOwner";
import { getCurrentUser } from "../../lib/auth/server";
import { DRAFTS_TEXT } from "../../lib/content";
import { listDraftProjectsForOwner } from "../../lib/db/drafts";
import { listProjectsForOwner } from "../../lib/db/projects";

/**
 * D9 保存フォルダ（docs/flows.md「デモの画面の並び」）。
 *
 * **保存した案件を全部出す。** 以前は「まだ下請けに出していないもの」だけを出して
 * いたので、**送信を済ませた案件がフォルダから消え、保存したはずの書類を開けなかった**
 * （利用者の指摘 2026-08-08）。出したかどうかは目印で分け、開く道はどちらも同じにする。
 *
 * proxy.ts がログインを要求する（デモの利用者もセッションを持つので同じく通る）。
 */
export default async function DraftsPage() {
  const ownerId = await getCurrentUser();
  if (!ownerId) redirect("/login");

  const [projects, drafts] = await Promise.all([
    listProjectsForOwner(ownerId),
    listDraftProjectsForOwner(ownerId),
  ]);
  const draftIds = new Set(drafts.map((project) => project.id));

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">{DRAFTS_TEXT.heading}</h1>
      <p className="mt-2 text-gray-700">{DRAFTS_TEXT.description}</p>

      {projects.length === 0 ? (
        <p className="mt-6 text-gray-700">{DRAFTS_TEXT.empty}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {projects.map((project) => (
            <li
              key={project.id}
              className="flex flex-col rounded border-2 border-gray-400 px-5 py-3"
            >
              <span className="text-lg font-bold">{project.workName}</span>
              <span className="mt-1 text-gray-700">{project.siteAddress}</span>
              {draftIds.has(project.id) ? null : (
                <span className="mt-1 text-sm text-gray-700">
                  {DRAFTS_TEXT.sentMark}
                </span>
              )}
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
