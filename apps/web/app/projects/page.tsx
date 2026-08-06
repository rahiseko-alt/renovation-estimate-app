import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "../../lib/auth/server";
import { listProjectsForOwner } from "../../lib/db/projects";
import {
  COMPANY_PROFILE_TEXT,
  PRICE_MASTER_TEXT,
  PROJECTS_TEXT,
  SUBCONTRACTORS_TEXT,
} from "../../lib/content";

/** 案件一覧。proxy.ts がログインを要求する。 */
export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const projects = await listProjectsForOwner(user);

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">{PROJECTS_TEXT.heading}</h1>

      {projects.length === 0 ? (
        <p className="mt-4 text-gray-700">{PROJECTS_TEXT.empty}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="tap flex flex-col justify-center rounded border-2 border-gray-400 px-5 py-3"
              >
                <span className="text-lg font-bold">
                  {project.customerName}
                </span>
                <span className="mt-1 text-gray-700">
                  {project.siteAddress}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/projects/new"
        className="tap mt-8 flex items-center justify-center rounded bg-blue-800 px-6 py-4 text-lg font-bold text-white"
      >
        {PROJECTS_TEXT.newProject}
      </Link>

      <Link
        href="/subcontractors"
        className="tap mt-4 flex items-center justify-center rounded border-2 border-gray-500 px-5 py-3 font-bold"
      >
        {SUBCONTRACTORS_TEXT.heading}
      </Link>

      <Link
        href="/settings/company"
        className="tap mt-4 flex items-center justify-center rounded border-2 border-gray-500 px-5 py-3 font-bold"
      >
        {COMPANY_PROFILE_TEXT.heading}
      </Link>

      <Link
        href="/price-master"
        className="tap mt-4 flex items-center justify-center rounded border-2 border-gray-500 px-5 py-3 font-bold"
      >
        {PRICE_MASTER_TEXT.heading}
      </Link>

      <Link
        href="/"
        className="tap mt-4 flex items-center justify-center rounded border-2 border-gray-500 px-5 py-3 font-bold"
      >
        {PROJECTS_TEXT.back}
      </Link>
    </main>
  );
}
