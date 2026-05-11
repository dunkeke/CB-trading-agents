/**
 * Technical indicators for convertible bond T+0 timing analysis.
 * Supports minute-level granularity (1m/5m/15m/30m/60m) and daily.
 *
 * Indicators:
 *   - MACD (12, 26, 9)
 *   - RSI (6, 12, 24)
 *   - Bollinger Bands (20, 2)
 *   - SMA (5, 10, 20, 60)
 *   - TD Sequential (九转序列) with perfection check
 *   - ATR (14)
 *   - KDJ (9, 3, 3)
 */

import type { OHLCV } from "./bond-data";

export interface IndicatorSet {
  macd: number[];
  macdSignal: number[];
  macdHistogram: number[];
  rsi6: (number | null)[];
  rsi12: (number | null)[];
  rsi24: (number | null)[];
  bollUpper: (number | null)[];
  bollMiddle: (number | null)[];
  bollLower: (number | null)[];
  sma5: (number | null)[];
  sma10: (number | null)[];
  sma20: (number | null)[];
  sma60: (number | null)[];
  atr14: (number | null)[];
  k: (number | null)[];
  d: (number | null)[];
  j: (number | null)[];
  tdBuyCount: number[];
  tdSellCount: number[];
  tdBuy9: boolean[];
  tdSell9: boolean[];
}

export interface LatestIndicators {
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  rsi6: number | null;
  rsi12: number | null;
  rsi24: number | null;
  bollUpper: number | null;
  bollMiddle: number | null;
  bollLower: number | null;
  sma5: number | null;
  sma10: number | null;
  sma20: number | null;
  sma60: number | null;
  atr14: number | null;
  k: number | null;
  d: number | null;
  j: number | null;
  tdBuyCount: number;
  tdSellCount: number;
  tdBuy9: boolean;
  tdSell9: boolean;
}

function lastValue<T>(arr: (T | null)[]): T | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== null) return arr[i] as T;
  }
  return null;
}

function sma(arr: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) {
      out.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += arr[i - j];
      out.push(sum / period);
    }
  }
  return out;
}

