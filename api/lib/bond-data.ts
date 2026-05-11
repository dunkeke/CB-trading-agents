/**
 * Convertible bond data fetcher via Sina/Tencent APIs.
 *
 * Data sources:
 *   - Daily K-line:    Tencent ifzq.gtimg.cn (day/week/month)
 *   - Minute K-line:   Sina money.finance.sina.com.cn (scale=15/30/60/240)
 *   - Real-time spot:  Sina hq.sinajs.cn
 *
 * Bond code format:
 *   - Shanghai: sh + 6-digit code (e.g., sh113052)
 *   - Shenzhen: sz + 6-digit code (e.g., sz128106)
 */

export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type TimeFrame = "1" | "5" | "15" | "30" | "60" | "day";

function normalizeCode(code: string): string {
  const c = code.trim().toLowerCase();
  if (c.startsWith("sh") || c.startsWith("sz")) return c;
  // Try to determine exchange by code range
  const num = parseInt(c);
  if (num >= 110000 && num < 120000) return "sh" + c;
  if (num >= 120000 && num < 130000) return "sh" + c;
  if (num >= 123000 && num < 130000) return "sz" + c;
  if (num >= 113000 && num < 114000) return "sh" + c;
  if (num >= 118000 && num < 119000) return "sh" + c;
  // Default: assume sz
  return "sz" + c;
}

/**
 * Fetch daily K-line data from Tencent.
 */
export async function fetchDailyKLine(
  code: string,
  startDate: string,
  endDate: string
): Promise<OHLCV[]> {
  const nc = normalizeCode(code);
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${nc},day,${startDate},${endDate},500,qfq`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!resp.ok) throw new Error(`Daily fetch failed: ${resp.status}`);
  const data = (await resp.json()) as any;
  const arr = data?.data?.[nc]?.day || [];
  return arr
    .filter((row: string[]) => row.length >= 6)
    .map((row: string[]) => ({
      date: row[0],
      open: parseFloat(row[1]),
      close: parseFloat(row[2]),
      high: parseFloat(row[3]),
      low: parseFloat(row[4]),
      volume: parseFloat(row[5]),
    }));
}

/**
 * Fetch minute K-line data from Sina.
 * scale: 15 (15min), 30 (30min), 60 (60min), 240 (daily)
 */
export async function fetchMinuteKLine(
  code: string,
  scale: number,
  dataLen: number = 200
): Promise<OHLCV[]> {
  const nc = normalizeCode(code);
  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${nc}&scale=${scale}&ma=5&datalen=${dataLen}`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://finance.sina.com.cn",
    },
  });
  if (!resp.ok) throw new Error(`Minute fetch failed: ${resp.status}`);
  let text = await resp.text();
  text = text.trim();
  // Sina returns raw JSON array or var-assigned JSON
  if (text.startsWith("var ")) {
    text = text.substring(text.indexOf("["), text.lastIndexOf("]") + 1);
  }
  if (!text || text[0] !== "[") return [];
  const arr = JSON.parse(text) as any[];
  return arr
    .filter((row) => row.close != null)
    .map((row) => ({
      date: row.day as string,
      open: parseFloat(row.open),
      high: parseFloat(row.high),
      low: parseFloat(row.low),
      close: parseFloat(row.close),
      volume: parseFloat(row.volume),
    }));
}

/**
 * Unified fetch based on time frame.
 */
export async function fetchKLine(
  code: string,
  timeFrame: TimeFrame
): Promise<OHLCV[]> {
  const end = new Date().toISOString().split("T")[0];
  const start = "2024-01-01";

  switch (timeFrame) {
    case "day":
      return fetchDailyKLine(code, start, end);
    case "60":
      return fetchMinuteKLine(code, 60, 200);
    case "30":
      return fetchMinuteKLine(code, 30, 200);
    case "15":
      return fetchMinuteKLine(code, 15, 200);
    case "5":
      return fetchMinuteKLine(code, 5, 200);
    case "1":
      return fetchMinuteKLine(code, 1, 200);
    default:
      return fetchDailyKLine(code, start, end);
  }
}

export interface QuoteInfo {
  name: string;
  price: number;
  change: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  turnover: number;
  bid1: number;
  bid1Volume: number;
  ask1: number;
  ask1Volume: number;
}

function buildFallbackQuote(code: string, latest: OHLCV | null): QuoteInfo {
  const price = latest?.close ?? 0;
  const prev = latest?.open ?? price;
  return {
    name: code,
    price,
    change: prev ? ((price - prev) / prev) * 100 : 0,
    open: latest?.open ?? price,
    high: latest?.high ?? price,
    low: latest?.low ?? price,
    prevClose: prev,
    volume: latest?.volume ?? 0,
    turnover: 0,
    bid1: price,
    bid1Volume: 0,
    ask1: price,
    ask1Volume: 0,
  };
}

/**
 * Fetch real-time quote for a convertible bond.
 * Falls back to K-line data if real-time API is blocked (403).
 */
export async function fetchRealtimeQuote(
  code: string,
  fallbackOhlcv?: OHLCV[]
): Promise<QuoteInfo> {
  const nc = normalizeCode(code);
  const url = `https://hq.sinajs.cn/list=${nc}`;

  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        Referer: "https://finance.sina.com.cn/",
      },
    });
    if (!resp.ok) throw new Error(`Quote fetch failed: ${resp.status}`);
    const text = await resp.text();
    const match = text.match(/"([^"]*)"/);
    if (!match || !match[1]) throw new Error("Quote parse error: empty");
    const parts = match[1].split(",");

    // Sina CB: name,open,prevClose,currPrice,high,low,bid1,ask1,volume,turnover,...,date,time,status
    const name = parts[0]?.trim();
    if (!name || name === "") throw new Error("Quote parse error: no name");

    return {
      name,
      price: parseFloat(parts[3] || "0"),
      change: parseFloat(parts[2] || "0")
        ? ((parseFloat(parts[3] || "0") - parseFloat(parts[2] || "0")) /
            parseFloat(parts[2] || "1")) *
          100
        : 0,
      open: parseFloat(parts[1] || "0"),
      high: parseFloat(parts[4] || "0"),
      low: parseFloat(parts[5] || "0"),
      prevClose: parseFloat(parts[2] || "0"),
      volume: parseFloat(parts[8] || "0"),
      turnover: parseFloat(parts[9] || "0"),
      bid1: parseFloat(parts[6] || "0"),
      bid1Volume: parseFloat(parts[10] || "0"),
      ask1: parseFloat(parts[7] || "0"),
      ask1Volume: parseFloat(parts[20] || "0"),
    };
  } catch (e: any) {
    console.warn(`[bond-data] Quote fetch failed for ${nc}, using K-line fallback:`, e.message);
    const latest = fallbackOhlcv && fallbackOhlcv.length > 0
      ? fallbackOhlcv[fallbackOhlcv.length - 1]
      : null;
    return buildFallbackQuote(nc, latest);
  }
}
