import Link from "next/link";
import { redirect } from "next/navigation";

import { SubcontractorLedger } from "../../components/SubcontractorLedger";
import { getCurrentUser } from "../../lib/auth/server";
import { SUBCONTRACTORS_TEXT } from "../../lib/content";
import { listSubcontractorsForOwner } from "../../lib/db/subcontractors";

/** 下請台帳。proxy.ts がログインを要求する（ここでも念のため確認する）。 */
export default async function SubcontractorsPage({
  searchParams,
}: {
  searchParams: Promise<{ failed?: string }>;
}) {
  const ownerId = await getCurrentUser();
  if (!ownerId) redirect("/login");

  const [{ failed }, subcontractors] = await Promise.all([
    searchParams,
    listSubcontractorsForOwner(ownerId),
  ]);

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">{SUBCONTRACTORS_TEXT.heading}</h1>
      <p className="mt-2 text-gray-700">{SUBCONTRACTORS_TEXT.description}</p>

      <SubcontractorLedger
        subcontractors={subcontractors}
        failed={Boolean(failed)}
      />

      <Link
        href="/projects"
        className="tap mt-10 flex items-center justify-center rounded border-2 border-gray-500 px-5 py-3 font-bold"
      >
        {SUBCONTRACTORS_TEXT.back}
      </Link>
    </main>
  );
}
