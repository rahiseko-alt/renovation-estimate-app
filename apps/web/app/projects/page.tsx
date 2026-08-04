import Link from "next/link";

import { PROJECTS_TEXT } from "../../lib/content";

/**
 * 案件一覧。proxy.ts がログインを要求する。
 * 中身はこれから作る。入口から出口までを1回通すため、行き先だけ先に置いている
 * （AGENTS.md「実装の進め方」：途中の各段は空の返事でよい）。
 */
export default function ProjectsPage() {
  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">{PROJECTS_TEXT.heading}</h1>
      <p className="mt-4 text-gray-700">{PROJECTS_TEXT.empty}</p>

      <Link
        href="/"
        className="tap mt-8 flex items-center justify-center rounded border-2 border-gray-500 px-5 py-3 font-bold"
      >
        {PROJECTS_TEXT.back}
      </Link>
    </main>
  );
}
