// D2〜D10 のすべてに置く「最初からやり直す」（利用者の回答 A①。2026-08-07。
// docs/flows.md「デモの画面の並び」）。**見た目も行き先もここ1箇所**で、
// 8つの画面はこれを呼ぶだけにする（AGENTS.md「結合を増やさない」1・2）。
//
// DemoBanner.tsx に足さないのは、あの帯が**表に無い画面**（デモ利用者が開いた比較表）
// にも出ているため。足すとその画面にもボタンが増え、「表に無いボタンを作らない」に反する。
//
// 素のフォーム POST（Server Action にしない）。理由は lib/flowText.ts の
// DEMO_RESTART_PATH を見る。JavaScript が動かない環境でも同じ経路を通る。

import { DEMO_RESTART_PATH, DEMO_RESTART_TEXT } from "../lib/content";

export function DemoRestartButton() {
  return (
    <form method="post" action={DEMO_RESTART_PATH} className="mt-8">
      <button
        type="submit"
        className="tap flex w-full items-center justify-center rounded border-2 border-gray-500 px-5 py-3 font-bold"
      >
        {DEMO_RESTART_TEXT.label}
      </button>
    </form>
  );
}
