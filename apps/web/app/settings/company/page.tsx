import Link from "next/link";
import { redirect } from "next/navigation";

import { CompanyProfileForm } from "../../../components/CompanyProfileForm";
import { getCurrentUser } from "../../../lib/auth/server";
import { COMPANY_PROFILE_TEXT } from "../../../lib/content";
import { getCompanyProfile } from "../../../lib/db/companyProfiles";

/** 会社設定。proxy.ts がログインを要求する（ここでも念のため確認する）。 */
export default async function CompanySettingsPage() {
  const ownerId = await getCurrentUser();
  if (!ownerId) redirect("/login");

  const profile = await getCompanyProfile(ownerId);

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">{COMPANY_PROFILE_TEXT.heading}</h1>
      <p className="mt-2 text-gray-700">{COMPANY_PROFILE_TEXT.description}</p>

      <CompanyProfileForm profile={profile} />

      <Link
        href="/projects"
        className="tap mt-10 flex items-center justify-center rounded border-2 border-gray-500 px-5 py-3 font-bold"
      >
        {COMPANY_PROFILE_TEXT.back}
      </Link>
    </main>
  );
}
