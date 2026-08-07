import { QUOTE_DOCUMENT_TEXT } from "../../../../../lib/content";

/**
 * D6（見積もり書類）で notFound() になったときの表示。
 * 見つからない依頼・他人の依頼をここに集める（存在の有無を漏らさないため、
 * どちらも同じ文言にする）。**画面を1つ増やすものではない**ので、
 * ボタンも遷移も置かない（docs/flows.md「デモの画面の並び」）。
 */
export default function QuoteDocumentNotFound() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <p className="text-gray-700">{QUOTE_DOCUMENT_TEXT.notFound}</p>
    </main>
  );
}
