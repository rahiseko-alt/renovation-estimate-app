import { FAILED_LIMIT, NEW_PROJECT_TEXT } from "../../../lib/content";
import { createProjectAction } from "./actions";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ failed?: string }>;
}) {
  const { failed } = await searchParams;
  const errorId = "new-project-error";

  // 断られた理由を文言に直す。既存の failed=1（入力内容の不備）はそのまま。
  const errorMessage =
    failed === FAILED_LIMIT ? NEW_PROJECT_TEXT.failedLimit : NEW_PROJECT_TEXT.failed;

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">{NEW_PROJECT_TEXT.heading}</h1>

      {failed ? (
        <p
          id={errorId}
          role="alert"
          className="mt-4 rounded border-2 border-red-700 bg-red-50 px-4 py-3 text-red-900"
        >
          {errorMessage}
        </p>
      ) : null}

      {/* 1カラム・ラベルは入力欄の上（NN/g：最速・最少エラー） */}
      <form
        action={createProjectAction}
        className="mt-6 flex flex-col gap-6"
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="customerName" className="font-bold">
            {NEW_PROJECT_TEXT.customerNameLabel}
          </label>
          <input
            id="customerName"
            name="customerName"
            type="text"
            required
            aria-describedby={failed ? errorId : undefined}
            className="rounded border-2 border-gray-500 px-4 py-3"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="siteAddress" className="font-bold">
            {NEW_PROJECT_TEXT.siteAddressLabel}
          </label>
          <input
            id="siteAddress"
            name="siteAddress"
            type="text"
            required
            aria-describedby={failed ? errorId : undefined}
            className="rounded border-2 border-gray-500 px-4 py-3"
          />
        </div>

        <button
          type="submit"
          className="rounded bg-blue-800 px-6 py-4 text-lg font-bold text-white"
        >
          {NEW_PROJECT_TEXT.submit}
        </button>
      </form>
    </main>
  );
}
