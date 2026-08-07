import { notFound } from "next/navigation";

import {
  DocumentConfirmScreen,
  type ResponseDueField,
} from "../../../../components/DocumentConfirmScreen";
import { DemoRestartButton } from "../../../../components/DemoRestartButton";
import { isDemoOwner } from "../../../../lib/auth/demoOwner";
import { getCurrentUser } from "../../../../lib/auth/server";
import {
  DOCUMENT_CONFIRM_TEXT,
  DOCUMENT_PLANNED_PRICE_BAND,
  RESPONSE_DUE_DEFAULT_DAYS,
} from "../../../../lib/content";
import { getProjectForOwner } from "../../../../lib/db/projects";
import { getQuoteRequestDocData } from "../../../../lib/db/quoteRequestDoc";
import { formatDateJst } from "../../../../lib/doc/date";
import {
  computeResponseDueAt,
  earliestResponseDueDateInput,
  jstDateInputAfterDays,
  responseDueAtFromDateInput,
} from "../../../../lib/legalPeriod";

/**
 * 見積回答期限の欄が要る値を、**1つの「いま」から**まとめて作る。
 * 初期値と下限を別々の時刻から作ると、日付が変わる瞬間に食い違う。
 */
function responseDueField(now: Date): ResponseDueField {
  return {
    defaultValue: jstDateInputAfterDays(now, RESPONSE_DUE_DEFAULT_DAYS),
    earliestValue: earliestResponseDueDateInput(now, DOCUMENT_PLANNED_PRICE_BAND),
    earliestText: formatDateJst(
      computeResponseDueAt(now, DOCUMENT_PLANNED_PRICE_BAND),
    ),
  };
}

/**
 * D4 確認画面（docs/flows.md「デモの画面の並び」）。
 * 案件の実データで見積依頼書を描き、見積回答期限の欄1つと
 * 保存 / 送信 / 修正 の3つだけを出す。
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

  const responseDue = responseDueField(new Date());
  const data = await getQuoteRequestDocData(
    project,
    ownerId,
    // 最初に描く書類にも、欄の初期値と**同じ日**を入れる（ラベルだけの空欄で出さない）。
    responseDueAtFromDateInput(responseDue.defaultValue),
  );
  // この画面は通常経路でも開く（D4 はデモの表の一部だが、URLは /projects 配下）。
  // やり直しはデモの利用者にだけ出す。
  const demo = isDemoOwner(ownerId);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <h1 className="doc-screen-only text-2xl font-bold">
        {DOCUMENT_CONFIRM_TEXT.heading}
      </h1>
      <p className="doc-screen-only mt-2 text-gray-700">
        {DOCUMENT_CONFIRM_TEXT.description}
      </p>

      {/*
        「修正」の戻り先は写真のある画面（D3）。**デモと通常で行き先が違う。**
        /demo/<id>/photo は isDemoOwner を要求する（app/demo/[projectId]/photo/page.tsx）ので、
        通常の案件でそこへ戻すと404になる。通常の案件は写真の欄を持つ案件詳細へ戻す。
      */}
      <DocumentConfirmScreen
        data={data}
        projectId={id}
        editHref={demo ? `/demo/${id}/photo` : `/projects/${id}`}
        saveHref="/drafts"
        responseDue={responseDue}
      />

      {/* 紙には出さない（画面のボタンは doc-screen-only。globals.css の @media print）。 */}
      {demo ? (
        <div className="doc-screen-only">
          <DemoRestartButton />
        </div>
      ) : null}
    </main>
  );
}
