"use client";

import { useEffect, useState } from "react";

import { Accordion } from "../components/Accordion";
import { BalanceChart } from "../components/BalanceChart";
import { Calendar } from "../components/Calendar";
import { FixedDailyExpenseSection } from "../components/FixedDailyExpenseSection";
import { RecurringSummary } from "../components/RecurringSummary";
import { TransactionForm } from "../components/TransactionForm";
import { TransactionList } from "../components/TransactionList";
import { DEMO_TEXT, DETAIL_TEXT, HOME_DESCRIPTION, HOME_HEADING, HOME_TEXT } from "../lib/content";
import { formatJP, todayISO } from "../lib/date";
import { buildDemoAppData } from "../lib/demoData";
import {
  currentBalance,
  dailyBalanceSeries,
  forecastBalance,
} from "../lib/forecast";
import { detectRecurringMonthly } from "../lib/recurring";
import { loadAppData, saveAppData } from "../lib/storage";
import type { AppData, FixedDailyExpense, Transaction } from "../lib/types";

const MAX_CHART_POINTS = 45;

type RecordTab = "expense" | "income" | "fixed";

const RECORD_TABS: Array<{
  key: RecordTab;
  label: string;
  activeClass: string;
}> = [
  { key: "expense", label: DETAIL_TEXT.expenseListHeading, activeClass: "text-red-600" },
  { key: "income", label: DETAIL_TEXT.incomeListHeading, activeClass: "text-blue-600" },
  { key: "fixed", label: DETAIL_TEXT.fixedTabLabel, activeClass: "text-gray-900" },
];