function ema(arr: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i === 0) out.push(arr[0]);
    else out.push(arr[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

function rsiCalc(arr: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period) {
      out.push(null);
      continue;
    }
    let gains = 0;
    let losses = 0;
    for (let j = 0; j < period; j++) {
      const change = arr[i - j] - arr[i - j - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    out.push(
      avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
    );
  }
  return out;
}

function atrCalc(
  ohlc: { h: number; l: number; c: number }[],
  period: number = 14
): (number | null)[] {
  const trs: number[] = [];
  for (let i = 0; i < ohlc.length; i++) {
    if (i === 0) trs.push(ohlc[i].h - ohlc[i].l);
    else {
      const tr1 = ohlc[i].h - ohlc[i].l;
      const tr2 = Math.abs(ohlc[i].h - ohlc[i - 1].c);
      const tr3 = Math.abs(ohlc[i].l - ohlc[i - 1].c);
      trs.push(Math.max(tr1, tr2, tr3));
    }
  }
  return sma(trs, period);
}

function kdj(
  ohlc: { h: number; l: number; c: number }[],
  rsvPeriod = 9,
  kPeriod = 3,
  dPeriod = 3
): { k: (number | null)[]; d: (number | null)[]; j: (number | null)[] } {
  const kArr: (number | null)[] = [];
  const dArr: (number | null)[] = [];
  const jArr: (number | null)[] = [];
  let prevK = 50;
  let prevD = 50;

  for (let i = 0; i < ohlc.length; i++) {
    if (i < rsvPeriod - 1) {
      kArr.push(null);
      dArr.push(null);
      jArr.push(null);
      continue;
    }
    let lowest = Infinity;
    let highest = -Infinity;
    for (let j = 0; j < rsvPeriod; j++) {
      lowest = Math.min(lowest, ohlc[i - j].l);
      highest = Math.max(highest, ohlc[i - j].h);
    }
    const range = highest - lowest;
    const rsv = range === 0 ? 50 : ((ohlc[i].c - lowest) / range) * 100;
    const k = (2 / kPeriod) * prevK + (1 / kPeriod) * rsv;
    const d = (2 / dPeriod) * prevD + (1 / dPeriod) * k;
    const j = 3 * k - 2 * d;
    kArr.push(k);
    dArr.push(d);
    jArr.push(j);
    prevK = k;
    prevD = d;
  }
  return { k: kArr, d: dArr, j: jArr };
}

/**
 * TD Sequential (九转序列) - Tom DeMark
 */
function tdSequential(
  closes: number[]
): {
  buyCount: number[];
  sellCount: number[];
  buy9: boolean[];
  sell9: boolean[];
} {
  const n = closes.length;
  const buyCount = new Array(n).fill(0);
  const sellCount = new Array(n).fill(0);
  const buy9 = new Array(n).fill(false);
  const sell9 = new Array(n).fill(false);

  for (let i = 4; i < n; i++) {
    // Buy setup: close[i] < close[i-4]
    if (closes[i] < closes[i - 4]) {
      buyCount[i] = buyCount[i - 1] + 1;
    } else {
      buyCount[i] = 0;
    }
    // Sell setup: close[i] > close[i-4]
    if (closes[i] > closes[i - 4]) {
      sellCount[i] = sellCount[i - 1] + 1;
    } else {
      sellCount[i] = 0;
    }
    // Mark 9
    if (buyCount[i] === 9) buy9[i] = true;
    if (sellCount[i] === 9) sell9[i] = true;
  }
  return { buyCount, sellCount, buy9, sell9 };
}

export function computeAllIndicators(ohlcv: OHLCV[]): {
  indicators: IndicatorSet;
  latest: LatestIndicators;
} {
  const closes = ohlcv.map((d) => d.close);
  const ohl = ohlcv.map((d) => ({ h: d.high, l: d.low, c: d.close }));

  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const macdSignalLine = ema(macdLine, 9);
  const macdHist = macdLine.map((v, i) => v - macdSignalLine[i]);

  const rsi6 = rsiCalc(closes, 6);
  const rsi12 = rsiCalc(closes, 12);
  const rsi24 = rsiCalc(closes, 24);

  const bb = bollingerBands(closes, 20, 2);

  const sma5 = sma(closes, 5);
  const sma10 = sma(closes, 10);
  const sma20 = sma(closes, 20);
  const sma60 = sma(closes, 60);

  const atr14 = atrCalc(ohl, 14);

  const kdjResult = kdj(ohl, 9, 3, 3);

  const td = tdSequential(closes);

  const ind: IndicatorSet = {
    macd: macdLine,
    macdSignal: macdSignalLine,
    macdHistogram: macdHist,
    rsi6,
    rsi12,
    rsi24,
    bollUpper: bb.upper,
    bollMiddle: bb.middle,
    bollLower: bb.lower,
    sma5,
    sma10,
    sma20,
    sma60,
    atr14,
    k: kdjResult.k,
    d: kdjResult.d,
    j: kdjResult.j,
    tdBuyCount: td.buyCount,
    tdSellCount: td.sellCount,
    tdBuy9: td.buy9,
    tdSell9: td.sell9,
  };

  const latest: LatestIndicators = {
    macd: macdLine[macdLine.length - 1] ?? 0,
    macdSignal: macdSignalLine[macdSignalLine.length - 1] ?? 0,
    macdHistogram: macdHist[macdHist.length - 1] ?? 0,
    rsi6: lastValue<number>(rsi6),
    rsi12: lastValue<number>(rsi12),
    rsi24: lastValue<number>(rsi24),
    bollUpper: lastValue<number>(bb.upper),
    bollMiddle: lastValue<number>(bb.middle),
    bollLower: lastValue<number>(bb.lower),
    sma5: lastValue<number>(sma5),
    sma10: lastValue<number>(sma10),
    sma20: lastValue<number>(sma20),
    sma60: lastValue<number>(sma60),
    atr14: lastValue<number>(atr14),
    k: lastValue<number>(kdjResult.k),
    d: lastValue<number>(kdjResult.d),
    j: lastValue<number>(kdjResult.j),
    tdBuyCount: td.buyCount[td.buyCount.length - 1] ?? 0,
    tdSellCount: td.sellCount[td.sellCount.length - 1] ?? 0,
    tdBuy9: td.buy9[td.buy9.length - 1] ?? false,
    tdSell9: td.sell9[td.sell9.length - 1] ?? false,
  };

  return { indicators: ind, latest };
}

function bollingerBands(
  prices: number[],
  period: number,
  multiplier: number
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const mid = sma(prices, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      upper.push(null);
      lower.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += prices[i - j];
      const mean = sum / period;
      let sqSum = 0;
      for (let j = 0; j < period; j++) sqSum += (prices[i - j] - mean) ** 2;
      const std = Math.sqrt(sqSum / period);
      upper.push(mean + multiplier * std);
      lower.push(mean - multiplier * std);
    }
  }
  return { upper, middle: mid, lower };
}

export function formatPriceData(ohlcv: OHLCV[], maxRows = 40): string {
  const recent = ohlcv.slice(-maxRows);
  return recent
    .map(
      (d) =>
        `${d.date},${d.open.toFixed(3)},${d.high.toFixed(3)},${d.low.toFixed(3)},${d.close.toFixed(3)},${d.volume.toFixed(0)}`
    )
    .join("\n");
}

export function formatIndicatorsLatest(latest: LatestIndicators): string {
  const entries = Object.entries(latest).map(([k, v]) => {
    if (v === null) return `${k}: -`;
    if (typeof v === "boolean") return `${k}: ${v ? "YES" : "no"}`;
    if (typeof v === "number") return `${k}: ${v.toFixed(3)}`;
    return `${k}: ${v}`;
  });
  return entries.join(" | ");
}
