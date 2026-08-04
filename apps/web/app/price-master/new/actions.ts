"use server";

import { redirect } from "next/navigation";

import type { TaxCategory } from "../../../lib/calc";
import { getCurrentUser } from "../../../lib/auth/server";
import { TAX_RATES } from "../../../lib/content";
import { createPriceMasterItem } from "../../../lib/db/priceMaster";

export async function createPriceMasterItemAction(
  formData: FormData,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const name = String(formData.get("name") ?? "").trim();
  const spec = String(formData.get("spec") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim();
  const unitPriceRaw = String(formData.get("unitPrice") ?? "").trim();
  const taxCategoryRaw = String(formData.get("taxCategory") ?? "");
  const unitPrice = Number(unitPriceRaw);

  // 単価は円単位の整数のみ許す（lib/calc.ts の assertIntegerAmount と同じ前提）。
  const valid =
    name !== "" &&
    unit !== "" &&
    unitPriceRaw !== "" &&
    Number.isFinite(unitPrice) &&
    Number.isInteger(unitPrice) &&
    taxCategoryRaw in TAX_RATES;

  if (!valid) {
    redirect("/price-master/new?failed=1");
  }

  await createPriceMasterItem(
    {
      name,
      spec,
      unit,
      unitPrice,
      taxCategory: taxCategoryRaw as TaxCategory,
    },
    user,
  );
  redirect("/price-master");
}
