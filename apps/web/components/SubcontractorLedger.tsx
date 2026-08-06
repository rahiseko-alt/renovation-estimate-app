import {
  createSubcontractorAction,
  deleteSubcontractorAction,
} from "../app/subcontractors/actions";
import { SUBCONTRACTORS_TEXT } from "../lib/content";
import type { Subcontractor } from "../lib/db/types";

type Props = {
  subcontractors: Subcontractor[];
  failed: boolean;
};

/**
 * 下請台帳の一覧と登録フォーム（docs/design.md 7章「画面は5つ」）。
 * 項目は社名とメールの2つしかないので、一覧と登録を別画面に割らず1画面に置く。
 */
export function SubcontractorLedger({ subcontractors, failed }: Props) {
  const errorId = "new-subcontractor-error";

  return (
    <>
      {subcontractors.length === 0 ? (
        <p className="mt-4 text-gray-700">{SUBCONTRACTORS_TEXT.empty}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {subcontractors.map((subcontractor) => (
            <li
              key={subcontractor.id}
              className="flex items-center justify-between gap-3 rounded border-2 border-gray-400 px-5 py-3"
            >
              <span className="flex flex-col">
                <span className="text-lg font-bold">
                  {subcontractor.companyName}
                </span>
                <span className="mt-1 break-all text-gray-700">
                  {subcontractor.email}
                </span>
              </span>
              <form action={deleteSubcontractorAction}>
                <input type="hidden" name="id" value={subcontractor.id} />
                <button
                  type="submit"
                  className="tap shrink-0 rounded border-2 border-gray-500 px-4 py-2 font-bold"
                >
                  {SUBCONTRACTORS_TEXT.delete}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 text-lg font-bold">
        {SUBCONTRACTORS_TEXT.newHeading}
      </h2>

      {failed ? (
        <p
          id={errorId}
          role="alert"
          className="mt-4 rounded border-2 border-red-700 bg-red-50 px-4 py-3 text-red-900"
        >
          {SUBCONTRACTORS_TEXT.failed}
        </p>
      ) : null}

      <form
        action={createSubcontractorAction}
        className="mt-4 flex flex-col gap-6"
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="companyName" className="font-bold">
            {SUBCONTRACTORS_TEXT.companyNameLabel}
          </label>
          <input
            id="companyName"
            name="companyName"
            type="text"
            required
            aria-describedby={failed ? errorId : undefined}
            className="rounded border-2 border-gray-500 px-4 py-3"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="font-bold">
            {SUBCONTRACTORS_TEXT.emailLabel}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            aria-describedby={failed ? errorId : undefined}
            className="rounded border-2 border-gray-500 px-4 py-3"
          />
        </div>

        <button
          type="submit"
          className="tap rounded bg-blue-800 px-6 py-4 text-lg font-bold text-white"
        >
          {SUBCONTRACTORS_TEXT.submit}
        </button>
      </form>
    </>
  );
}
