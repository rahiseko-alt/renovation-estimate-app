// 書類に印字する日付の整形。
//
// **日本時間で確定させる**（docs/design.md 7章「タイムゾーンに注意」）。
// 素のローカル時刻の日付ゲッタで組むと、サーバのタイムゾーンに従ってしまう。
// Vercel 本番は UTC なので、日本時間 00:00〜09:00 に出した書類は作成日が前日で
// 印字される。見積回答期限（法定の見積期間）を同じ素の整形で出すと、法定期間が
// 1日短く印字される。
//
// Intl の timeZone 指定で、サーバがどのタイムゾーンで動いていても日本時間に固定する。
//
// **書類の日付はこの1つだけを通す。** 2026-09-01 まで lib/pdf/layout.ts が別の整形を
// 持っていて、同じ見積書でも画面とPDFで違う日付が出ていた。2つ目を作らないこと
// （tests/pdf.test.ts が、書類を組む側に素の日付ゲッタが戻ってきたら落とす）。

const JST_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

/** 「2026年8月20日」の形。日本時間で確定させる。 */
export function formatDateJst(date: Date): string {
  const parts = JST_FORMATTER.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}年${get("month")}月${get("day")}日`;
}
