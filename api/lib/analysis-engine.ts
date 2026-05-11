/**
 * Convertible Bond Multi-Agent Analysis Engine
 *
 * Analysts:
 *   1. Technical Analyst        - price action, support/resistance, pattern
 *   2. Premium Analyst          - 转股溢价率, 转股价值, 债底保护
 *   3. Redemption Analyst       - 强赎博弈, 下修博弈, 到期策略
 *   4. T0 Timing Analyst        - 分钟级 MACD, 九转序列, KDJ, 日内择时
 *
 * Then: Bull/Bear debate → Research Manager → Trader → Risk debate → Portfolio Manager
 */

import OpenAI from "openai";
import type { OHLCV, TimeFrame, QuoteInfo } from "./bond-data";
import {
  computeAllIndicators,
  formatPriceData,
  formatIndicatorsLatest,
} from "./tech-indicators";
import type { LatestIndicators } from "./tech-indicators";

export interface AnalysisConfig {
  apiKey: string;
  baseUrl: string;
  deepModel: string;
  quickModel: string;
}

export interface AnalysisResult {
  bondCode: string;
  bondName: string;
  timeFrame: TimeFrame;
  technicalReport: string;
  premiumReport: string;
  redemptionReport: string;
  t0TimingReport: string;
  investmentPlan: string;
  traderPlan: string;
  finalDecision: string;
  indicators: LatestIndicators;
  rawData: {
    priceSummary: string;
    indicatorSummary: string;
    quoteInfo: string;
  };
}

function createClient(config: AnalysisConfig) {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
}

async function chat(
  client: OpenAI,
  model: string,
  system: string,
  user: string,
  temperature = 0.3
): Promise<string> {
  const resp = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature,
    max_tokens: 4000,
  });
  return resp.choices[0]?.message?.content || "";
}

function timeFrameLabel(tf: TimeFrame): string {
  const map: Record<string, string> = {
    "1": "1分钟",
    "5": "5分钟",
    "15": "15分钟",
    "30": "30分钟",
    "60": "60分钟",
    day: "日线",
  };
  return map[tf] || tf;
}

