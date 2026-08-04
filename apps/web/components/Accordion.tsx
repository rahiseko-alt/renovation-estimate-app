"use client";

import { useId } from "react";

interface AccordionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * 折りたたみ可能なセクション。既定は閉じた状態。
 * 主要情報（残高予測カード）を初期表示に収めるため、
 * 記録の追加・一覧など編集系のセクションをこれで包む。
 */
export function Accordion({ title, open, onToggle, children }: AccordionProps) {
  const contentId = useId();

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex min-h-11 w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-gray-900"
      >
        {title}
        <span
          aria-hidden="true"
          className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {open ? (
        <div id={contentId} className="border-t border-gray-100 p-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}
