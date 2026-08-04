"use client";

import { useEffect, useId, useState } from "react";

import { AxisEditModal } from "./AxisEditModal";
import {
  BASELINE,
  BOTTOM_PAD,
  buildCrossingLabels,
  buildNegativeSegments,
  formatShort,
  formatYenAxis,
  HEIGHT,
  layoutTickLabels,
  LEFT_PAD,
  MUTED,
  NEGATIVE,
  POSITIVE,
  resolveAxisDomain,
  resolveAxisTicks,
  RIGHT_PAD,
  TOP_PAD,
  WIDTH,
  type AxisTickRole,
} from "./balanceChartHelpers";
import { AXIS_EDIT_TEXT, HOME_TEXT } from "../lib/content";
import { todayISO } from "../lib/date";
import type { DailyBalancePoint } from "../lib/forecast";
import type { ChartAxisConfig } from "../lib/types";

const TICK_LABEL: Record<AxisTickRole, string> = {
  top: AXIS_EDIT_TEXT.headingTop,
  middle: AXIS_EDIT_TEXT.headingMiddle,
  bottom: AXIS_EDIT_TEXT.headingBottom,
};

interface BalanceChartProps {
  points: DailyBalancePoint[];
  highlightDate: string;
  axis: ChartAxisConfig;
  onAxisChange: (next: ChartAxisConfig) => void;
}

/**
 * 残高の動きを、時間の流れ（横）にそって水位が上下する1本の線と塗りで見せる。
 * 縦軸に金額の目盛り、マイナスの期間には背景の帯、不足に転じる日には印を付け、
 * タップした日の残高もその場で確認できる。縦軸の目盛りはタップして自由に変更できる。
 */