export async function runCBAnalysis(
  bondCode: string,
  bondName: string,
  timeFrame: TimeFrame,
  ohlcv: OHLCV[],
  quote: QuoteInfo,
  config: AnalysisConfig
): Promise<AnalysisResult> {
  if (ohlcv.length < 20) {
    throw new Error(`Insufficient data: only ${ohlcv.length} bars for ${bondCode}`);
  }

  const client = createClient(config);
  const { indicators: _, latest } = computeAllIndicators(ohlcv);
  const tfLabel = timeFrameLabel(timeFrame);
  const priceStr = formatPriceData(ohlcv, 50);
  const indStr = formatIndicatorsLatest(latest);

  const baseContext = [
    `可转债: ${bondName} (${bondCode})`,
    `分析周期: ${tfLabel}`,
    `最新行情: 价=${quote.price} 涨跌=${quote.change.toFixed(2)}% 开=${quote.open} 高=${quote.high} 低=${quote.low} 昨收=${quote.prevClose} 量=${quote.volume} 额=${quote.turnover}`,
    `\nK线数据:\n${priceStr}`,
    `\n技术指标快照: ${indStr}`,
  ].join("\n");

  // 1. T0 Timing Analyst (most important for CB)
  const t0TimingReport = await chat(
    client, config.quickModel,
    `你是可转债高频T+0择时策略师。你的核心任务是日内择时和波段择时。
重点分析以下指标信号：
1. MACD柱状图方向、金叉死叉、底背离/顶背离
2. 九转序列(TD Sequential)：顶部九转(卖)和底部九转(买)的计数状态
3. KDJ金叉死叉、超买(>80)超卖(<20)状态
4. RSI超买超卖
5. 布林带收口/开口、价格位置(中轨/上轨/下轨)
6. SMA均线排列(多头排列/空头排列)
结合T+0可日内回转的交易特性，给出明确的择时信号。
用中文回答，输出markdown格式。`,
    `${baseContext}\n\n请输出${tfLabel}级别的T+0择时分析报告。`
  );

  // 2. Technical Analyst
  const technicalReport = await chat(
    client, config.quickModel,
    `你是可转债技术分析师。分析价格形态、支撑阻力位、趋势结构、成交量变化。
结合${tfLabel}周期的特点，判断当前处于什么趋势阶段(上涨/下跌/震荡)。
用中文回答，输出markdown格式，包含关键价位和形态判断。`,
    `${baseContext}\n\nT0择时观点: ${t0TimingReport.slice(0, 500)}\n\n请输出技术分析报告。`
  );

  // 3. Premium Analyst (CB-specific)
  const premiumReport = await chat(
    client, config.quickModel,
    `你是可转债估值分析师。你需要分析以下维度：
1. 转股溢价率：当前价格相对转股价值的溢价水平，判断是否高估/低估
2. 债底保护：纯债价值提供的下行保护空间
3. 股性vs债性平衡：当前偏股还是偏债
4. 与正股的联动关系
5. 波动率特征：适合T+0套利还是趋势跟踪
给出估值判断和交易启示。
用中文回答，输出markdown格式。`,
    `${baseContext}\n\n最新行情: 价=${quote.price} 昨收=${quote.prevClose}\n\n请输出转股溢价与估值分析报告。`
  );

  // 4. Redemption Analyst (CB-specific)
  const redemptionReport = await chat(
    client, config.quickModel,
    `你是可转债条款博弈分析师。分析以下维度：
1. 强赎博弈：价格是否接近强赎触发线(通常130元)，强赎风险与收益
2. 下修博弈：转股价下修的可能性，下修对价格的提振效应
3. 到期策略：到期兑付的纯债收益率
4. 回售保护：回售条款提供的安全边际
5. 正股基本面关联
给出条款博弈视角的交易建议。
用中文回答，输出markdown格式。`,
    `${baseContext}\n\n最新价格=${quote.price}，请结合历史价格走势分析强赎/下修博弈机会。`
  );

  // 5. Bull Researcher
  const bullCase = await chat(
    client, config.quickModel,
    `你是可转债的看多研究员。请做最强的看多论证。`,
    `${baseContext}\n\n技术分析: ${technicalReport.slice(0, 600)}\n\nT0择时: ${t0TimingReport.slice(0, 600)}\n\n估值分析: ${premiumReport.slice(0, 600)}\n\n请输出看多报告。`
  );

  // 6. Bear Researcher
  const bearCase = await chat(
    client, config.quickModel,
    `你是可转债的看空研究员。请做最强的看空论证。`,
    `${baseContext}\n\n看多观点: ${bullCase.slice(0, 600)}\n\n技术分析: ${technicalReport.slice(0, 400)}\n\n请输出看空报告。`
  );

  // 7. Research Manager (deep model)
  const investmentPlan = await chat(
    client, config.deepModel,
    `你是可转债研究主管。综合多空观点，给出5级评级(强烈买入/买入/持有/卖出/强烈卖出)。
考虑到可转债T+0特性，给出:
1. 明确的方向性判断
2. 入场价位区间
3. 止损位
4. 目标位
5. 仓位建议
6. 持有周期
用中文回答，输出markdown格式。`,
    `看多:\n${bullCase}\n\n看空:\n${bearCase}\n\n可转债: ${bondName}(${bondCode}) ${tfLabel}\n\n请输出投资计划。`
  );

  // 8. Trader
  const traderPlan = await chat(
    client, config.quickModel,
    `你是可转债交易员。将研究主管的计划转化为具体的交易执行方案。
考虑T+0回转特性，给出日内高抛低吸的具体策略。
用中文回答，输出markdown格式。`,
    `${baseContext}\n\n投资计划: ${investmentPlan}\n\n请输出交易执行方案。`
  );

  // 9. Risk + PM combined (deep model)
  const finalDecision = await chat(
    client, config.deepModel,
    `你是可转债组合投资经理。你拥有最终决策权。
你需要听取三个风险声音：
- 激进派：主张重仓参与，止损设宽
- 保守派：主张轻仓试探，严格止损
- 中性派：平衡两者，主张适中仓位

综合所有信息后，给出最终的投资决策，包含：
1. 评级(强烈买入/买入/持有/卖出/强烈卖出)
2. 执行摘要(2-4句)
3. 投资逻辑
4. 价格目标
5. 时间框架
6. 风险因素
7. T+0操作建议
用中文回答，输出markdown格式。`,
    `交易方案: ${traderPlan}\n\n投资计划: ${investmentPlan}\n\nT0择时: ${t0TimingReport.slice(0, 500)}\n\n请输出最终投资决策。`
  );

  return {
    bondCode,
    bondName,
    timeFrame,
    technicalReport,
    premiumReport,
    redemptionReport,
    t0TimingReport,
    investmentPlan,
    traderPlan,
    finalDecision,
    indicators: latest,
    rawData: {
      priceSummary: `${quote.price} (${quote.change.toFixed(2)}%)`,
      indicatorSummary: indStr,
      quoteInfo: `${quote.name} O=${quote.open} H=${quote.high} L=${quote.low} V=${quote.volume}`,
    },
  };
}
