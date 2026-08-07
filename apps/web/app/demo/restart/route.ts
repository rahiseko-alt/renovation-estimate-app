// 「最初からやり直す」の入口。デモの画面（D2〜D10）に置いたフォームがここへ POST する
// （利用者の回答 A①。2026-08-07。docs/flows.md「デモの画面の並び」）。
//
// **Server Action にしない。** 呼び出し先IDはビルドのたびに変わり、古いページを開いた
// ままのブラウザから押すと無反応になる（`docs/failures.md` 2026-08-06。
// `/demo/start` がこれで無反応になった）。素のフォーム POST なら URL は変わらない。
//
// 同一オリジンの確認と Cookie の扱いは `/demo/start` と同じものを通す
// （`lib/demoSession.ts`）。

import { NextResponse } from "next/server";

import { newDemoOwnerId } from "../../../lib/auth/demoOwner";
import { restartDemoData } from "../../../lib/db/demoRestart";
import {
  currentDemoOwnerId,
  isSameOrigin,
  issueDemoSession,
  purgeExpiredDemoAfterResponse,
} from "../../../lib/demoSession";

/**
 * 前のデモを消して、**新しい案件**で作り直し、そのIDを返す。
 *
 * 商談で次の相手に見せるための操作なので、**前の相手が打った施主名や撮った写真を
 * 残さない**。識別子は同じものを使い続ける（新しく発行すると、前の案件が期限まで
 * 残ってしまう。`app/demo/start/route.ts` の①の注記と同じ理由）。
 *
 * デモ中でない相手（未ログイン・実利用者）が叩いたときは、新しい識別子で始める。
 * `/demo/start` を押したときと同じ扱いで、**実利用者のデータには触らない**
 * （消す対象は `demo:` の owner_id が持つ行だけ）。
 */
async function restartDemo(): Promise<string> {
  const demoOwner = await currentDemoOwnerId();
  const ownerId = demoOwner ?? newDemoOwnerId();

  // 有効期間を取り直し、中身の版も今のものにする（古い版のまま作り直さない）。
  await issueDemoSession(ownerId);

  const projectId = await restartDemoData(ownerId, {
    ownerIsNew: demoOwner === null,
  });

  purgeExpiredDemoAfterResponse();

  return projectId;
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return new NextResponse(null, { status: 403 });
  }

  const projectId = await restartDemo();

  // 303 で返す（POST の応答に 307 を使うと、ブラウザが遷移先へも POST し直す）。
  // 行き先は D2「案件をつくる」＝やり直しは最初の画面から始まる
  // （docs/flows.md「デモの画面の並び」。変えるときは実装より先に表を直してもらう）。
  return NextResponse.redirect(
    new URL(`/demo/${projectId}/project`, request.url),
    303,
  );
}
