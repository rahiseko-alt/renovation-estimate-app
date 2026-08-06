// デモの中身の版。**`lib/demoFixture.ts` の中身から自動で算出する。**
//
// デモは「既にデモ中の訪問者は作り直さず、自分の案件へ戻す」（`app/demo/actions.ts`）。
// これは連打で書き込みが増えないための仕組みだが、**デモの中身を直したときに、
// 既にデモ中だった人へ古い案件を返し続ける**という副作用があった。
// 有効期間は6時間あるので、**直した当日に触った人ほど古いものを見る**。
// 実際に「見た感じ変わってない」と言われた（`docs/failures.md` 2026-08-06）。
//
// **版を手で上げる形にしない。** このリポジトリの失敗の多くが「規則はあったが
// 機構が無い」形をしている（同上）。中身から算出すれば、fixture を直した時点で
// 必ず変わり、上げ忘れが起きない。
//
// サーバー専用。誤ってクライアント側の束に入るとビルドで落とす
// （`node:crypto` を含むため）。

import "server-only";

import { createHash } from "node:crypto";

// **名前を並べずに、モジュールごと材料にする。**
// 個別に import して並べると、fixture に値を足したときに必ずここへ足し忘れる
// （実際に `DEMO_WORK_NAME` が漏れていた。CodeRabbit の指摘）。
// 漏れた値を直しても版が変わらず、古い案件が返り続ける＝この仕組みが無い状態に戻る。
// 名前空間ごと取れば、export を足した時点で自動的に材料に入る。
import * as DEMO_FIXTURE from "./demoFixture";

/** Cookie の名前。セッションとは別に持つ（署名の中身を変えると認証に波及するため）。 */
export const DEMO_VERSION_COOKIE_NAME = "rea_demo_ver";

/**
 * デモの中身から版を作る。**同じ中身なら必ず同じ、違えば必ず違う。**
 * 純粋関数にしてあるのは、この性質そのものを検査できるようにするため。
 */
export function demoContentVersion(content: unknown): string {
  // 短くする（Cookie に載るだけで、衝突しても「作り直すか否か」しか変わらない）。
  return createHash("sha256").update(JSON.stringify(content)).digest("hex").slice(0, 12);
}

/**
 * いま投入されるデモの版。**`lib/demoFixture.ts` の export 全部から作る。**
 *
 * `import * as` で取れる名前空間オブジェクトは、キーが名前順に並ぶことが
 * 仕様で決まっているので、同じ中身なら毎回同じ版になる。
 */
export const DEMO_CONTENT_VERSION = demoContentVersion({ ...DEMO_FIXTURE });
