import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { cbAnalyses, apiConfigs } from "@db/schema";
import { eq, desc } from "drizzle-orm";
import { fetchKLine, fetchRealtimeQuote } from "../lib/bond-data";
import { runCBAnalysis } from "../lib/analysis-engine";
import type { TimeFrame, QuoteInfo } from "../lib/bond-data";

export const analysisRouter = createRouter({
  list: publicQuery.query(async () => {
    const db = getDb();
    return db
      .select({
        id: cbAnalyses.id,
        bondCode: cbAnalyses.bondCode,
        bondName: cbAnalyses.bondName,
        timeFrame: cbAnalyses.timeFrame,
        status: cbAnalyses.status,
        finalDecision: cbAnalyses.finalDecision,
        createdAt: cbAnalyses.createdAt,
      })
      .from(cbAnalyses)
      .orderBy(desc(cbAnalyses.createdAt))
      .limit(100);
  }),

  get: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(cbAnalyses)
        .where(eq(cbAnalyses.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),

  run: publicQuery
    .input(
      z.object({
        bondCode: z.string().min(6).max(12),
        bondName: z.string().optional(),
        timeFrame: z.enum(["1", "5", "15", "30", "60", "day"]).default("15"),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();

      const configs = await db
        .select()
        .from(apiConfigs)
        .orderBy(apiConfigs.id)
        .limit(1);
      if (configs.length === 0) {
        throw new Error("请先配置DeepSeek API密钥");
      }
      const config = configs[0];

      // Create record
      const insertResult = await db.insert(cbAnalyses).values({
        bondCode: input.bondCode,
        bondName: input.bondName || input.bondCode,
        timeFrame: input.timeFrame,
        status: "running",
      });
      const analysisId = Number(insertResult[0].insertId);

      try {
        // Fetch OHLCV first, then use it as fallback for real-time quote
        const ohlcv = await fetchKLine(input.bondCode, input.timeFrame as TimeFrame);
        if (ohlcv.length < 20) {
          throw new Error(`数据不足: 仅获取到${ohlcv.length}根K线, 需要至少20根`);
        }

        const quote: QuoteInfo = await fetchRealtimeQuote(input.bondCode, ohlcv);
        // Use bond name from input if quote name is just the code
        const displayName = (quote.name && quote.name !== input.bondCode)
          ? quote.name
          : (input.bondName || input.bondCode);

        const result = await runCBAnalysis(
          input.bondCode,
          displayName,
          input.timeFrame as TimeFrame,
          ohlcv,
          quote,
          {
            apiKey: config.apiKey,
            baseUrl: config.baseUrl || "https://api.deepseek.com",
            deepModel: config.deepModel || "deepseek-chat",
            quickModel: config.quickModel || "deepseek-chat",
          }
        );

        await db
          .update(cbAnalyses)
          .set({
            bondName: result.bondName,
            status: "completed",
            technicalReport: result.technicalReport,
            premiumReport: result.premiumReport,
            redemptionReport: result.redemptionReport,
            t0TimingReport: result.t0TimingReport,
            investmentPlan: result.investmentPlan,
            traderPlan: result.traderPlan,
            finalDecision: result.finalDecision,
            indicators: result.indicators as any,
            rawData: result.rawData as any,
            updatedAt: new Date(),
          })
          .where(eq(cbAnalyses.id, analysisId));

        return { success: true, id: analysisId };
      } catch (err: any) {
        await db
          .update(cbAnalyses)
          .set({
            status: "failed",
            finalDecision: `错误: ${err.message || "未知错误"}`,
            updatedAt: new Date(),
          })
          .where(eq(cbAnalyses.id, analysisId));
        throw err;
      }
    }),
});
