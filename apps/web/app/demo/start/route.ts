// デモを始める入口。トップ画面の1タップ目がここへ POST する。
//
// **Server Action にしない。** 以前は `<form action={startDemoAction}>` だったが、
// Server Action の呼び出し先IDは**ビルドのたびに変わる**。ブラウザが持っている
// 古いページから押すと、新しい本番にはもう存在しないIDへ送るので**何も起きない**
// （利用者から「デモを触るボタンを押しても無反応」と言われた。
// `docs/failures.md` 2026-08-06）。シークレットウィンドウなら直る＝キャッシュの問題。
// **デプロイのたびに再発する。**
//
// URL はビルドで変わらない。素のフォームから POST する形にすれば、
// 古いページからでも必ず届く。JavaScript が動かない環境でも同じ経路を通る。

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { after } from "next/server";

import { isDemoOwner, newDemoOwnerId } from "../../../lib/auth/demoOwner";
import {
  SESSION_COOKIE_NAME,
  createSessionValue,
  readSessionValue,
  sessionCookieOptions,
} from "../../../lib/auth/session";
import {
  findDemoProject,
  purgeExpiredDemoData,
} from "../../../lib/db/demoCleanup";
import { seedDemoData } from "../../../lib/db/demoSeed";
import {
  DEMO_CONTENT_VERSION,
  DEMO_VERSION_COOKIE_NAME,
} from "../../../lib/demoVersion";

/**
 * デモの有効期間。商談1回ぶんが収まればよいので短く取る
 * （通常のログインの30日をデモに与える理由が無い）。
 *
 * この値は**署名の中の失効時刻と、Cookie の maxAge の両方**に使う。
 * Cookie だけ短くしても、値を控えておいた相手には効かない。
 */
const DEMO_TTL_SECONDS = 60 * 60 * 6;

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
 */
function isSameOrigin(request: Request): boolean {
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
 * デモ一式を用意して、案件IDを返す。
 *
 * 使い捨ての識別子でセッションを発行してから、その識別子でデモ一式を作る。
 * 認証の経路は通常のログインと同じものを通るので、proxy.ts も
 * getCurrentUser() も owner_id の絞り込みも、ここのために変える必要が無い。
 *
 * **無ログインで誰でも叩ける入口**なので、書き込みが際限なく増えないようにしている：
 * ①既にデモ中の訪問者は作り直さず、自分の案件へ戻す（連打で書き込みが増えない）
 * ②始まるたびに、期限を過ぎた他のデモを掃除する（行が溜まり続けない）
 *
 * **ただし①は「中身が今のものなら」に限る。** デモの中身を直しても、既にデモ中
 * だった人には古い案件を返し続けていた（有効期間は6時間あるので、直した当日に
 * 触った人ほど古いものを見る）。版が違えば、**同じ識別子のまま作り直す**
 * （新しい識別子を発行すると、古い案件が期限まで残る）。版は `lib/demoVersion.ts`。
 *
 * それでも、Cookie を捨てて叩き直す相手は止められない。**このアプリは
 * IPごとの流量制限を持っていない**（サーバレスで共有できる状態を持たないため）。
 * 前段（Vercel の WAF 等）で掛ける前提にする。`docs/design.md` 6-1 参照。
 */
async function startDemo(): Promise<string> {
  const store = await cookies();

  const current = await readSessionValue(store.get(SESSION_COOKIE_NAME)?.value);
  const demoOwner = current && isDemoOwner(current) ? current : null;
  const contentIsCurrent =
    store.get(DEMO_VERSION_COOKIE_NAME)?.value === DEMO_CONTENT_VERSION;

  // ①既にデモ中で、中身も今のものなら作り直さない。
  if (demoOwner && contentIsCurrent) {
    const existing = await findDemoProject(demoOwner);
    if (existing) return existing;
  }

  // 中身が古いデモ中の訪問者は、同じ識別子のまま作り直す。
  const ownerId = demoOwner ?? newDemoOwnerId();

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

  // 発行したばかりの識別子なら、この owner_id にはまだ1行も無いので
  // 後始末（往復2回）を飛ばす（seedDemoData の ownerIsNew を見る）。
  const projectId = await seedDemoData(ownerId, {
    ownerIsNew: demoOwner === null,
  });

  // ②掃除は**応答を返したあとに**回す。利用者の待ち時間に足さない。
  // 失敗しても始めさせる（商談の場でデモが開かない方が損失が大きい。
  // 次に誰かが始めたときに、また掃除の機会がある）。
  after(async () => {
    try {
      await purgeExpiredDemoData(new Date(Date.now() - DEMO_TTL_SECONDS * 1000));
    } catch (error) {
      // デモは止めない。ただし黙って消すと、掃除が毎回失敗していても気付けない。
      // 第一引数は固定の文字列にし、値は別引数で渡す（photoStorage.ts と同じ理由）。
      console.error("期限切れデモの掃除に失敗した:", { error });
    }
  });

  return projectId;
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return new NextResponse(null, { status: 403 });
  }

  const projectId = await startDemo();

  // 303 で返す。POST の応答に 307 を使うと、ブラウザが遷移先へも POST し直す。
  return NextResponse.redirect(
    new URL(`/demo/${projectId}/photo`, request.url),
    303,
  );
}