export function BalanceChart({ points, highlightDate, axis, onAxisChange }: BalanceChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [editingRole, setEditingRole] = useState<AxisTickRole | null>(null);
  const clipId = useId();

  useEffect(() => {
    setHoverIndex(null);
  }, [highlightDate, points]);

  if (points.length === 0) return null;

  const values = points.map((p) => p.balance);
  const { domainMin, domainMax } = resolveAxisDomain(values, axis);
  const span = domainMax - domainMin || 1;

  const plotTop = TOP_PAD;
  const plotBottom = HEIGHT - BOTTOM_PAD;
  const plotHeight = plotBottom - plotTop;
  const plotWidth = WIDTH - LEFT_PAD - RIGHT_PAD;

  const n = points.length;
  const x = (i: number) =>
    n === 1 ? LEFT_PAD + plotWidth / 2 : LEFT_PAD + (i / (n - 1)) * plotWidth;
  const y = (balance: number) => {
    const raw = plotTop + plotHeight - ((balance - domainMin) / span) * plotHeight;
    return Math.min(plotBottom, Math.max(plotTop, raw));
  };

  const zeroY = y(0);

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.balance)}`)
    .join(" ");
  const areaPath = `${linePath} L${x(n - 1)},${zeroY} L${x(0)},${zeroY} Z`;

  const highlightIndex = points.findIndex((p) => p.date === highlightDate);
  const activeIndex = hoverIndex ?? (highlightIndex >= 0 ? highlightIndex : null);
  const activePoint = activeIndex !== null ? points[activeIndex] : undefined;

  const firstPoint = points[0] as DailyBalancePoint;
  const lastPoint = points[n - 1] as DailyBalancePoint;
  const startsToday = firstPoint.date === todayISO();

  const ticks = resolveAxisTicks(values, axis);
  const labeledTicks = layoutTickLabels(ticks, y, HEIGHT - 16);
  const negativeSegments = buildNegativeSegments(points, x);
  const crossings = buildCrossingLabels(points, x);

  function handlePointer(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const fraction = (e.clientX - rect.left) / rect.width;
    const relX = fraction * WIDTH;
    const t = n === 1 ? 0 : (relX - LEFT_PAD) / plotWidth;
    const idx = Math.min(n - 1, Math.max(0, Math.round(t * (n - 1))));
    setHoverIndex(idx);
  }

  const editingTick = ticks.find((t) => t.role === editingRole);

  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
        {HOME_TEXT.chartHeading}
      </h2>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full touch-none" role="img">
        <title>{HOME_TEXT.chartHeading}</title>
        <defs>
          <clipPath id={clipId}>
            <rect
              x={LEFT_PAD}
              y={zeroY}
              width={plotWidth}
              height={Math.max(0, plotBottom - zeroY)}
            />
          </clipPath>
        </defs>

        {negativeSegments.map((seg, i) => (
          <rect
            key={`neg-${i}`}
            x={seg.startX}
            y={plotTop}
            width={Math.max(0, seg.endX - seg.startX)}
            height={plotHeight}
            fill={NEGATIVE}
            fillOpacity={0.06}
          />
        ))}

        {labeledTicks.map((tick) => (
          <line
            key={`line-${tick.role}`}
            x1={LEFT_PAD}
            y1={tick.lineY}
            x2={WIDTH - RIGHT_PAD}
            y2={tick.lineY}
            stroke={BASELINE}
            strokeWidth={1}
          />
        ))}

        {labeledTicks.map((tick) => (
          <g
            key={`label-${tick.role}`}
            role="button"
            tabIndex={0}
            aria-label={TICK_LABEL[tick.role]}
            onClick={() => setEditingRole(tick.role)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setEditingRole(tick.role);
              }
            }}
            style={{ cursor: "pointer" }}
          >
            <rect x={0} y={tick.labelY - 9} width={LEFT_PAD} height={14} fill="transparent" />
            <text
              x={LEFT_PAD - 4}
              y={tick.labelY + 3}
              fontSize={8.5}
              fill={tick.value < 0 ? NEGATIVE : MUTED}
              textAnchor="end"
              style={{ textDecoration: "underline dotted" }}
            >
              {formatYenAxis(tick.value)}
            </text>
          </g>
        ))}

        <path d={areaPath} fill={POSITIVE} fillOpacity={0.1} stroke="none" />
        <path
          d={areaPath}
          fill={NEGATIVE}
          fillOpacity={0.1}
          stroke="none"
          clipPath={`url(#${clipId})`}
        />
        <path
          d={linePath}
          fill="none"
          stroke={POSITIVE}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={linePath}
          fill="none"
          stroke={NEGATIVE}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          clipPath={`url(#${clipId})`}
        />

        {crossings.map((c, i) => (
          <g key={`cross-${i}`}>
            <line
              x1={c.x}
              y1={plotTop}
              x2={c.x}
              y2={plotBottom}
              stroke={NEGATIVE}
              strokeWidth={1}
              strokeDasharray="2,2"
            />
            {c.showLabel ? (
              <text
                x={c.x}
                y={plotBottom + 12}
                fontSize={8}
                fill={NEGATIVE}
                fontWeight={600}
                textAnchor="middle"
              >
                {formatShort(c.date)}
                {HOME_TEXT.chartCrossingIntoShortfall}
              </text>
            ) : null}
          </g>
        ))}

        {activePoint ? (
          <g>
            <line
              x1={x(activeIndex as number)}
              y1={plotTop}
              x2={x(activeIndex as number)}
              y2={plotBottom}
              stroke={BASELINE}
              strokeWidth={1}
              strokeDasharray="2,2"
            />
            <circle
              cx={x(activeIndex as number)}
              cy={y(activePoint.balance)}
              r={8}
              fill={activePoint.balance < 0 ? NEGATIVE : POSITIVE}
              fillOpacity={0.15}
            />
            <circle
              cx={x(activeIndex as number)}
              cy={y(activePoint.balance)}
              r={4.5}
              fill={activePoint.balance < 0 ? NEGATIVE : POSITIVE}
              stroke="#fff"
              strokeWidth={2}
            />
          </g>
        ) : null}

        <text x={LEFT_PAD} y={HEIGHT - 4} fontSize={9} fill={MUTED}>
          {startsToday ? HOME_TEXT.chartTodayLabel : formatShort(firstPoint.date)}
        </text>
        <text
          x={WIDTH - RIGHT_PAD}
          y={HEIGHT - 4}
          fontSize={9}
          fill={MUTED}
          textAnchor="end"
        >
          {formatShort(lastPoint.date)}
        </text>

        <rect
          x={LEFT_PAD}
          y={plotTop}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          onPointerDown={handlePointer}
          onPointerMove={(e) => {
            if (e.buttons === 1) handlePointer(e);
          }}
        />
      </svg>

      {activePoint ? (
        <p className="mt-2 text-center text-xs font-semibold text-gray-500">
          {formatShort(activePoint.date)}：
          <span
            className={activePoint.balance < 0 ? "text-red-600" : "text-gray-900"}
          >
            {Math.abs(activePoint.balance).toLocaleString("ja-JP")}円
            {activePoint.balance < 0 ? HOME_TEXT.chartShortfallSuffix : ""}
          </span>
        </p>
      ) : null}
      <p className="mt-1 text-center text-[10px] text-gray-400">
        {HOME_TEXT.chartTapHint}
      </p>

      {editingRole && editingTick ? (
        <AxisEditModal
          role={editingRole}
          currentValue={editingTick.value}
          onApply={(next) => {
            onAxisChange({ ...axis, [editingRole]: next });
            setEditingRole(null);
          }}
          onReset={() => {
            onAxisChange({ ...axis, [editingRole]: null });
            setEditingRole(null);
          }}
          onClose={() => setEditingRole(null)}
        />
      ) : null}
    </div>
  );
}
