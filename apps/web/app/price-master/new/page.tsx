import { NewPriceMasterItemForm } from "../../../components/NewPriceMasterItemForm";
import { PRICE_MASTER_TEXT } from "../../../lib/content";

export default async function NewPriceMasterItemPage({
  searchParams,
}: {
  searchParams: Promise<{ failed?: string }>;
}) {
  const { failed } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">{PRICE_MASTER_TEXT.newItem}</h1>
      <NewPriceMasterItemForm failed={Boolean(failed)} />
    </main>
  );
}
