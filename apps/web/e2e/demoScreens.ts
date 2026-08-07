// デモの画面（docs/flows.md「デモの画面の並び」D1〜D10）を、検査から指すための共有部品。
//
// **並びの検査（demo-flow.spec.ts）と、入口・分離の検査（demo-guard.spec.ts）の
// 両方が同じURLの形を見る。** 形を2箇所に書くと、番号を振り直した日に片方だけが
// 古い行き先を見続ける（実際に、着地が D3 から D2 に変わったときに起きた）。
// AGENTS.md「結合を増やさない」1：同じ値を2箇所以上に書かない。

import { expect, type Page } from "@playwright/test";

import { DEMO_RESTART_TEXT } from "../lib/content";

/** `/projects/<案件ID>` の形（D4 以降の画面はどれもこの下にある）。 */
export const PROJECT_ID = /\/projects\/[0-9a-f-]{36}/;

/** D2 案件をつくる。**デモの1タップ目の着地点はここ**（2026-08-07 に D3 から変わった）。 */
export const DEMO_PROJECT_URL = /\/demo\/[0-9a-f-]{36}\/project$/;

/** D3 写真を撮る。 */
export const DEMO_PHOTO_URL = /\/demo\/[0-9a-f-]{36}\/photo$/;

/**
 * **D2〜D10 のどの画面にも「最初からやり直す」が1つある**（表の決まり。2026-08-07）。
 * 商談で次の相手に見せるとき、どの画面からでも切り替えられる必要がある。
 * 0個なら切り替えられず、2個以上なら表と違う。
 */
export async function expectRestartButton(page: Page): Promise<void> {
  await expect(
    page.getByRole("button", { name: DEMO_RESTART_TEXT.label }),
  ).toHaveCount(1);
}

/** `/demo/<案件ID>/…` と `/projects/<案件ID>/…` のどちらからでも案件IDを取り出す。 */
export function projectIdFromUrl(url: string): string {
  const id = new URL(url).pathname.split("/")[2];
  if (!id) throw new Error(`案件IDを取れない: ${url}`);
  return id;
}
