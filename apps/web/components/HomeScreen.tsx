import Link from "next/link";

import {
  AUTH_TEXT,
  HOME_DESCRIPTION,
  HOME_HEADING,
  HOME_DESTINATIONS,
} from "../lib/content";
import { DEMO_ENTRY_TEXT, DEMO_START_PATH } from "../lib/demoText";

type Props = {
  loggedIn: boolean;
  /**
   * デモの利用者かどうか（`demo:` の使い捨て識別子で入っている人）。
   * **デモの利用者もログイン扱いなので、これが無いと入口が消える。**
   */
  demoVisitor: boolean;
  /** ログアウトの実処理。画面はどう実現しているかを知らない。 */
  onLogout: () => Promise<void>;
};

/**
 * トップ画面。行き先を選ぶだけの画面にする（1画面1タスク）。
 * ログイン状態の判定は呼び出し側が行い、ここは受け取った真偽値で出し分けるだけ。
 *
 * 番号は振らない。並んでいるのは手順ではなく行き先で、案件を開くのに
 * 下請台帳や会社設定を先に通る必要は無い。
 *
 * **未ログインで最初に目に入るのはデモの入口ひとつにする。** 商談で見せる相手は
 * アカウントを持っていないので、ログインを先頭に出すと必ずそこで止まる。
 * ログインは「アカウントをお持ちの方」として下に置く。
 */
export function HomeScreen({ loggedIn, demoVisitor, onLogout }: Props) {
  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">{HOME_HEADING}</h1>
      <p className="mt-2 text-gray-700">{HOME_DESCRIPTION}</p>

      {loggedIn ? (
        <>
          <ul className="mt-8 flex flex-col gap-3">
            {HOME_DESTINATIONS.map((destination) => (
              <li key={destination.href}>
                <Link
                  href={destination.href}
                  className="tap flex flex-col justify-center rounded border-2 border-gray-400 px-5 py-4"
                >
                  <span className="text-lg font-bold">{destination.label}</span>
                  <span className="mt-1 text-gray-700">
                    {destination.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {/*
            **デモ中の人には、トップからデモへ戻る道を出す。**
            出さないと、一度見せたあと6時間はトップから見せ直せない
            （商談で実際に詰まった。lib/demoText.ts の resume を見る）。
            実利用者には出さない（実データの画面にデモを混ぜない）。
          */}
          {demoVisitor ? (
            <>
              <form method="post" action={DEMO_START_PATH} className="mt-8">
                <button
                  type="submit"
                  className="tap flex w-full items-center justify-center rounded bg-blue-800 px-6 py-5 text-lg font-bold text-white"
                >
                  {DEMO_ENTRY_TEXT.resume}
                </button>
              </form>
              <p className="mt-2 text-gray-700">
                {DEMO_ENTRY_TEXT.resumeDescription}
              </p>
            </>
          ) : null}

          <form action={onLogout} className="mt-10">
            <button
              type="submit"
              className="rounded border-2 border-gray-500 px-5 py-3 font-bold"
            >
              {AUTH_TEXT.logout}
            </button>
          </form>
        </>
      ) : (
        <>
          {/*
            素のフォームとして POST する（Server Action にしない）。
            理由は lib/demoText.ts の DEMO_START_PATH を見る。
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

          <p className="mt-10 text-gray-700">{DEMO_ENTRY_TEXT.loginNote}</p>
          <Link
            href="/login"
            className="tap mt-2 flex items-center justify-center rounded border-2 border-gray-400 px-6 py-4 font-bold"
          >
            {AUTH_TEXT.submit}
          </Link>
        </>
      )}
    </main>
  );
}
