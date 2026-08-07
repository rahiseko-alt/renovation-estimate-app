"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "../../../../lib/auth/server";
import { DOCUMENT_CONFIRM_TEXT } from "../../../../lib/content";
import { hasQuoteRequestGroup } from "../../../../lib/db/drafts";
import { getProjectForOwner } from "../../../../lib/db/projects";
import { listSubcontractorsForOwner } from "../../../../lib/db/subcontractors";
import { sendQuoteRequestGroup } from "../send/actions";

/**
 * 確認画面（D3）から出す依頼の予定価格帯。
 *
 * **この画面では選ばせない**（docs/flows.md「デモの画面の並び」の D3 に、
 * 送り先の選択も価格帯の選択も無い。表に無いものは作らない）。
 * 選ばせない以上こちらで1つに決めるしかないので、見積期間が最短になる帯を使う。
 * 送り先も同じ理由で、登録済みの下請全社にする。
 */
const DOCUMENT_PLANNED_PRICE_BAND = "under_500man";

/**
 * 送れなかった理由を、画面が出せる言葉で返す。
 * 成功したときは redirect（例外で制御が移る）なので、ここへは戻ってこない。
 * 形は app/projects/[id]/quotes/actions.ts の MarkLineResult に合わせる。
 */
export type SendFromDocumentResult = { ok: true } | { ok: false; message: string };

/**
 * 確認画面（D3）の「送信」。**送信の実体は作らない。**
 * 既存の送信（app/projects/[id]/send/actions.ts の sendQuoteRequestGroup）を
 * そのまま通し、送信ゲートも所有者確認もあちらの1箇所で受ける。
 * ここが持つのは「誰に・どの帯で送るか」と「送ったあとの行き先」だけ。
 */
export async function sendFromDocumentAction(
  projectId: string,
): Promise<SendFromDocumentResult> {
  const ownerId = await getCurrentUser();
  if (!ownerId) {
    throw new Error("ログインしてください。");
  }
  const project = await getProjectForOwner(projectId, ownerId);
  if (!project) {
    throw new Error("案件が見つかりません。");
  }

  // 既に依頼グループがある案件（デモの初期状態がそう）は、もう一度送らない。
  // 押すたびに依頼が増えると、下請には同じ工事の依頼が何通も届く。
  if (!(await hasQuoteRequestGroup(projectId, ownerId))) {
    const subcontractors = await listSubcontractorsForOwner(ownerId);
    // 送り先はこの画面では選ばせない（docs/flows.md の D3）ので、台帳が空なら
    // 送りようがない。送信側に渡すと「送り先を1社以上選んでください。」が返るが、
    // 選ぶ欄の無いこの画面ではその指示に従えない。ここで止めて言い換える。
    if (subcontractors.length === 0) {
      return { ok: false, message: DOCUMENT_CONFIRM_TEXT.noSubcontractors };
    }
    await sendQuoteRequestGroup(
      projectId,
      subcontractors.map((subcontractor) => subcontractor.id),
      DOCUMENT_PLANNED_PRICE_BAND,
    );
  }

  redirect(`/projects/${projectId}/sent`);
}
