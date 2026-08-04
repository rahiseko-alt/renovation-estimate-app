import type { DailyBalancePoint } from "../lib/forecast";
import type { ChartAxisConfig } from "../lib/types";

export const WIDTH = 320;
export const HEIGHT = 190;
export const TOP_PAD = 18;
export const BOTTOM_PAD = 40;
export const LEFT_PAD = 34;
export const RIGHT_PAD = 4;
export const MAX_CROSSING_LABELS = 2;
export const EDGE_LABEL_MARGIN = 22;
export const MIN_Y_TICK_GAP = 14;

export const POSITIVE = "#2563eb";
export const NEGATIVE = "#dc2626";
export const BASELINE = "#d8d5cb";
export const MUTED = "#8b897f";

export function formatShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/** 万円単位に丸めた軸ラベル。マイナスの生表示はせず、色で不足を示す。 */
export function formatYenAxis(n: number): string {
  const abs = Math.abs(n);
  if (abs === 0) return "0円";
  if (abs >= 10_000) {
    const man = Math.round((abs / 10_000) * 10) / 10;
    const text = Number.isInteger(man) ? String(man) : man.toFixed(1);
    return `${text}万円`;
  }
  return `${abs.toLocaleString("ja-JP")}円`;
}

function niceRound(n: number): number {
  if (n === 0) return 0;
  const abs = Math.abs(n);
  let step = 1_000;
  if (abs >= 1_000_000) step = 200_000;
  else if (abs >= 300_000) step = 100_000;
  else if (abs >= 100_000) step = 50_000;
  else if (abs >= 20_000) step = 10_000;
  else if (abs >= 5_000) step = 5_000;
  return Math.round(n / step) * step;
}

/** 0を挟むならその0を基準に、外れるなら範囲の中央を目盛りの既定値にする。 */
function defaultMiddle(domainMin: number, domainMax: number): number {
  if (domainMin <= 0 && domainMax >= 0) return 0;
  return niceRound((domainMin + domainMax) / 2);
}

/** グラフの縦軸の範囲。ユーザーが上端・下端を指定していればそれを優先する。 */
export function resolveAxisDomain(
  values: number[],
  axis: ChartAxisConfig,
): { domainMin: number; domainMax: number } {
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(0, ...values);
  return {
    domainMin: axis.bottom ?? rawMin,
    domainMax: axis.top ?? rawMax,
  };
}

export type AxisTickRole = "top" | "middle" | "bottom";

export interface AxisTick {
  role: AxisTickRole;
  value: number;
}

/** 縦軸の目盛り3本（上端・中間・下端）。それぞれユーザーが個別に上書きできる。 */
export function resolveAxisTicks(values: number[], axis: ChartAxisConfig): AxisTick[] {
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(0, ...values);
  const { domainMin, domainMax } = resolveAxisDomain(values, axis);
  return [
    { role: "top", value: axis.top ?? niceRound(rawMax) },
    { role: "middle", value: axis.middle ?? defaultMiddle(domainMin, domainMax) },
    { role: "bottom", value: axis.bottom ?? niceRound(rawMin) },
  ];
}

export interface LabeledTick extends AxisTick {
  lineY: number;
  labelY: number;
}

/**
 * 目盛りの文字が重ならないよう、縦位置が近いものは少しずらす（線自体は本来の位置のまま）。
 * ずらした結果が日付ラベルの行と重ならないよう、maxLabelYで下限を止める。
 */
export function layoutTickLabels(
  ticks: AxisTick[],
  y: (balance: number) => number,
  maxLabelY: number,
): LabeledTick[] {
  const withY = ticks.map((t) => ({ ...t, lineY: y(t.value) }));
  const sorted = [...withY].sort((a, b) => a.lineY - b.lineY);

  let prevLabelY = -Infinity;
  const withLabelY = sorted.map((t) => {
    const labelY = Math.min(maxLabelY, Math.max(t.lineY, prevLabelY + MIN_Y_TICK_GAP));
    prevLabelY = labelY;
    return { ...t, labelY };
  });

  return ticks.map((t) => withLabelY.find((w) => w.role === t.role)!);
}

export interface NegativeSegment {
  startX: number;
  endX: number;
}

/** マイナスの期間を帯で示すための区間（プラス⇔マイナスの切り替わりごと）。 */
export function buildNegativeSegments(
  points: DailyBalancePoint[],
  x: (i: number) => number,
): NegativeSegment[] {
  const segments: NegativeSegment[] = [];
  let segStart: number | null = points[0]!.balance < 0 ? 0 : null;

  for (let i = 1; i < points.length; i++) {
    const negative = points[i]!.balance < 0;
    const wasNegative = points[i - 1]!.balance < 0;
    if (negative && !wasNegative) {
      segStart = i;
    } else if (!negative && wasNegative && segStart !== null) {
      segments.push({
        startX: (x(segStart - 1) + x(segStart)) / 2,
        endX: (x(i - 1) + x(i)) / 2,
      });
      segStart = null;
    }
  }
  if (segStart !== null) {
    segments.push({
      startX: segStart === 0 ? x(0) : (x(segStart - 1) + x(segStart)) / 2,
      endX: x(points.length - 1),
    });
  }
  return segments;
}

export interface CrossingLabel {
  x: number;
  date: string;
  showLabel: boolean;
}

/** プラスからマイナスへ転じる日の目印（見やすさのため最大2件まで文字を出す）。 */
export function buildCrossingLabels(
  points: DailyBalancePoint[],
  x: (i: number) => number,
): CrossingLabel[] {
  const crossings: CrossingLabel[] = [];
  for (let i = 1; i < points.length; i++) {
    const negative = points[i]!.balance < 0;
    const wasNegative = points[i - 1]!.balance < 0;
    if (negative && !wasNegative) {
      const crossX = (x(i - 1) + x(i)) / 2;
      const withinEdges =
        crossX > LEFT_PAD + EDGE_LABEL_MARGIN && crossX < WIDTH - RIGHT_PAD - EDGE_LABEL_MARGIN;
      crossings.push({ x: crossX, date: points[i]!.date, showLabel: withinEdges });
    }
  }
  const shown = crossings.filter((c) => c.showLabel);
  if (shown.length > MAX_CROSSING_LABELS) {
    const keep = new Set(shown.slice(0, MAX_CROSSING_LABELS).map((c) => c.x));
    return crossings.map((c) => ({ ...c, showLabel: c.showLabel && keep.has(c.x) }));
  }
  return crossings;
}
