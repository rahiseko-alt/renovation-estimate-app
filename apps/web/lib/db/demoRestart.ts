// 「最初からやり直す」の中身（docs/flows.md「デモの画面の並び」D2〜D10）。
//
// 投入（demoSeed.ts）と後始末（demoCleanup.ts）を組み合わせるだけで、
// 新しいSQLは書かない。**やり直しは「消してから同じ内容で作り直す」**であって、
// 別のデータでも別の経路でもない。

import { newDemoOwnerId } from "../auth/demoOwner";
import { tryRemoveDemoPhotoObjects } from "./demoCleanup";
import { seedDemoData } from "./demoSeed";

/** 作り直した結果。**識別子が変わることがある**（下の理由）。 */
export type DemoRestartResult = {
  projectId: string;
  /** この先のデモが乗る識別子。呼び出し側はこれでセッションを出し直す。 */
  ownerId: string;
};

/**
 * デモを作り直し、**新しい案件のID**を返す。前の案件は消える。
 *
 * `seedDemoData` は同じ owner_id で呼ぶと、波1で前のデモ案件とデモの下請を消してから
 * 作り直す。やり直しはその経路をそのまま使う（AGENTS.md「結合を増やさない」2）。
 * **`/demo/start` の「既にデモ中なら作り直さない」は通らない。** あれは連打で
 * 書き込みが増えないための分岐で、やり直しは作り直すことそのものが目的。
 *
 * 写真の実体は案件の削除で消えないので、**行を消す前に**Storage を片付ける。
 *
 * **消せなかったときは、同じ識別子で作り直さない。** 同じ識別子で続けると、
 * `seedDemoData` が前の案件ごと `photos` の行（＝ `storage_path`）を消してしまい、
 * **残った実体を後から消す手がかりが無くなる**（商談で撮った現場写真が、
 * 誰にも辿れないまま Storage に残る）。前の識別子の行はそのまま残し、
 * **新しい識別子**でデモを作り直す。残った側は期限切れの掃除
 * （`purgeExpiredDemoData`）がもう一度削除を試みる。
 * やり直し自体は必ず成功する——商談の場でデモが始められない方が損失が大きい。
 *
 * @param options.ownerIsNew この owner_id でまだ何も書いていないと言い切れるとき true。
 *   後始末の往復を丸ごと飛ばす（`seedDemoData` の同名の引数にそのまま渡す）。
 */
export async function restartDemoData(
  ownerId: string,
  options: { readonly ownerIsNew?: boolean } = {},
): Promise<DemoRestartResult> {
  if (options.ownerIsNew) {
    return { projectId: await seedDemoData(ownerId, options), ownerId };
  }

  if (await tryRemoveDemoPhotoObjects(ownerId)) {
    return { projectId: await seedDemoData(ownerId, options), ownerId };
  }

  const freshOwnerId = newDemoOwnerId();
  return {
    projectId: await seedDemoData(freshOwnerId, { ownerIsNew: true }),
    ownerId: freshOwnerId,
  };
}