export default function Home() {
  const [data, setData] = useState<AppData | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [activeTab, setActiveTab] = useState<RecordTab>("expense");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isRecordsOpen, setIsRecordsOpen] = useState(false);

  useEffect(() => {
    setData(loadAppData());
  }, []);

  function update(next: AppData) {
    setData(next);
    saveAppData(next);
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white p-8">
        <h1 className="text-lg font-bold text-gray-900">{HOME_HEADING}</h1>
      </main>
    );
  }

  const today = todayISO();
  const isToday = data.selectedDate === today;
  const forecast = forecastBalance(data, data.selectedDate);
  const isShortfall = forecast < 0;
  const displayAmount = Math.abs(forecast);
  const current = currentBalance(data);
  const rangeStart = data.selectedDate <= today ? data.selectedDate : today;
  const rangeEnd = data.selectedDate <= today ? today : data.selectedDate;
  const series = sampledSeries(data, rangeStart, rangeEnd);

  const expenses = data.transactions.filter((t) => t.type === "expense");
  const incomes = data.transactions.filter((t) => t.type === "income");
  const recurring = detectRecurringMonthly(data.transactions);
  const hasAnyData = data.transactions.length > 0 || data.fixedDailyExpenses.length > 0;

  function loadDemoData() {
    if (hasAnyData && !window.confirm(DEMO_TEXT.confirmReplace)) return;
    update(buildDemoAppData());
  }

  function selectDate(dateIso: string) {
    if (!data) return;
    update({ ...data, selectedDate: dateIso });
  }

  function addTransaction(t: Transaction) {
    if (!data) return;
    update({ ...data, transactions: [...data.transactions, t] });
  }

  function deleteTransaction(id: string) {
    if (!data) return;
    update({
      ...data,
      transactions: data.transactions.filter((t) => t.id !== id),
    });
  }

  function addFixedDaily(item: FixedDailyExpense) {
    if (!data) return;
    update({ ...data, fixedDailyExpenses: [...data.fixedDailyExpenses, item] });
  }

  function deleteFixedDaily(id: string) {
    if (!data) return;
    update({
      ...data,
      fixedDailyExpenses: data.fixedDailyExpenses.filter((f) => f.id !== id),
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-white px-4 py-4">
      <header>
        <h1 className="text-lg font-bold tracking-tight text-gray-900">
          {HOME_HEADING}
        </h1>
        <p className="text-xs text-gray-500">{HOME_DESCRIPTION}</p>
        <button
          type="button"
          onClick={loadDemoData}
          className="mt-1 min-h-11 text-xs font-medium text-blue-600 underline underline-offset-2"
        >
          {hasAnyData ? DEMO_TEXT.replaceLabel : DEMO_TEXT.loadLabel}
        </button>
      </header>

      <section className="rounded-2xl border border-gray-200 bg-gradient-to-b from-blue-50/70 to-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-blue-700">
          {HOME_TEXT.forecastHeadingPrefix}
          {formatJP(data.selectedDate)}
        </h2>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-gray-500">
            {HOME_TEXT.dateLabel}
          </span>
          <button
            type="button"
            onClick={() => setShowCalendar((v) => !v)}
            className="min-h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-900"
          >
            {formatJP(data.selectedDate)}
            {HOME_TEXT.changeDateSuffix}
          </button>
        </div>

        {showCalendar ? (
          <div className="mt-2">
            <Calendar
              selected={data.selectedDate}
              onSelect={selectDate}
              onClose={() => setShowCalendar(false)}
            />
          </div>
        ) : null}

        <div className="mt-5">
          <p className="text-xs font-medium text-gray-500">
            {isToday ? HOME_TEXT.balanceLabelToday : HOME_TEXT.balanceLabelFuture}
          </p>
          <p className="text-6xl font-bold tracking-tight text-gray-900">
            {displayAmount.toLocaleString("ja-JP")}
            <span className="ml-1 text-xl font-normal text-gray-500">円</span>
          </p>
          {isShortfall ? (
            <p className="mt-1 text-sm font-semibold text-red-600">
              {isToday
                ? HOME_TEXT.shortfallNoteToday
                : HOME_TEXT.shortfallNoteFuture}
            </p>
          ) : null}
          {!isToday ? (
            <p className="mt-1 text-xs text-gray-400">
              {current < 0
                ? HOME_TEXT.currentShortfallPrefix
                : HOME_TEXT.currentBalancePrefix}
              {Math.abs(current).toLocaleString("ja-JP")}
              {HOME_TEXT.currentBalanceSuffix}
            </p>
          ) : null}
        </div>

        <div className="mt-5 border-t border-gray-100 pt-4">
          <BalanceChart
            points={series}
            highlightDate={data.selectedDate}
            axis={data.chartAxis}
            onAxisChange={(next) => update({ ...data, chartAxis: next })}
          />
        </div>
      </section>

      <Accordion
        title={DETAIL_TEXT.entryFormHeading}
        open={isFormOpen}
        onToggle={() => setIsFormOpen((v) => !v)}
      >
        <TransactionForm onAdd={addTransaction} />
      </Accordion>

      <Accordion
        title={DETAIL_TEXT.recordsListHeading}
        open={isRecordsOpen}
        onToggle={() => setIsRecordsOpen((v) => !v)}
      >
        <div role="tablist" className="grid grid-cols-3 gap-1 rounded-lg bg-gray-50 p-1">
          {RECORD_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`min-h-11 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === tab.key
                  ? `bg-white shadow-sm ${tab.activeClass}`
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {activeTab === "expense" ? (
            <TransactionList
              emptyMessage={DETAIL_TEXT.emptyExpense}
              transactions={expenses}
              onDelete={deleteTransaction}
              tone="expense"
            />
          ) : null}

          {activeTab === "income" ? (
            <TransactionList
              emptyMessage={DETAIL_TEXT.emptyIncome}
              transactions={incomes}
              onDelete={deleteTransaction}
              tone="income"
            />
          ) : null}

          {activeTab === "fixed" ? (
            <div className="flex flex-col gap-5">
              <FixedDailyExpenseSection
                items={data.fixedDailyExpenses}
                onAdd={addFixedDaily}
                onDelete={deleteFixedDaily}
              />
              <div className="border-t border-gray-100 pt-5">
                <RecurringSummary rules={recurring} />
              </div>
            </div>
          ) : null}
        </div>
      </Accordion>
    </main>
  );
}

function sampledSeries(data: AppData, fromIso: string, toIso: string) {
  const full = dailyBalanceSeries(data, fromIso, toIso);
  if (full.length <= MAX_CHART_POINTS) return full;
  const step = Math.ceil(full.length / MAX_CHART_POINTS);
  return full.filter((_, i) => i % step === 0 || i === full.length - 1);
}
