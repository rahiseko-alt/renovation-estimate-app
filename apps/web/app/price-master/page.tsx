import Link from "next/link";
import { redirect } from "next/navigation";

import { formatYen } from "../../lib/calc";
import { PRICE_MASTER_TEXT, TAX_CATEGORY_LABELS } from "../../lib/content";
import { getCurrentUser } from "../../lib/auth/server";
import { listPriceMasterForOwner } from "../../lib/db/priceMaster";
import { deletePriceMasterItemAction } from "./actions";

/** 単価マスタの一覧。proxy.ts がログインを要求する。 */
export default async function PriceMasterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const items = await listPriceMasterForOwner(user);

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">{PRICE_MASTER_TEXT.heading}</h1>

      {items.length === 0 ? (
        <p className="mt-4 text-gray-700">{PRICE_MASTER_TEXT.empty}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-2 rounded border-2 border-gray-400 p-4"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-lg font-bold">{item.name}</span>
                <span className="tabular font-bold">
                  {formatYen(item.unitPrice)}円 / {item.unit}
                </span>
              </div>
              {item.spec ? (
                <span className="text-gray-700">{item.spec}</span>
              ) : null}
              <span className="text-sm text-gray-700">
                {TAX_CATEGORY_LABELS[item.taxCategory]}
              </span>
              <form action={deletePriceMasterItemAction}>
                <input type="hidden" name="id" value={item.id} />
                <button
                  type="submit"
                  className="tap self-start rounded border-2 border-red-700 px-4 py-2 font-bold text-red-900"
                >
                  {PRICE_MASTER_TEXT.delete}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

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
