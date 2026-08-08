import Image from "next/image";

/**
 * 画面いっぱいに敷く背景の絵。**置き方をここ1つが持つ。**
 *
 * 画面ごとに `position: fixed` の絵を書き直すと、重なりの順（z-index）や
 * 読み上げから外す指定が画面ごとにばらつく（AGENTS.md「結合を増やさない」1）。
 *
 * - **絵の上に地の色をかぶせない。** 渡された絵は既にほぼ白で、
 *   かぶせると消える。文字は黒のまま読める。
 * - `fixed` にするので、中身が長い画面をスクロールしても絵は動かない。
 * - 飾りなので読み上げには載せない（`alt=""` と `aria-hidden`）。
 * - **紙には出さない**（`print:hidden`）。書類の印刷に背景が乗ると邪魔になる。
 * - 押す対象にしない（`pointer-events-none`）。全面を覆うのでボタンを塞ぎかねない。
 *
 * **使う側の入れ物に `relative isolate` が要る。** この2つで、絵と中身の
 * 重なりを**その画面の中だけで完結**させる。
 *
 * `isolate` が無いと、`app/layout.tsx` の `<body>` が持つ `bg-white` との
 * 上下関係で必ずどちらかが消える。負の `z-index` にすれば body の白の裏に回って
 * **絵が見えなくなり**、0 にすれば絵が**中身の上に乗って文字が消える**。
 * どちらも実際に起きた（画素を測って気づいた）。
 */
export function ScreenBackground({ src }: { src: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 print:hidden"
    >
      {/*
        `priority` を付けるのは、これが最初に映る一番大きな要素で、
        遅れると画面が白いまま出るため（トップの表示時間は本番検査が測っている）。
        next/image を通すのは、端末の幅に合う大きさと形式（WebP 等）に変換させるため。
      */}
      <Image src={src} alt="" fill priority sizes="100vw" className="object-cover" />
    </div>
  );
}
