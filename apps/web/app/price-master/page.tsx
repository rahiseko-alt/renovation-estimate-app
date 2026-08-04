import Link from "next/link";
import { redirect } from "next/navigation";

import { PriceMasterList } from "../../components/PriceMasterList";
import { getCurrentUser } from "../../lib/auth/server";
import { PRICE_MASTER_TEXT } from "../../lib/content";
import { listPriceMasterForOwner } from "../../lib/db/priceMaster";

/** 単価マスタの一覧。proxy.ts がログインを要求する。 */
export default async function PriceMasterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const items = await listPriceMasterForOwner(user);

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">{PRICE_MASTER_TEXT.heading}</h1>

      <PriceMasterList items={items} />

      <Link
        href="/price-master/new"
        className="tap mt-8 flex items-center justify-center rounded bg-blue-800 px-6 py-4 text-lg font-bold text-white"
      >
        {PRICE_MASTER_TEXT.newItem}
      </Link>

      <Link
        href="/projects"
        className="tap mt-4 flex items-center justify-center rounded border-2 border-gray-500 px-5 py-3 font-bold"
      >
        {PRICE_MASTER_TEXT.back}
      </Link>
    </main>
  );
}
