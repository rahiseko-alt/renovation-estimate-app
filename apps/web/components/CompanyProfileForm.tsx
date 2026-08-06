"use client";

// 会社設定の入力フォーム（docs/design.md 7章「画面は5つ」）。
//
// 扱うのは2種類。**請負者情報**は①②の様式に印字される欄で、保存した1件を全案件が使う。
// **定型文**は法定項目の初期値で、案件を新しく作るときにその案件へ複製する
// （lib/db/projectDefaults.ts）。この違いは画面の説明文にも書く。利用者から見ると
// 「直したのに前の案件が変わらない」は不具合に見えるため、先に説明しておく。
//
// 定型文の項目は COMPANY_DEFAULT_SLOT_KEYS を回して出す。「7個」をここに書き写さない。

import { unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";

import { saveCompanyProfileAction } from "../app/settings/company/actions";
import { COMPANY_PROFILE_TEXT, LEGAL_ITEM_SLOT_LABELS } from "../lib/content";
import {
  COMPANY_DEFAULT_SLOT_KEYS,
  MAX_COMPANY_FIELD_LENGTH,
  MAX_LEGAL_ITEM_SLOT_VALUE_LENGTH,
  type CompanyDefaultSlotKey,
  type CompanyProfile,
} from "../lib/db/types";

function initialDefaults(
  profile: CompanyProfile,
): Record<CompanyDefaultSlotKey, string> {
  const draft = {} as Record<CompanyDefaultSlotKey, string>;
  for (const slotKey of COMPANY_DEFAULT_SLOT_KEYS) {
    draft[slotKey] = profile.defaultSlotValues[slotKey] ?? "";
  }
  return draft;
}

export function CompanyProfileForm({ profile }: { profile: CompanyProfile }) {
  const [contractorName, setContractorName] = useState(profile.contractorName);
  const [representativeName, setRepresentativeName] = useState(
    profile.representativeName,
  );
  const [address, setAddress] = useState(profile.address);
  const [defaults, setDefaults] = useState(() => initialDefaults(profile));
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isSaving) return;
    setMessage(null);
    setErrorMessage(null);

    startSaving(async () => {
      try {
        await saveCompanyProfileAction(
          contractorName,
          representativeName,
          address,
          defaults,
        );
        setMessage(COMPANY_PROFILE_TEXT.saved);
      } catch (error) {
        unstable_rethrow(error);
        setErrorMessage(
          error instanceof Error ? error.message : COMPANY_PROFILE_TEXT.failed,
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-bold">
            {COMPANY_PROFILE_TEXT.contractorHeading}
          </h2>
          <p className="mt-1 text-gray-700">
            {COMPANY_PROFILE_TEXT.contractorNote}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="contractor-name" className="font-bold">
            {COMPANY_PROFILE_TEXT.contractorNameLabel}
          </label>
          <input
            id="contractor-name"
            type="text"
            maxLength={MAX_COMPANY_FIELD_LENGTH}
            value={contractorName}
            onChange={(event) => setContractorName(event.target.value)}
            className="rounded border-2 border-gray-500 px-4 py-3"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="representative-name" className="font-bold">
            {COMPANY_PROFILE_TEXT.representativeNameLabel}
          </label>
          <input
            id="representative-name"
            type="text"
            maxLength={MAX_COMPANY_FIELD_LENGTH}
            value={representativeName}
            onChange={(event) => setRepresentativeName(event.target.value)}
            className="rounded border-2 border-gray-500 px-4 py-3"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="company-address" className="font-bold">
            {COMPANY_PROFILE_TEXT.addressLabel}
          </label>
          <input
            id="company-address"
            type="text"
            maxLength={MAX_COMPANY_FIELD_LENGTH}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="rounded border-2 border-gray-500 px-4 py-3"
          />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold">
          {COMPANY_PROFILE_TEXT.defaultsHeading}
        </h2>
        <p className="mt-1 text-gray-700">{COMPANY_PROFILE_TEXT.defaultsNote}</p>

        <ul className="mt-4 flex flex-col gap-5">
          {COMPANY_DEFAULT_SLOT_KEYS.map((slotKey) => (
            <li key={slotKey} className="flex flex-col gap-2">
              <label htmlFor={`default-${slotKey}`} className="font-bold">
                {LEGAL_ITEM_SLOT_LABELS[slotKey]}
              </label>
              <textarea
                id={`default-${slotKey}`}
                rows={3}
                maxLength={MAX_LEGAL_ITEM_SLOT_VALUE_LENGTH}
                value={defaults[slotKey]}
                onChange={(event) =>
                  setDefaults((prev) => ({
                    ...prev,
                    [slotKey]: event.target.value,
                  }))
                }
                className="rounded border-2 border-gray-500 px-4 py-3"
              />
            </li>
          ))}
        </ul>
      </section>

      {errorMessage ? (
        <p role="alert" className="text-red-900">
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
        className="tap rounded bg-blue-700 font-bold text-white disabled:bg-gray-500"
      >
        {isSaving ? COMPANY_PROFILE_TEXT.saving : COMPANY_PROFILE_TEXT.save}
      </button>
    </form>
  );
}
