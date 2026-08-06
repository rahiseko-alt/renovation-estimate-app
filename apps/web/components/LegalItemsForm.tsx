"use client";

// 法定項目（④⑤⑥⑧の9スロット）と施工条件・範囲リスト（⑦の12区分）の入力フォーム。
// ここが埋まらないと送信ゲートが開かず、依頼を出せない。
//
// 1スロットは3状態を持つ（記入する／未定／未入力）。「未定」は利用者が明示的に
// 選んだときだけ書類に印字し、「未入力」＝まだ何も選んでいない状態とは区別する
// （docs/design.md 7章）。ラジオボタンで3つを並べ、どれを選んだかが常に見えるようにする。
//
// 項目の数は lib/db/types.ts の配列から回す。「9個」「12個」をここに書き写さない。

import { unstable_rethrow, useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveLegalItemsAction } from "../app/projects/[id]/legal/actions";
import {
  LEGAL_ITEM_SLOT_LABELS,
  LEGAL_ITEMS_TEXT,
  SITE_CONDITION_LABELS,
} from "../lib/content";
import type { LegalItemSlotInput } from "../lib/db/legalItemSlots";
import type { SiteConditionCheckInput } from "../lib/db/siteConditionChecks";
import {
  LEGAL_ITEM_SLOT_KEYS,
  LEGAL_ITEM_SLOT_STATUSES,
  MAX_LEGAL_ITEM_SLOT_VALUE_LENGTH,
  SITE_CONDITION_CATEGORIES,
  SITE_CONDITION_MARKS,
  type LegalItemSlot,
  type LegalItemSlotKey,
  type LegalItemSlotStatus,
  type SiteConditionCategory,
  type SiteConditionCheck,
  type SiteConditionMark,
} from "../lib/db/types";

type SlotDraft = { status: LegalItemSlotStatus; value: string };

function initialSlots(
  slots: Record<LegalItemSlotKey, LegalItemSlot>,
): Record<LegalItemSlotKey, SlotDraft> {
  const draft = {} as Record<LegalItemSlotKey, SlotDraft>;
  for (const key of LEGAL_ITEM_SLOT_KEYS) {
    draft[key] = { status: slots[key].status, value: slots[key].value ?? "" };
  }
  return draft;
}

function initialMarks(
  checks: Record<SiteConditionCategory, SiteConditionCheck>,
): Record<SiteConditionCategory, SiteConditionMark> {
  const draft = {} as Record<SiteConditionCategory, SiteConditionMark>;
  for (const category of SITE_CONDITION_CATEGORIES) {
    draft[category] = checks[category].mark;
  }
  return draft;
}

