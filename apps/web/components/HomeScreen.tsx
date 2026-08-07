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
 * トップ画面。**誰が来ても、いつ来ても、同じ画面を出す。**
 *
 * 以前はログイン状態で中身を出し分けていた。その結果、
 * **デモを一度触った人（＝デモのセッションを持つ人）にはデモの入口が消え**、
 * 商談で見せ直せなくなった（`docs/failures.md` 2026-08-06）。
 * 出し分けをやめれば、この種の事故は起きない。
 *
 * 表に出すのは**デモのボタン1つだけ**。商談で見せる相手が迷う余地を作らない。
 * 案件一覧・下請台帳・会社設定・ログインは、**右上の小さな丸を押したときだけ**出す
 * （作る側が使うもので、見せる相手には要らない）。
 *
 * 引き出しは `<details>` で作る。JavaScript が動かなくても開く。
 */
export function HomeScreen({ loggedIn, onLogout }: Props) {
  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold">{HOME_HEADING}</h1>

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

          <div className="mt-3 rounded border-2 border-gray-400 p-4">
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
                        className="tap flex items-center rounded border-2 border-gray-400 px-4 py-3 font-bold"
                      >
                        {destination.label}
                      </Link>
                    </li>
                  ))}
                </ul>

                <form action={onLogout} className="mt-3">
                  <button
                    type="submit"
                    className="rounded border-2 border-gray-500 px-4 py-2 font-bold"
                  >
                    {AUTH_TEXT.logout}
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/login"
                className="tap mt-3 flex items-center justify-center rounded border-2 border-gray-400 px-4 py-3 font-bold"
              >
                {AUTH_TEXT.submit}
              </Link>
            )}
          </div>
        </details>
      </div>

      <p className="mt-2 text-gray-700">{HOME_DESCRIPTION}</p>

      {/*
        素のフォームとして POST する（Server Action にしない）。
        理由は lib/demoText.ts の DEMO_START_PATH を見る。
        **ログイン状態にかかわらず、いつでも出す。** 既にデモ中の人が押した場合は
        自分のデモへ戻る（中身が古ければ作り直される。app/demo/start/route.ts）。
      */}
      <form method="post" action={DEMO_START_PATH} className="mt-8">
        <button
          type="submit"
          className="tap flex w-full items-center justify-center rounded bg-blue-800 px-6 py-5 text-lg font-bold text-white"
        >
          {DEMO_ENTRY_TEXT.start}
        </button>
      </form>
      <p className="mt-2 text-gray-700">{DEMO_ENTRY_TEXT.description}</p>
    </main>
  );
}
