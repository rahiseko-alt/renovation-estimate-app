import { AUTH_TEXT, HOME_HEADING } from "../../lib/content";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ failed?: string }>;
}) {
  const { failed } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-between px-5 py-8">
      <div>
        <h1 className="text-2xl font-bold">{HOME_HEADING}</h1>
        <h2 className="mt-6 text-xl font-bold">{AUTH_TEXT.heading}</h2>

        {failed ? (
          <p
            role="alert"
            className="mt-4 rounded border-2 border-red-700 bg-red-50 px-4 py-3 text-red-900"
          >
            {AUTH_TEXT.failed}
          </p>
        ) : null}

        {/* 1カラム・ラベルは入力欄の上（NN/g：最速・最少エラー） */}
        <form action={login} className="mt-6 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="font-bold">
              {AUTH_TEXT.emailLabel}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              required
              className="rounded border-2 border-gray-500 px-4 py-3"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="font-bold">
              {AUTH_TEXT.passwordLabel}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="rounded border-2 border-gray-500 px-4 py-3"
            />
          </div>

          {/* 主要ボタンは画面下寄り・アイコンだけにしない */}
          <button
            type="submit"
            className="rounded bg-blue-800 px-6 py-4 text-lg font-bold text-white"
          >
            {AUTH_TEXT.submit}
          </button>
        </form>
      </div>

      <p className="mt-10 text-gray-700">{AUTH_TEXT.note}</p>
    </main>
  );
}
