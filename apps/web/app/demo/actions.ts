"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { isDemoOwner, newDemoOwnerId } from "../../lib/auth/demoOwner";
import {
  SESSION_COOKIE_NAME,
  createSessionValue,
  readSessionValue,
  sessionCookieOptions,
} from "../../lib/auth/session";
import {
  findDemoProject,
  purgeExpiredDemoData,
} from "../../lib/db/demoCleanup";
import { seedDemoData } from "../../lib/db/demoSeed";

/**
 * デモの有効期間。商談1回ぶんが収まればよいので短く取る
 * （通常のログインの30日をデモに与える理由が無い）。
 *
 * この値は**署名の中の失効時刻と、Cookie の maxAge の両方**に使う。
 * Cookie だけ短くしても、値を控えておいた相手には効かない。
 */
const DEMO_TTL_SECONDS = 60 * 60 * 6;

/**
 * デモを始める。トップ画面の1タップ目がこれを呼ぶ。
 *
 * 使い捨ての識別子でセッションを発行してから、その識別子でデモ一式を作る。
 * 認証の経路は通常のログインと同じものを通るので、proxy.ts も
 * getCurrentUser() も owner_id の絞り込みも、ここのために変える必要が無い。
 *
 * **無ログインで誰でも叩ける入口**なので、書き込みが際限なく増えないようにしている：
 * ①既にデモ中の訪問者は作り直さず、自分の案件へ戻す（連打で書き込みが増えない）
 * ②始まるたびに、期限を過ぎた他のデモを掃除する（行が溜まり続けない）
 *
 * それでも、Cookie を捨てて叩き直す相手は止められない。**このアプリは
 * IPごとの流量制限を持っていない**（サーバレスで共有できる状態を持たないため）。
 * 前段（Vercel の WAF 等）で掛ける前提にする。`docs/design.md` 6-1 参照。
 */
export async function startDemoAction(): Promise<void> {
  const store = await cookies();

  // ①既にデモ中なら作り直さない。
  const current = await readSessionValue(store.get(SESSION_COOKIE_NAME)?.value);
  if (current && isDemoOwner(current)) {
    const existing = await findDemoProject(current);
    if (existing) redirect(`/demo/${existing}/photo`);
  }

  const ownerId = newDemoOwnerId();

  store.set(
    SESSION_COOKIE_NAME,
    await createSessionValue(ownerId, DEMO_TTL_SECONDS),
    sessionCookieOptions(DEMO_TTL_SECONDS),
  );

  const projectId = await seedDemoData(ownerId);

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

  // redirect は例外で制御を移すので、try/catch の外に置く。
  redirect(`/demo/${projectId}/photo`);
}
