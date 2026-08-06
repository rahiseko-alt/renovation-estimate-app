"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { newDemoOwnerId } from "../../lib/auth/demoOwner";
import {
  SESSION_COOKIE_NAME,
  createSessionValue,
  sessionCookieOptions,
} from "../../lib/auth/session";
import { seedDemoData } from "../../lib/db/demoSeed";

/**
 * デモの有効期間。商談1回ぶんが収まればよいので短く取る
 * （通常のログインの30日をデモに与える理由が無い）。
 */
const DEMO_TTL_SECONDS = 60 * 60 * 6;

/**
 * デモを始める。トップ画面の1タップ目がこれを呼ぶ。
 *
 * 使い捨ての識別子でセッションを発行してから、その識別子でデモ一式を作る。
 * 認証の経路は通常のログインと同じものを通るので、proxy.ts も
 * getCurrentUser() も owner_id の絞り込みも、ここのために変える必要が無い。
 */
export async function startDemoAction(): Promise<void> {
  const ownerId = newDemoOwnerId();

  const store = await cookies();
  store.set(
    SESSION_COOKIE_NAME,
    await createSessionValue(ownerId),
    sessionCookieOptions(DEMO_TTL_SECONDS),
  );

  const projectId = await seedDemoData(ownerId);

  // redirect は例外で制御を移すので、try/catch の外に置く。
  redirect(`/demo/${projectId}/photo`);
}
