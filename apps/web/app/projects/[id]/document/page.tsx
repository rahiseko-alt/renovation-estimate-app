import { notFound } from "next/navigation";

import { DocumentCanvas } from "../../../../components/DocumentCanvas";
import { DocumentConfirmActions } from "../../../../components/DocumentConfirmActions";
import { getCurrentUser } from "../../../../lib/auth/server";
import { DOCUMENT_CONFIRM_TEXT } from "../../../../lib/content";
import { getProjectForOwner } from "../../../../lib/db/projects";
import { getQuoteRequestDocData } from "../../../../lib/db/quoteRequestDoc";
import { DocumentView } from "../../../../lib/doc/render/html";
import { QUOTE_REQUEST_TEMPLATE } from "../../../../lib/doc/templates/quote-request";

/**
 * D3 確認画面（docs/flows.md「デモの画面の並び」）。
 * 案件の実データで見積依頼書を描き、保存 / 送信 / 修正 の3つだけを出す。
 *
 * app/projects/spike-document/page.tsx は同じ組み立ての**固定サンプル**版で、
 * こちらが実データ版。proxy.ts が /projects 配下にログインを要求し、
 * 所有者確認はここでも行う（デモの利用者もログイン済みの利用者も同じ道を通る）。
 */
export default async function DocumentConfirmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ownerId = await getCurrentUser();
  if (!ownerId) notFound();

  const project = await getProjectForOwner(id, ownerId);
  if (!project) notFound();

  const data = await getQuoteRequestDocData(project, ownerId);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <h1 className="doc-screen-only text-2xl font-bold">
        {DOCUMENT_CONFIRM_TEXT.heading}
      </h1>
      <p className="doc-screen-only mt-2 text-gray-700">
        {DOCUMENT_CONFIRM_TEXT.description}
      </p>

      {/* 書類は読み取り専用の縮小ビュー（components/DocumentCanvas.tsx の冒頭）。 */}
      <div className="mt-4">
        <DocumentCanvas pageWidthPx={QUOTE_REQUEST_TEMPLATE.pageWidthPx}>
          <DocumentView
            template={QUOTE_REQUEST_TEMPLATE}
            data={data}
            audience="subcontractor"
          />
        </DocumentCanvas>
      </div>

      <DocumentConfirmActions
        projectId={id}
        editHref={`/demo/${id}/photo`}
        saveHref="/drafts"
      />
    </main>
  );
}
