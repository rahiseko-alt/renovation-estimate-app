"use client";

// 依頼グループの送信フォーム（docs/design.md 7章「送信ゲート」「依頼グループの単位」）。
//
// 送信ゲートが通っていなければボタンを押せない。ただし**画面での抑止は補助**で、
// 本当の門は Server Action 側にある（クライアントの検証はバイパスできる）。
// 「何が足りないか」を隠さずそのまま出す。

import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";

import { sendQuoteRequestGroupAction } from "../app/projects/[id]/send/actions";
import {
  LEGAL_ITEM_SLOT_LABELS,
  SEND_REQUEST_TEXT,
  SITE_CONDITION_LABELS,
} from "../lib/content";
import type { SubmissionGateResult } from "../lib/db/submissionGate";
import { PLANNED_PRICE_BANDS, type Subcontractor } from "../lib/db/types";

export function SendRequestForm({
  projectId,
  gate,
  subcontractors,
}: {
  projectId: string;
  gate: SubmissionGateResult;
  subcontractors: Subcontractor[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [priceBand, setPriceBand] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSending, startSending] = useTransition();

  const canSend =
    gate.ok && selectedIds.length > 0 && priceBand !== "" && !isSending;

  function toggle(id: string): void {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canSend) return;
    setErrorMessage(null);
    startSending(async () => {
      try {
        await sendQuoteRequestGroupAction(projectId, selectedIds, priceBand);
      } catch (error) {
        // redirect() は例外で制御を移す。その判定を error.message の文字列で
        // 自前に書くと、Next 側の表現が変わった時に黙って壊れる。フレームワークの
        // 内部例外は unstable_rethrow に任せ、それ以外だけを失敗として扱う。
        unstable_rethrow(error);
        setErrorMessage(
          error instanceof Error ? error.message : SEND_REQUEST_TEXT.failed,
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-8">
      <section>
        <h2 className="text-lg font-bold">{SEND_REQUEST_TEXT.gateHeading}</h2>
        {gate.ok ? (
          <p className="mt-2 font-bold text-blue-800">
            {SEND_REQUEST_TEXT.gateOk}
          </p>
        ) : (
          <div
            role="alert"
            className="mt-2 rounded border-2 border-red-700 bg-red-50 p-4 text-red-900"
          >
            <p className="font-bold">{SEND_REQUEST_TEXT.gateNgHeading}</p>
            {gate.unsetSlotKeys.length > 0 ? (
              <>
                <p className="mt-2 font-bold">
                  {SEND_REQUEST_TEXT.gateNgSlots}
                </p>
                <ul className="list-disc pl-5">
                  {gate.unsetSlotKeys.map((key) => (
                    <li key={key}>{LEGAL_ITEM_SLOT_LABELS[key]}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {gate.unsetCategories.length > 0 ? (
              <>
                <p className="mt-2 font-bold">
                  {SEND_REQUEST_TEXT.gateNgConditions}
                </p>
                <ul className="list-disc pl-5">
                  {gate.unsetCategories.map((category) => (
                    <li key={category}>{SITE_CONDITION_LABELS[category]}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {/* 足りない項目を並べるだけで終わらせず、直しに行ける導線を同じ場所に置く。 */}
            <Link
              href={`/projects/${projectId}/legal`}
              className="tap mt-4 flex items-center justify-center rounded border-2 border-red-700 px-5 py-3 font-bold text-red-900"
            >
              {SEND_REQUEST_TEXT.gateNgLink}
            </Link>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-bold">
          {SEND_REQUEST_TEXT.subcontractorsHeading}
        </h2>
        {subcontractors.length === 0 ? (
          <>
            <p className="mt-2 text-gray-700">
              {SEND_REQUEST_TEXT.subcontractorsEmpty}
            </p>
            <Link
              href="/subcontractors"
              className="tap mt-3 flex items-center justify-center rounded border-2 border-blue-800 px-5 py-3 font-bold text-blue-800"
            >
              {SEND_REQUEST_TEXT.subcontractorsLink}
            </Link>
          </>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {subcontractors.map((subcontractor) => (
              <li key={subcontractor.id}>
                <label className="tap flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(subcontractor.id)}
                    onChange={() => toggle(subcontractor.id)}
                    className="size-6"
                  />
                  {subcontractor.companyName}
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-bold">
          {SEND_REQUEST_TEXT.priceBandHeading}
        </h2>
        <ul className="mt-2 flex flex-col gap-2">
          {PLANNED_PRICE_BANDS.map((band) => (
            <li key={band}>
              <label className="tap flex items-center gap-3">
                <input
                  type="radio"
                  name="planned-price-band"
                  value={band}
                  checked={priceBand === band}
                  onChange={() => setPriceBand(band)}
                  className="size-6"
                />
                {SEND_REQUEST_TEXT.priceBandLabels[band]}
              </label>
            </li>
          ))}
        </ul>
        {priceBand === "" ? (
          <p className="mt-2 text-gray-700">
            {SEND_REQUEST_TEXT.priceBandRequired}
          </p>
        ) : null}
      </section>

      {errorMessage ? (
        <p role="alert" className="text-red-900">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!canSend}
        className="tap rounded bg-blue-700 font-bold text-white disabled:bg-gray-500"
      >
        {isSending ? SEND_REQUEST_TEXT.sending : SEND_REQUEST_TEXT.send}
      </button>
    </form>
  );
}
