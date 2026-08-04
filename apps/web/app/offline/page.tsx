import { OFFLINE_TEXT } from "../../lib/content";

/**
 * オフライン時の代わりの画面。
 *
 * サービスワーカーがこのページをキャッシュしておき、通信できないときの
 * 画面遷移フォールバックとして返す（public/sw.js を参照）。
 * ログイン状態を一切読まない。ここでログイン中のナビゲーションを出すと、
 * ログアウト後に古いキャッシュから「ログイン中の見た目」がオフライン時だけ
 * 復活する事故になる。
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 py-8 text-center">
      <h1 className="text-xl font-bold">{OFFLINE_TEXT.heading}</h1>
      <p className="mt-4 text-gray-700">{OFFLINE_TEXT.body}</p>
    </main>
  );
}
