"use client";

import { useState } from "react";

import { CALENDAR_TEXT } from "../lib/content";
import { fromISO, toISO, todayISO } from "../lib/date";

interface CalendarProps {
  selected: string;
  onSelect: (dateIso: string) => void;
  onClose: () => void;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

interface DayCell {
  dateIso: string;
  day: number;
}

export function Calendar({ selected, onSelect, onClose }: CalendarProps) {
  const initial = fromISO(selected);
  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());

  const today = todayISO();
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<DayCell | null> = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ dateIso: toISO(new Date(year, month, day)), day });
  }

  function changeMonth(offset: number) {
    const d = new Date(year, month + offset, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label={CALENDAR_TEXT.prevMonth}
          className="min-h-11 min-w-11 rounded-md text-lg text-gray-500 hover:bg-gray-100"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-gray-900">
          {year}年{month + 1}月
        </span>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          aria-label={CALENDAR_TEXT.nextMonth}
          className="min-h-11 min-w-11 rounded-md text-lg text-gray-500 hover:bg-gray-100"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400">
        {WEEKDAYS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (cell === null) return <div key={`empty-${i}`} />;
          const isSelected = cell.dateIso === selected;
          const isToday = cell.dateIso === today;
          return (
            <button
              key={cell.dateIso}
              type="button"
              aria-label={`${CALENDAR_TEXT.select}: ${cell.dateIso}`}
              onClick={() => {
                onSelect(cell.dateIso);
                onClose();
              }}
              className={`min-h-11 rounded-md text-sm transition-colors ${
                isSelected
                  ? "bg-blue-600 font-semibold text-white"
                  : isToday
                    ? "border border-blue-300 font-semibold text-blue-600"
                    : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-3 min-h-11 w-full rounded-md border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50"
      >
        {CALENDAR_TEXT.close}
      </button>
    </div>
  );
}
