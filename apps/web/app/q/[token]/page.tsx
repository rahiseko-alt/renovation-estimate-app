import { QuoteResponseForm } from "../../../components/QuoteResponseForm";
import { QUOTE_RESPONSE_TEXT } from "../../../lib/content";
import { getQuoteRequestByToken } from "../../../lib/db/quoteRequests";

/**
 * 下請の回答画面。ログイン不要（proxy.ts の PROTECTED_PREFIXES に /q は含めていない）。
 * token だけを資格情報として使うため、案件名・施主名・現場住所など見積側の他の情報は
 * 一切渡さない（この画面が見せるのは、依頼した明細1件のスナップショットだけ）。
 */
export default async function QuoteResponsePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const quoteRequest = await getQuoteRequestByToken(token);

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">{QUOTE_RESPONSE_TEXT.heading}</h1>

      {!quoteRequest ? (
        <p className="mt-6 text-gray-700">{QUOTE_RESPONSE_TEXT.notFound}</p>
      ) : quoteRequest.status !== "pending" ? (
        <p role="status" className="mt-6 text-gray-700">
          {QUOTE_RESPONSE_TEXT.alreadyResponded}
        </p>
      ) : (
        <>
          <p className="mt-2 text-gray-700">{QUOTE_RESPONSE_TEXT.description}</p>

          <dl className="mt-6 rounded border-2 border-gray-400 p-4">
            <div className="flex justify-between py-1">
              <dt className="font-bold">{QUOTE_RESPONSE_TEXT.itemLabel}</dt>
              <dd>{quoteRequest.itemName}</dd>
            </div>
            {quoteRequest.itemSpec ? (
              <div className="flex justify-between py-1">
                <dt className="font-bold">{QUOTE_RESPONSE_TEXT.specLabel}</dt>
                <dd>{quoteRequest.itemSpec}</dd>
              </div>
            ) : null}
            <div className="flex justify-between py-1">
              <dt className="font-bold">{QUOTE_RESPONSE_TEXT.quantityLabel}</dt>
              <dd className="tabular">{quoteRequest.quantity}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="font-bold">{QUOTE_RESPONSE_TEXT.unitLabel}</dt>
              <dd>{quoteRequest.unit}</dd>
            </div>
          </dl>

          <QuoteResponseForm token={token} />
        </>
      )}
    </main>
  );
}
