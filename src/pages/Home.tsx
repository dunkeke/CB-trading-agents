import { ApiConfigForm } from "@/components/ApiConfigForm";
import { AnalysisRunner } from "@/components/AnalysisRunner";
import { HistoryList } from "@/components/HistoryList";
import { TrendingUp, BarChart3, RotateCcw, Zap } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <RotateCcw className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">CB Trading Agents</h1>
              <p className="text-xs text-muted-foreground">可转债 T+0 多Agent智能分析引擎</p>
            </div>
          </div>
          <div className="hidden items-center gap-4 text-sm text-muted-foreground sm:flex">
            <span className="flex items-center gap-1"><Zap className="h-4 w-4" />DeepSeek</span>
            <span className="flex items-center gap-1"><BarChart3 className="h-4 w-4" />新浪/腾讯数据</span>
            <span className="flex items-center gap-1"><TrendingUp className="h-4 w-4" />T+0择时</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Pipeline */}
        <div className="mb-6 rounded-lg border bg-card p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">分析流水线</div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {["T+0择时","技术分析","转股溢价","强赎/下修","多空辩论","研究主管","交易员","风险辩论","投资经理"].map((s, i) => (
              <div key={s} className="flex items-center gap-1.5">
                <span className="rounded bg-primary/10 px-2 py-0.5 font-medium text-primary">{s}</span>
                {i < 8 && <span className="text-muted-foreground">→</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            <ApiConfigForm />
            <AnalysisRunner />
          </div>
          <div className="lg:col-span-2">
            <HistoryList />
          </div>
        </div>
      </main>
    </div>
  );
}
