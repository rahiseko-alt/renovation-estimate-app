import Link from "next/link";
import { notFound } from "next/navigation";

import { getProject } from "../../../lib/db/projects";
import { PROJECT_DETAIL_TEXT, PROJECTS_TEXT } from "../../../lib/content";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">{project.customerName}</h1>
      <p className="mt-2 text-gray-700">{project.siteAddress}</p>

      <Link
        href={`/projects/${project.id}/estimate`}
        className="tap mt-8 flex items-center justify-center rounded bg-blue-800 px-6 py-4 text-lg font-bold text-white"
      >
        {PROJECT_DETAIL_TEXT.estimateLink}
      </Link>

      <Link
        href="/projects"
        className="tap mt-4 flex items-center justify-center rounded border-2 border-gray-500 px-5 py-3 font-bold"
      >
        {PROJECTS_TEXT.back}
      </Link>
    </main>
  );
}
