import { DEMO_BANNER_TEXT } from "../lib/demoText";

/**
 * デモ中であることを示す帯。デモの画面と、デモ利用者が開いた通常の画面に出す。
 * 架空のデータを本物と取り違えたまま商談が進むのを防ぐ。
 */
export function DemoBanner() {
  return (
    <p className="flex flex-wrap items-center gap-2 rounded bg-amber-100 px-3 py-2 text-sm text-amber-900">
      <span className="rounded bg-amber-800 px-2 py-0.5 text-xs font-bold text-white">
        {DEMO_BANNER_TEXT.label}
      </span>
      {DEMO_BANNER_TEXT.description}
    </p>
  );
}
