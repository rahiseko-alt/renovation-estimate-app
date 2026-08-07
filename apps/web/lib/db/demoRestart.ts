// 「最初からやり直す」の中身（docs/flows.md「デモの画面の並び」D2〜D10）。
//
// 投入（demoSeed.ts）と後始末（demoCleanup.ts）を組み合わせるだけで、
// 新しいSQLは書かない。**やり直しは「消してから同じ内容で作り直す」**であって、
// 別のデータでも別の経路でもない。

import { tryRemoveDemoPhotoObjects } from "./demoCleanup";
import { seedDemoData } from "./demoSeed";

/**
 * デモを作り直し、**新しい案件のID**を返す。前の案件は消える。
 *
 * `seedDemoData` は同じ owner_id で呼ぶと、波1で前のデモ案件とデモの下請を消してから
 * 作り直す。やり直しはその経路をそのまま使う（AGENTS.md「結合を増やさない」2）。
 * **`/demo/start` の「既にデモ中なら作り直さない」は通らない。** あれは連打で
 * 書き込みが増えないための分岐で、やり直しは作り直すことそのものが目的。
 *
 * 写真の実体だけは案件の削除で消えないので、**行を消す前に**Storage を片付ける。
 * 消せなくてもやり直しは続ける（残るのは参照の無いオブジェクトで、次の商談には
 * 出てこない。始められない方が損失が大きい）。
 *
 * @param options.ownerIsNew この owner_id でまだ何も書いていないと言い切れるとき true。
 *   後始末の往復を丸ごと飛ばす（`seedDemoData` の同名の引数にそのまま渡す）。
 */
export async function restartDemoData(
  ownerId: string,
  options: { readonly ownerIsNew?: boolean } = {},
): Promise<string> {
  if (!options.ownerIsNew) await tryRemoveDemoPhotoObjects(ownerId);
  return seedDemoData(ownerId, options);
}
