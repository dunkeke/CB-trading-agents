import { createRouter, publicQuery } from "./middleware";
import { analysisRouter } from "./routers/analysis";
import { configRouter } from "./routers/config";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  analysis: analysisRouter,
  config: configRouter,
});

export type AppRouter = typeof appRouter;
