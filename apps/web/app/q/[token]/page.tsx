import { QuoteGroupResponseForm } from "../../../components/QuoteGroupResponseForm";
import { QuoteResponseForm } from "../../../components/QuoteResponseForm";
import {
  QUOTE_GROUP_RESPONSE_TEXT,
  QUOTE_RESPONSE_TEXT,
} from "../../../lib/content";
import { formatDateJst } from "../../../lib/doc/date";
import {
  getQuoteGroupRequestForSubcontractor,
  listQuoteLinesForSubcontractor,
} from "../../../lib/db/quoteRequestGroups";
import { getQuoteRequestByToken } from "../../../lib/db/quoteRequests";

/**
 * 下請の回答画面。ログイン不要（proxy.ts の PROTECTED_PREFIXES に /q は含めていない）。
 * token だけが資格情報。
 *
 * 出すのは法定①工事名称・法定②施工場所・見積回答期限と、依頼した明細だけ。
 * **施主名・売価・掛率・原価・他社の単価は出さない**（docs/design.md 7章
 * 「下請に見せるもの・見せないもの」）。これは「気を付ける」ではなく、
 * lib/db 側の投影型が最初からそれらを持たないことで守っている。
 *
 * token は2つのモデルのどちらにも属しうる。新しい依頼グループを先に引き、
 * 見つからなければ旧 quote_requests を引く（見積エディタの「下請に単価を頼む」が
 * まだ旧モデルでリンクを発行している。両方の入口が消えるまでは両方を開ける）。
 */
export default async function QuoteResponsePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const groupRequest = await getQuoteGroupRequestForSubcontractor(token);

  if (groupRequest) {
    const lines = await listQuoteLinesForSubcontractor(token);
    return (
      <main className="mx-auto w-full max-w-md px-5 py-8">
        <h1 className="text-2xl font-bold">
          {QUOTE_GROUP_RESPONSE_TEXT.heading}
        </h1>

        <dl className="mt-6 rounded border-2 border-gray-400 p-4">
          <div className="py-1">
            <dt className="font-bold">
              {QUOTE_GROUP_RESPONSE_TEXT.workNameLabel}
            </dt>
            <dd>{groupRequest.workName}</dd>
          </div>
          <div className="py-1">
            <dt className="font-bold">
              {QUOTE_GROUP_RESPONSE_TEXT.siteAddressLabel}
            </dt>
            <dd>{groupRequest.siteAddress}</dd>
          </div>
          <div className="py-1">
            <dt className="font-bold">
              {QUOTE_GROUP_RESPONSE_TEXT.dueAtLabel}
            </dt>
            <dd>{formatDateJst(new Date(groupRequest.responseDueAt))}</dd>
          </div>
        </dl>

        {groupRequest.status !== "pending" ? (
          <p role="status" className="mt-6 text-gray-700">
            {QUOTE_GROUP_RESPONSE_TEXT.alreadyResponded}
          </p>
        ) : (
          <>
            <p className="mt-4 text-gray-700">
              {QUOTE_GROUP_RESPONSE_TEXT.description}
            </p>
            <QuoteGroupResponseForm token={token} lines={lines} />
          </>
        )}
      </main>
    );
  }

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
