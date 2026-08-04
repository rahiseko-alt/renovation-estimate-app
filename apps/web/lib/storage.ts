import { addMonths, todayISO } from "./date";
import type { AppData } from "./types";

const STORAGE_KEY = "kakeibo-kun:v1";

export function defaultAppData(): AppData {
  return {
    startingBalance: 0,
    selectedDate: addMonths(todayISO(), 1),
    transactions: [],
    fixedDailyExpenses: [],
    chartAxis: { top: null, middle: null, bottom: null },
  };
}

/** ブラウザのlocalStorageから読む。無い/壊れている場合は既定値。 */
export function loadAppData(): AppData {
  if (typeof window === "undefined") return defaultAppData();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultAppData();
  try {
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return { ...defaultAppData(), ...parsed };
  } catch {
    return defaultAppData();
  }
}

export function saveAppData(data: AppData): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
