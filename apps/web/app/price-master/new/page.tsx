import type { TaxCategory } from "../../../lib/calc";
import { PRICE_MASTER_TEXT, TAX_CATEGORY_LABELS, UNITS } from "../../../lib/content";
import { createPriceMasterItemAction } from "./actions";

const TAX_CATEGORIES = Object.keys(TAX_CATEGORY_LABELS) as TaxCategory[];

export default async function NewPriceMasterItemPage({
  searchParams,
}: {
  searchParams: Promise<{ failed?: string }>;
}) {
  const { failed } = await searchParams;
  const errorId = "new-price-master-error";

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">{PRICE_MASTER_TEXT.newItem}</h1>

      {failed ? (
        <p
          id={errorId}
          role="alert"
          className="mt-4 rounded border-2 border-red-700 bg-red-50 px-4 py-3 text-red-900"
        >
          {PRICE_MASTER_TEXT.failed}
        </p>
      ) : null}

      <form
        action={createPriceMasterItemAction}
        className="mt-6 flex flex-col gap-6"
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="name" className="font-bold">
            {PRICE_MASTER_TEXT.nameLabel}
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            aria-describedby={failed ? errorId : undefined}
            className="rounded border-2 border-gray-500 px-4 py-3"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="spec" className="font-bold">
            {PRICE_MASTER_TEXT.specLabel}
          </label>
          <input
            id="spec"
            name="spec"
            type="text"
            className="rounded border-2 border-gray-500 px-4 py-3"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="unit" className="font-bold">
            {PRICE_MASTER_TEXT.unitLabel}
          </label>
          <select
            id="unit"
            name="unit"
            className="rounded border-2 border-gray-500 px-2 py-3"
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="unitPrice" className="font-bold">
            {PRICE_MASTER_TEXT.unitPriceLabel}
          </label>
          <input
            id="unitPrice"
            name="unitPrice"
            type="text"
            inputMode="numeric"
            required
            aria-describedby={failed ? errorId : undefined}
            className="tabular rounded border-2 border-gray-500 px-4 py-3"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="taxCategory" className="font-bold">
            {PRICE_MASTER_TEXT.taxCategoryLabel}
          </label>
          <select
            id="taxCategory"
            name="taxCategory"
            className="rounded border-2 border-gray-500 px-2 py-3"
          >
            {TAX_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {TAX_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="rounded bg-blue-800 px-6 py-4 text-lg font-bold text-white"
        >
          {PRICE_MASTER_TEXT.submit}
        </button>
      </form>
    </main>
  );
}
