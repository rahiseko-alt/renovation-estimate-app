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
