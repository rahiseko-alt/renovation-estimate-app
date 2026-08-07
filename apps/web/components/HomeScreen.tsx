import type { CSSProperties } from "react";

import Link from "next/link";

import {
  AUTH_TEXT,
  HOME_DESCRIPTION,
  HOME_HEADING,
  HOME_DESTINATIONS,
  DEVELOPER_PANEL_TEXT,
} from "../lib/content";
import { DEMO_ENTRY_TEXT, DEMO_START_PATH } from "../lib/demoText";

type Props = {
  /**
   * ログイン済みかどうか。**表に出るものは何も変えない**（下の設計の理由を見る）。
   * 開発者向けの引き出しの中で、ログインへ誘うかログアウトを出すかだけに使う。
   */
  loggedIn: boolean;
  /** ログアウトの実処理。画面はどう実現しているかを知らない。 */
  onLogout: () => Promise<void>;
};

/**
 * 見出しの色を変える位置（%）を、見出しの文字列そのものから出す。
 *
 * **文字列を分割して定数を増やさない。** HOME_HEADING は CI のスモークが本文から
 * 探すマーカーでもあり（AGENTS.md の注意書き）、割ると grep が外れる。
 * 先頭のカタカナの連なり（「リフォーム」）までを緑にする。日本語の全角文字は
 * 幅が同じなので、文字数の比がそのまま幅の比になる。
 * カタカナで始まらない見出しに変わったら 0% を返し、全体が黒で出る（壊れない）。
 */
function twoToneSplitPercent(heading: string): number {
  const katakanaPrefix = /^[\u30A0-\u30FF]+/.exec(heading)?.[0] ?? "";
  if (heading.length === 0) return 0;
  return (katakanaPrefix.length / heading.length) * 100;
}

/**
 * トップ画面。**誰が来ても、いつ来ても、同じ画面を出す。**
 *
 * 以前はログイン状態で中身を出し分けていた。その結果、
 * **デモを一度触った人（＝デモのセッションを持つ人）にはデモの入口が消え**、
 * 商談で見せ直せなくなった（`docs/failures.md` 2026-08-06）。
 * 出し分けをやめれば、この種の事故は起きない。
 *
 * 表に出すのは**ロゴ・見出し・説明文と、デモのボタン1つだけ**
 * （`docs/flows.md`「デモの画面の並び」D1。表に無いボタン・画面・遷移は作らない）。
 * 案件一覧・下請台帳・会社設定・ログインは、**右上の小さな丸を押したときだけ**出す
 * （作る側が使うもので、見せる相手には要らない）。
 *
 * 引き出しは `<details>` で作る。JavaScript が動かなくても開く。
 */
export function HomeScreen({ loggedIn, onLogout }: Props) {
  return (
    // スマホ縦で1画面に収める。上の帯（黒丸）以外を残りの高さの中央に置くので、
    // 画面の高さが変わっても、ロゴ・見出し・ボタンの間の余白だけが伸び縮みする。
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col px-6 pb-10 pt-3">
      <div className="flex justify-end">
        <details className="shrink-0">
          {/*
            右上の小さな黒丸。中身の文字は出さないので、読み上げ用の名前を付ける
            （名前が無いと、画面を読み上げて使う人には「ボタン」としか分からない）。
          */}
          <summary
            aria-label={DEVELOPER_PANEL_TEXT.open}
            title={DEVELOPER_PANEL_TEXT.open}
            className="tap flex h-11 w-11 cursor-pointer list-none items-center justify-center"
          >
            <span aria-hidden className="block h-4 w-4 rounded-full bg-black" />
          </summary>

          <div className="mt-3 rounded-2xl border-2 border-gray-300 p-4">
            <p className="text-sm text-gray-700">
              {DEVELOPER_PANEL_TEXT.description}
            </p>

            {loggedIn ? (
              <>
                <ul className="mt-3 flex flex-col gap-2">
                  {HOME_DESTINATIONS.map((destination) => (
                    <li key={destination.href}>
                      <Link
                        href={destination.href}
                        className="tap flex items-center rounded-xl border-2 border-gray-300 px-4 py-3 font-bold"
                      >
                        {destination.label}
                      </Link>
                    </li>
                  ))}
                </ul>

                <form action={onLogout} className="mt-3">
                  <button
                    type="submit"
                    className="rounded-xl border-2 border-gray-400 px-4 py-2 font-bold"
                  >
                    {AUTH_TEXT.logout}
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/login"
                className="tap mt-3 flex items-center justify-center rounded-xl border-2 border-gray-300 px-4 py-3 font-bold"
              >
                {AUTH_TEXT.submit}
              </Link>
            )}
          </div>
        </details>
      </div>

      <div className="flex flex-1 flex-col justify-center pb-6">
        <div className="flex flex-col items-center text-center">
          {/*
            ロゴ。図案は public/icon.svg が1つだけ持つ（favicon・PWA のアイコンと
            同じファイル）。React で描き直すと同じ図が2箇所になる
            （AGENTS.md「結合を増やさない」1）。
            飾りなので読み上げには載せない（alt=""）。
            next/image を通さないのは、拡大縮小しても劣化しない SVG に
            画像最適化が要らないため。
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon.svg"
            alt=""
            width={128}
            height={128}
            className="h-32 w-32"
          />

          <h1
            className="two-tone-heading mt-4 text-4xl font-bold tracking-tight"
            style={
              {
                "--two-tone-split": `${twoToneSplitPercent(HOME_HEADING)}%`,
              } as CSSProperties
            }
          >
            {HOME_HEADING}
          </h1>

          <p className="mt-3 text-gray-600">{HOME_DESCRIPTION}</p>
        </div>

        {/*
          素のフォームとして POST する（Server Action にしない）。
          理由は lib/demoText.ts の DEMO_START_PATH を見る。
          **ログイン状態にかかわらず、いつでも出す。** 既にデモ中の人が押した場合は
          自分のデモへ戻る（中身が古ければ作り直される。app/demo/start/route.ts）。
        */}
        {/*
          押しやすさは上下の padding で作る（高さ 68px）。min-h-* は効かない：
          globals.css の `button { min-height: 48px }` は層に入っていない素の規則で、
          Tailwind のユーティリティ（層の中）より強いため。
        */}
        <form method="post" action={DEMO_START_PATH} className="mt-10">
          <button
            type="submit"
            className="tap flex w-full items-center justify-center rounded-2xl bg-brand-deep px-6 py-5 text-xl font-bold text-white"
          >
            {DEMO_ENTRY_TEXT.start}
          </button>
        </form>
        <p className="mt-3 text-center text-sm text-gray-600">
          {DEMO_ENTRY_TEXT.description}
        </p>
      </div>
    </main>
  );
}