export function LegalItemsForm({
  projectId,
  slots,
  checks,
}: {
  projectId: string;
  slots: Record<LegalItemSlotKey, LegalItemSlot>;
  checks: Record<SiteConditionCategory, SiteConditionCheck>;
}) {
  const router = useRouter();
  const [slotDrafts, setSlotDrafts] = useState(() => initialSlots(slots));
  const [markDrafts, setMarkDrafts] = useState(() => initialMarks(checks));
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function updateSlot(key: LegalItemSlotKey, patch: Partial<SlotDraft>): void {
    setSlotDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isSaving) return;
    setMessage(null);
    setErrorMessage(null);

    // 「記入する」を選んだのに本文が空、を保存前に止める。
    // 同じ検証は lib/db/legalItemSlots.ts にもある（画面の抑止は補助）。
    const hasEmptyFilled = LEGAL_ITEM_SLOT_KEYS.some(
      (key) =>
        slotDrafts[key].status === "filled" &&
        slotDrafts[key].value.trim() === "",
    );
    if (hasEmptyFilled) {
      setErrorMessage(LEGAL_ITEMS_TEXT.needValue);
      return;
    }

    const slotInputs: LegalItemSlotInput[] = LEGAL_ITEM_SLOT_KEYS.map((key) => ({
      slotKey: key,
      status: slotDrafts[key].status,
      value: slotDrafts[key].value,
    }));
    const checkInputs: SiteConditionCheckInput[] = SITE_CONDITION_CATEGORIES.map(
      (category) => ({ category, mark: markDrafts[category] }),
    );

    startSaving(async () => {
      try {
        await saveLegalItemsAction(projectId, slotInputs, checkInputs);
        setMessage(LEGAL_ITEMS_TEXT.saved);
        // 送信ゲートの残り件数は案件側の画面が持つ。保存後に読み直す。
        router.refresh();
      } catch (error) {
        unstable_rethrow(error);
        setErrorMessage(
          error instanceof Error ? error.message : LEGAL_ITEMS_TEXT.failed,
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-10">
      <section>
        <h2 className="text-lg font-bold">{LEGAL_ITEMS_TEXT.slotsHeading}</h2>
        <p className="mt-1 text-gray-700">{LEGAL_ITEMS_TEXT.slotsNote}</p>

        <ul className="mt-4 flex flex-col gap-6">
          {LEGAL_ITEM_SLOT_KEYS.map((key) => (
            <li key={key}>
              <fieldset className="rounded border-2 border-gray-400 px-4 py-3">
                <legend className="px-1 font-bold">
                  {LEGAL_ITEM_SLOT_LABELS[key]}
                </legend>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {LEGAL_ITEM_SLOT_STATUSES.map((status) => (
                    <label key={status} className="tap flex items-center gap-2">
                      <input
                        type="radio"
                        name={`slot-${key}`}
                        value={status}
                        checked={slotDrafts[key].status === status}
                        onChange={() => updateSlot(key, { status })}
                        className="size-6"
                      />
                      {LEGAL_ITEMS_TEXT.statusLabels[status]}
                    </label>
                  ))}
                </div>

                {slotDrafts[key].status === "filled" ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <label htmlFor={`slot-value-${key}`} className="font-bold">
                      {LEGAL_ITEMS_TEXT.valueLabel}
                    </label>
                    <textarea
                      id={`slot-value-${key}`}
                      rows={3}
                      // 上限は lib/db/types.ts が唯一の正。入力の時点で
                      // 止めないと、9スロット書き終えた保存でまとめて弾かれる。
                      maxLength={MAX_LEGAL_ITEM_SLOT_VALUE_LENGTH}
                      value={slotDrafts[key].value}
                      onChange={(event) =>
                        updateSlot(key, { value: event.target.value })
                      }
                      className="rounded border-2 border-gray-500 px-4 py-3"
                    />
                  </div>
                ) : null}
              </fieldset>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold">
          {LEGAL_ITEMS_TEXT.conditionsHeading}
        </h2>
        <p className="mt-1 text-gray-700">{LEGAL_ITEMS_TEXT.conditionsNote}</p>

        <ul className="mt-4 flex flex-col gap-4">
          {SITE_CONDITION_CATEGORIES.map((category) => (
            <li key={category}>
              <fieldset className="rounded border-2 border-gray-400 px-4 py-3">
                <legend className="px-1 font-bold">
                  {SITE_CONDITION_LABELS[category]}
                </legend>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {SITE_CONDITION_MARKS.map((mark) => (
                    <label key={mark} className="tap flex items-center gap-2">
                      <input
                        type="radio"
                        name={`condition-${category}`}
                        value={mark}
                        checked={markDrafts[category] === mark}
                        onChange={() =>
                          setMarkDrafts((prev) => ({
                            ...prev,
                            [category]: mark,
                          }))
                        }
                        className="size-6"
                      />
                      {LEGAL_ITEMS_TEXT.markLabels[mark]}
                    </label>
                  ))}
                </div>
              </fieldset>
            </li>
          ))}
        </ul>
      </section>

      {errorMessage ? (
        <p
          role="alert"
          className="rounded border-2 border-red-700 bg-red-50 px-4 py-3 text-red-900"
        >
          {errorMessage}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="font-bold text-blue-800">
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSaving}
        className="tap rounded bg-blue-800 px-6 py-4 text-lg font-bold text-white disabled:bg-gray-500"
      >
        {isSaving ? LEGAL_ITEMS_TEXT.saving : LEGAL_ITEMS_TEXT.save}
      </button>
    </form>
  );
}
