// 予定価格帯から見積回答期限を計算する。
// 建設業法施行令第6条が定める見積期間（docs/design.md 3章の表）の最短日数を、
// 依頼グループの提示日時に加える。
//
// 日本にはDST（夏時間）が無いため、暦日の加算は「1日＝86,400,000ミリ秒」で
// タイムゾーンに関係なく正しい。ここでの計算に時刻源の不一致による問題は無い
// （docs/design.md 7章が注意しているのは、日付を人に見せるときの整形＝表示側の話で、
// このファイルが扱う期間の加算そのものではない）。

import type { PlannedPriceBand } from "./db/types";

const DAY_MILLIS = 24 * 60 * 60 * 1000;

/** 建設業法施行令第6条・docs/design.md 3章の表（最短日数）。値の置き場所はここに一本化する。 */
const MINIMUM_QUOTE_PERIOD_DAYS: Record<PlannedPriceBand, number> = {
  under_500man: 1,
  between_500man_and_5000man: 10,
  over_5000man: 15,
};

export function minimumQuotePeriodDays(band: PlannedPriceBand): number {
  return MINIMUM_QUOTE_PERIOD_DAYS[band];
}

/** 提示日時（presentedAt）に、予定価格帯の最短見積期間を加えた回答期限を返す。 */
export function computeResponseDueAt(
  presentedAt: Date,
  band: PlannedPriceBand,
): Date {
  return new Date(
    presentedAt.getTime() + minimumQuotePeriodDays(band) * DAY_MILLIS,
  );
}

// ---------------------------------------------------------------------------
// 日付欄（<input type="date">）との相互変換。
//
// 期限を人が打ち直せるようにしたので（docs/flows.md の D4）、**時刻を持たない
// 「日付」と、DBが持つ「瞬間（timestamptz）」の間の変換がここに要る。**
// 変換を画面側に置くと、サーバ側の検査が別の解釈で同じ文字列を読むことになる。
// 法定の最短見積期間を判定するのはこのファイルなので、その素材の作り方も
// ここが1つだけ持つ（AGENTS.md「結合を増やさない」1）。
//
// **日本時間で確定させる**（docs/design.md 7章「タイムゾーンに注意」）。
// Vercel 本番は UTC で動くため、素の getFullYear() で組み立てると日本時間の夜に
// 出した書類の期限が1日前になる。
// ---------------------------------------------------------------------------

const JST_DATE_INPUT_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 瞬間を、日本時間のその日を指す日付欄の値（YYYY-MM-DD）にする。 */
export function toJstDateInput(date: Date): string {
  const parts = JST_DATE_INPUT_FORMATTER.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** 基準の瞬間から days 日後を、日本時間の日付欄の値にする。 */
export function jstDateInputAfterDays(from: Date, days: number): string {
  return toJstDateInput(new Date(from.getTime() + days * DAY_MILLIS));
}

/**
 * 日付欄の値を、保存する瞬間に直す。形が違う・実在しない日付なら null。
 *
 * **その日の終わり（日本時間 23:59:59.999）にする。** 「◯月◯日まで」は
 * その日いっぱい答えてよいという意味であり、日の始まりにすると、法定の最短日数を
 * 満たす日付を選んでいるのに、提示日時からの実経過が最短日数に届かない瞬間が
 * 保存されてしまう（例：15時に出して翌日を選ぶと9時間しか無い）。
 * 日の終わりなら、日付として最短を満たすことと、瞬間として満たすことが一致する。
 */
export function responseDueAtFromDateInput(value: string): Date | null {
  if (!DATE_INPUT_PATTERN.test(value)) return null;
  const date = new Date(`${value}T23:59:59.999+09:00`);
  if (Number.isNaN(date.getTime())) return null;
  // 「2026-02-31」のような実在しない日付を弾く（環境によっては繰り上げて解釈される）。
  if (toJstDateInput(date) !== value) return null;
  return date;
}

/** 選べる最も早い日（＝法定の最短見積期間を満たす最初の日）を日付欄の値で返す。 */
export function earliestResponseDueDateInput(
  presentedAt: Date,
  band: PlannedPriceBand,
): string {
  return toJstDateInput(computeResponseDueAt(presentedAt, band));
}

/**
 * 入力された回答期限が、法定の最短見積期間を満たしているか。
 * **画面とサーバの両方がこの1つを通す**（画面だけの判定では Server Action を
 * 直接叩かれたときに守れない。docs/design.md 7章「サーバ側でも同じ検査をする」）。
 */
export function meetsMinimumQuotePeriod(
  responseDueAt: Date,
  presentedAt: Date,
  band: PlannedPriceBand,
): boolean {
  return (
    responseDueAt.getTime() >= computeResponseDueAt(presentedAt, band).getTime()
  );
}
