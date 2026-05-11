import {
  mysqlTable,
  serial,
  varchar,
  text,
  timestamp,
  json,
} from "drizzle-orm/mysql-core";

export const apiConfigs = mysqlTable("api_configs", {
  id: serial("id").primaryKey(),
  provider: varchar("provider", { length: 32 }).notNull().default("deepseek"),
  apiKey: varchar("api_key", { length: 512 }).notNull(),
  baseUrl: varchar("base_url", { length: 512 }).default("https://api.deepseek.com"),
  deepModel: varchar("deep_model", { length: 64 }).default("deepseek-chat"),
  quickModel: varchar("quick_model", { length: 64 }).default("deepseek-chat"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const cbAnalyses = mysqlTable("cb_analyses", {
  id: serial("id").primaryKey(),
  bondCode: varchar("bond_code", { length: 16 }).notNull(),
  bondName: varchar("bond_name", { length: 64 }),
  timeFrame: varchar("time_frame", { length: 8 }).notNull().default("day"),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  technicalReport: text("technical_report"),
  premiumReport: text("premium_report"),
  redemptionReport: text("redemption_report"),
  t0TimingReport: text("t0_timing_report"),
  investmentPlan: text("investment_plan"),
  traderPlan: text("trader_plan"),
  finalDecision: text("final_decision"),
  indicators: json("indicators"),
  rawData: json("raw_data"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});
