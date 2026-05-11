import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { apiConfigs } from "@db/schema";
import { eq } from "drizzle-orm";

export const configRouter = createRouter({
  get: publicQuery.query(async () => {
    const db = getDb();
    const rows = await db.select().from(apiConfigs).orderBy(apiConfigs.id).limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      provider: row.provider,
      baseUrl: row.baseUrl,
      deepModel: row.deepModel,
      quickModel: row.quickModel,
      hasKey: !!row.apiKey && row.apiKey.length > 0,
    };
  }),

  upsert: publicQuery
    .input(
      z.object({
        provider: z.string().default("deepseek"),
        apiKey: z.string().min(1),
        baseUrl: z.string().default("https://api.deepseek.com"),
        deepModel: z.string().default("deepseek-chat"),
        quickModel: z.string().default("deepseek-chat"),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = await db.select().from(apiConfigs).orderBy(apiConfigs.id).limit(1);
      if (existing.length > 0) {
        await db
          .update(apiConfigs)
          .set({
            provider: input.provider,
            apiKey: input.apiKey,
            baseUrl: input.baseUrl,
            deepModel: input.deepModel,
            quickModel: input.quickModel,
            updatedAt: new Date(),
          })
          .where(eq(apiConfigs.id, existing[0].id));
        return { success: true, id: existing[0].id };
      }
      const result = await db.insert(apiConfigs).values({
        provider: input.provider,
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        deepModel: input.deepModel,
        quickModel: input.quickModel,
      });
      return { success: true, id: Number(result[0].insertId) };
    }),
});
