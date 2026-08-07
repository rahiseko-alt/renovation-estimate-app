"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "../../../../lib/auth/server";
import { clearLineMark, markLine } from "../../../../lib/db/lineAdoptions";
import { getProjectForOwner } from "../../../../lib/db/projects";
import { LINE_MARK_STATUSES } from "../../../../lib/db/types";
import type { LineMarkStatus } from "../../../../lib/db/types";

/**
 * 想定内の失敗は**投げずに返す**。
 *
 * Next.js は本番ビルドで Server Action の例外を伏せる（クライアントに届くのは
 * 差し替えられた汎用メッセージで、こちらが書いた日本語は出ない）。
 * 画面に理由を出したいので、想定内の失敗は返り値で渡す。
 * throw が残るのは**想定外**のときだけで、そちらは呼び出し側が
 * QUOTE_DOCUMENT_TEXT.markFailed に落とす。
 */
export type MarkLineResult = { ok: true } | { ok: false; message: string };

/**
 * D6（見積もり書類）で、明細1件にその社の「採用」または「保留」の印を付け外しする。
 *
 * **同じ印をもう一度押したら無印に戻す**（採用↔無印、保留↔無印。利用者の指示
 * 2026-08-08）。押し間違えたときに、別の印を選ばないと戻せない状態だった。
 * どちらにするかは `isPressed` で呼び出し側が渡す——いま付いている印は画面が
 * 持っているので、外すためだけにDBをもう一度読まない。
 *
 * 所有者確認をここでも行う。画面で押せなくしても Server Action は直接叩ける
 * （app/projects/[id]/comparison/actions.ts と同じ原則）。
 * 採用の排他（1明細1社）と、依頼の対象範囲の検査、採用を付け替えたときに
 * 前の社を保留へ下ろす扱いは lib/db/lineAdoptions.ts が行う。
 */
export async function markLineAction(
  projectId: string,
  lineItemId: string,
  quoteGroupRequestId: string,
  status: LineMarkStatus,
  isPressed = false,
): Promise<MarkLineResult> {
  const ownerId = await getCurrentUser();
  if (!ownerId) {
    return { ok: false, message: "ログインしてください。" };
  }
  const project = await getProjectForOwner(projectId, ownerId);
  if (!project) {
    return { ok: false, message: "案件が見つかりません。" };
  }
  // 直接叩かれたときに未知の状態が入らないようにする（型は実行時には残らない）。
  if (!LINE_MARK_STATUSES.includes(status)) {
    return { ok: false, message: "印の種類が不正です。" };
  }

  try {
    const input = { projectId, lineItemId, quoteGroupRequestId, status };
    // 押されている印をもう一度押したら外す。付いていないものを押したら付ける。
    if (isPressed) {
      await clearLineMark(input, ownerId);
    } else {
      await markLine(input, ownerId);
    }
  } catch (error) {
    // lineAdoptions.ts の検証（依頼の所有者・案件の一致・対象範囲）は日本語の
    // Error で落ちる。それ以外（DBの障害など）は想定外なので投げ直す。
    if (error instanceof Error) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  // **成功したときだけ**作り直す。失敗しているのに作り直すと、
  // 変わっていない画面を描き直すだけで無駄な往復が増える。
  // 押しても画面は移らない（docs/flows.md D6）が、一覧（D7）と
  // この画面自身の印は次に開いたときに新しくする。
  revalidatePath(`/projects/${projectId}/quotes`);
  revalidatePath(`/projects/${projectId}/quotes/${quoteGroupRequestId}`);
  return { ok: true };
}
