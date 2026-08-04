import Link from "next/link";

import {
  AUTH_TEXT,
  HOME_DESCRIPTION,
  HOME_HEADING,
  HOME_STEPS,
} from "../lib/content";

type Props = {
  loggedIn: boolean;
  /** ログアウトの実処理。画面はどう実現しているかを知らない。 */
  onLogout: () => Promise<void>;
};

/**
 * トップ画面。行き先を選ぶだけの画面にする（1画面1タスク）。
 * ログイン状態の判定は呼び出し側が行い、ここは受け取った真偽値で出し分けるだけ。
 */
export function HomeScreen({ loggedIn, onLogout }: Props) {
  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">{HOME_HEADING}</h1>
      <p className="mt-2 text-gray-700">{HOME_DESCRIPTION}</p>

      {loggedIn ? (
        <>
          <ul className="mt-8 flex flex-col gap-3">
            {HOME_STEPS.map((step, index) => (
              <li key={step.label}>
                <Link
                  href={step.href}
                  className="tap flex flex-col justify-center rounded border-2 border-gray-400 px-5 py-4"
                >
                  <span className="text-lg font-bold">
                    {index + 1}. {step.label}
                  </span>
                  <span className="mt-1 text-gray-700">{step.description}</span>
                </Link>
              </li>
            ))}
          </ul>

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
        <Link
          href="/login"
          className="tap mt-8 flex items-center justify-center rounded bg-blue-800 px-6 py-4 text-lg font-bold text-white"
        >
          {AUTH_TEXT.submit}
        </Link>
      )}
    </main>
  );
}
