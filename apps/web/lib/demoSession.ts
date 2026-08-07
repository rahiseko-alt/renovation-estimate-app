// デモの入口が共通で使う道具（同一オリジンの確認・セッションの発行・期限切れの掃除）。
//
// **入口は2つある。** `/demo/start`（D1 から始める）と `/demo/restart`（D2〜D10 の
// 「最初からやり直す」）。どちらも素のフォーム POST を受けるルートハンドラで、
// 同じ確認と同じ Cookie を通す。**判定を2箇所に書かない**——片方だけ直したときに、
// もう一方の入口が無防備なまま残る（AGENTS.md「結合を増やさない」1・2）。
//
// **Server Action にしない**理由は `app/demo/start/route.ts` の冒頭にある
// （呼び出し先IDがビルドごとに変わり、古いページから押すと無反応になる）。

import { cookies } from "next/headers";
import { after } from "next/server";

import { isDemoOwner } from "./auth/demoOwner";
import {
  SESSION_COOKIE_NAME,
  createSessionValue,
  readSessionValue,
  sessionCookieOptions,
} from "./auth/session";
import { purgeExpiredDemoData } from "./db/demoCleanup";
import { DEMO_CONTENT_VERSION, DEMO_VERSION_COOKIE_NAME } from "./demoVersion";

/**
 * デモの有効期間。商談1回ぶんが収まればよいので短く取る
 * （通常のログインの30日をデモに与える理由が無い）。
 *
 * この値は**署名の中の失効時刻と、Cookie の maxAge の両方**に使う。
 * Cookie だけ短くしても、値を控えておいた相手には効かない。
 */
export const DEMO_TTL_SECONDS = 60 * 60 * 6;

/**
 * 同一オリジンからの POST かを確かめる。
 *
 * **Server Action はこれを自前で行っていた。** ルートハンドラには無いので、
 * ここに同じ判定を置く。置かないと、他所のサイトに置いたフォームから叩かれ、
 * 訪問者のセッション Cookie を勝手に貼り替えられる
 * （ログイン中の利用者なら、実質その場でログアウトさせられる）。
 *
 * 素のフォームの POST には Origin が付く。付いていないものは通さない。
 * 公開URLの判定には転送元のホスト（x-forwarded-host）を優先する
 * （Vercel の前段を通ると host は内部の値になりうる）。
 *
 * **この判定は、前段（Vercel）が `x-forwarded-host` を必ず上書きすることを前提にする。**
 * 上書きされない環境に載せ替えるなら、攻撃者がこのヘッダを自分で付けて
 * Origin と一致させられるので、ここは信頼できる値の比較に直すこと。
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * いまの訪問者がデモ中なら、その識別子。未ログインと実利用者は null。
 * 実利用者を混ぜないので、この値で消したり作り直したりしてよい対象が決まる。
 */
export async function currentDemoOwnerId(): Promise<string | null> {
  const store = await cookies();
  const current = await readSessionValue(store.get(SESSION_COOKIE_NAME)?.value);
  return current && isDemoOwner(current) ? current : null;
}

/** 訪問者が持っているデモの中身が、いま配っている版と同じか（`lib/demoVersion.ts`）。 */
export async function demoContentIsCurrent(): Promise<boolean> {
  const store = await cookies();
  return store.get(DEMO_VERSION_COOKIE_NAME)?.value === DEMO_CONTENT_VERSION;
}

/**
 * デモのセッション（本体と中身の版）を発行する。既にデモ中の識別子で呼べば、
 * 有効期間を取り直すことになる。
 */
export async function issueDemoSession(ownerId: string): Promise<void> {
  const store = await cookies();
  store.set(
    SESSION_COOKIE_NAME,
    await createSessionValue(ownerId, DEMO_TTL_SECONDS),
    sessionCookieOptions(DEMO_TTL_SECONDS),
  );
  store.set(
    DEMO_VERSION_COOKIE_NAME,
    DEMO_CONTENT_VERSION,
    sessionCookieOptions(DEMO_TTL_SECONDS),
  );
}

/**
 * 期限を過ぎた他のデモの掃除を、**応答を返したあとに**回す。
 * 利用者の待ち時間に足さない。失敗しても止めない（商談の場でデモが開かない方が
 * 損失が大きい。次に誰かがデモを始めたときに、また掃除の機会がある）。
 */
export function purgeExpiredDemoAfterResponse(): void {
  after(async () => {
    try {
      await purgeExpiredDemoData(new Date(Date.now() - DEMO_TTL_SECONDS * 1000));
    } catch (error) {
      // デモは止めない。ただし黙って消すと、掃除が毎回失敗していても気付けない。
      // 第一引数は固定の文字列にし、値は別引数で渡す（photoStorage.ts と同じ理由）。
      console.error("期限切れデモの掃除に失敗した:", { error });
    }
  });
}
