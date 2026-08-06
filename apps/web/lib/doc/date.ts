// 書類に印字する日付の整形。
//
// **日本時間で確定させる**（docs/design.md 7章「タイムゾーンに注意」）。
// 既存の lib/pdf/layout.ts の formatDate は `date.getFullYear()` 等をそのまま使っており、
// サーバのローカル時刻に従う。Vercel 本番は UTC なので、日本時間の夜に出した書類は
// 作成日が前日で印字されうる。見積回答期限（法定の見積期間）を同じ素の整形で出すと、
// 法定期間が1日短く印字される。
//
// Intl の timeZone 指定で、サーバがどのタイムゾーンで動いていても日本時間に固定する。

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
