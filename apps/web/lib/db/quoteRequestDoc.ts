// 見積依頼書（①）に流し込むデータを、案件の実データから組み立てる。
// 確認画面（app/projects/[id]/document）はここだけを通す。
//
// 書類の様式そのものは lib/doc/templates/quote-request.ts が持ち、描くのは
// lib/doc/render/html.tsx が持つ。ここが担うのは**保存されている値を
// DocData の形にそろえること**だけで、印字する文字も配置も持たない
// （lib/doc/ が保存の層に依存しないよう、依存の向きをこちら側に寄せている）。

import { PHOTO_SIGNED_URL_EXPIRES_SECONDS } from "../content";
import type { DocData } from "../doc/schema";
import { LEGAL_ITEM_SLOT_LABELS } from "../quoteFlowText";
import { getOrCreateEstimate } from "./estimates";
import { listLegalItemSlots } from "./legalItemSlots";
import { listPhotosForProject } from "./photos";
import { createPhotoSignedUrl } from "./photoStorage";
import { LEGAL_ITEM_SLOT_KEYS, type Photo, type Project } from "./types";

/**
 * 明細行IDごとの写真を1枚に決める。1箇所につき写真枠は1つなので、同じ明細に
 * 複数枚ある場合は**最後に撮ったもの**を採る（撮り直しが反映される。一覧は
 * created_at の昇順で返るため、上書きしていけば最後が残る）。
 *
 * `line_id` が null の写真はどの枠にも入れない。どの工事の現況かが決まっていない
 * ものを、こちらの都合で別の行に入れると、書類の写真と工事名が食い違う。
 */
function latestPhotoByLineId(photos: readonly Photo[]): Map<string, Photo> {
  const byLineId = new Map<string, Photo>();
  for (const photo of photos) {
    if (photo.lineId === null) continue;
    byLineId.set(photo.lineId, photo);
  }
  return byLineId;
}

/** 明細行IDごとの署名付きURL。発行するのは実際に枠へ入る写真のぶんだけ。 */
async function signedUrlByLineId(
  photos: readonly Photo[],
): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    [...latestPhotoByLineId(photos)].map(async ([lineId, photo]) => {
      const url = await createPhotoSignedUrl(
        photo.storagePath,
        PHOTO_SIGNED_URL_EXPIRES_SECONDS,
      );
      return [lineId, url] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * 書類の「見積条件」に出す法定項目。**記入済みのものだけを出す。**
 * 「未定」「未入力」は本文を持たないので、出すと見出しだけの空欄が並ぶ。
 * 並び順は LEGAL_ITEM_SLOT_KEYS（法定の並び）に従う。
 */
function legalItemsOf(
  slots: Awaited<ReturnType<typeof listLegalItemSlots>>,
): { label: string; body: string }[] {
  return LEGAL_ITEM_SLOT_KEYS.flatMap((slotKey) => {
    const slot = slots[slotKey];
    if (slot.status !== "filled") return [];
    const body = (slot.value ?? "").trim();
    if (body === "") return [];
    return [{ label: LEGAL_ITEM_SLOT_LABELS[slotKey], body }];
  });
}

/**
 * 案件の見積依頼書データを組み立てる。
 * 呼び出し側で所有者確認（getProjectForOwner）を済ませた上で使う。
 */
export async function getQuoteRequestDocData(
  project: Project,
  ownerId: string,
): Promise<DocData> {
  // 互いに依存しない3つ。直列に待たない（比較表と同じ理由。docs/failures.md 2026-08-06）。
  const [estimate, photos, slots] = await Promise.all([
    getOrCreateEstimate(project.id),
    listPhotosForProject(project.id, ownerId),
    listLegalItemSlots(project.id, ownerId),
  ]);

  return {
    workName: project.workName,
    siteAddress: project.siteAddress,
    // **施主名は積まない。** この書類は下請に渡るもので、法定8項目にも含まれない
    // （docs/design.md 7章）。テンプレートに欄が無いことと二重に守る。
    customerName: "",
    // 見積回答期限は依頼を出した時点（提示日時＋法定日数）に決まる。
    // 出す前のこの画面では、まだどこにも存在しない値なので持たせない。
    responseDueAt: null,
    issuedAt: new Date(),
    lines: estimate.lines,
    // 依頼書は単価を空で出す書類なので集計欄も出さない（テンプレート側にも欄が無い）。
    totals: null,
    photoUrlByLineId: await signedUrlByLineId(photos),
    legalItems: legalItemsOf(slots),
  };
}
