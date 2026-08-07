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
//
// 同一オリジンの確認・Cookie の発行・掃除は `lib/demoSession.ts` が持つ
// （やり直しの入口 `/demo/restart` と同じものを通す）。

import { NextResponse } from "next/server";

import { newDemoOwnerId } from "../../../lib/auth/demoOwner";
import { findDemoProject } from "../../../lib/db/demoCleanup";
import { seedDemoData } from "../../../lib/db/demoSeed";
import {
  currentDemoOwnerId,
  demoContentIsCurrent,
  isSameOrigin,
  issueDemoSession,
  purgeExpiredDemoAfterResponse,
} from "../../../lib/demoSession";

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
 * **①を迂回するのが「最初からやり直す」**（`app/demo/restart/route.ts`）。
 * あちらは作り直すことそのものが目的なので、この分岐を通らない。
 *
 * それでも、Cookie を捨てて叩き直す相手は止められない。**このアプリは
 * IPごとの流量制限を持っていない**（サーバレスで共有できる状態を持たないため）。
 * 前段（Vercel の WAF 等）で掛ける前提にする。`docs/design.md` 6-1 参照。
 */
async function startDemo(): Promise<string> {
  const demoOwner = await currentDemoOwnerId();

  // ①既にデモ中で、中身も今のものなら作り直さない。
  if (demoOwner && (await demoContentIsCurrent())) {
    const existing = await findDemoProject(demoOwner);
    if (existing) return existing;
  }

  // 中身が古いデモ中の訪問者は、同じ識別子のまま作り直す。
  const ownerId = demoOwner ?? newDemoOwnerId();
  await issueDemoSession(ownerId);

  // 発行したばかりの識別子なら、この owner_id にはまだ1行も無いので
  // 後始末（往復2回）を飛ばす（seedDemoData の ownerIsNew を見る）。
  const projectId = await seedDemoData(ownerId, {
    ownerIsNew: demoOwner === null,
  });

  // ②掃除は応答を返したあとに回す（理由は lib/demoSession.ts）。
  purgeExpiredDemoAfterResponse();

  return projectId;
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return new NextResponse(null, { status: 403 });
  }

  const projectId = await startDemo();

  // 303 で返す。POST の応答に 307 を使うと、ブラウザが遷移先へも POST し直す。
  // 行き先は D2「案件をつくる」（docs/flows.md「デモの画面の並び」）。
  // 変えるときは、実装より先に表を直してもらう。
  return NextResponse.redirect(
    new URL(`/demo/${projectId}/project`, request.url),
    303,
  );
}
