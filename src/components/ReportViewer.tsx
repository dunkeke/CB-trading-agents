import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BarChart3, TrendingUp, TrendingDown, Minus, Zap, Shield, Target, Clock, Percent, RotateCcw } from "lucide-react";

interface ReportData {
  bondCode: string;
  bondName: string | null;
  timeFrame: string | null;
  technicalReport: string | null;
  premiumReport: string | null;
  redemptionReport: string | null;
  t0TimingReport: string | null;
  investmentPlan: string | null;
  traderPlan: string | null;
  finalDecision: string | null;
  indicators: any;
  rawData: any;
  status: string | null;
}

function extractRating(text: string): { label: string; color: string; icon: any } {
  const t = text.toLowerCase();
  if (t.includes("\u5F3A\u70C8\u4E70\u5165")) return { label: "\u5F3A\u70C8\u4E70\u5165", color: "bg-emerald-600", icon: TrendingUp };
  if (t.includes("\u5F3A\u70C8\u5356\u51FA")) return { label: "\u5F3A\u70C8\u5356\u51FA", color: "bg-red-600", icon: TrendingDown };
  if (t.includes("\u4E70\u5165")) return { label: "\u4E70\u5165", color: "bg-green-500", icon: TrendingUp };
  if (t.includes("\u5356\u51FA")) return { label: "\u5356\u51FA", color: "bg-orange-500", icon: TrendingDown };
  return { label: "\u6301\u6709", color: "bg-yellow-500", icon: Minus };
}

const TF_LABEL: Record<string, string> = { "1": "1\u5206\u949F", "5": "5\u5206\u949F", "15": "15\u5206\u949F", "30": "30\u5206\u949F", "60": "60\u5206\u949F", day: "\u65E5\u7EBF" };

export function ReportViewer({ data }: { data: ReportData }) {
  const { label, color, icon: Icon } = extractRating(data.finalDecision || "");
  const ind = data.indicators as Record<string, any> | null;

  const sections = [
    { title: "T+0 \u62E9\u65F6\u5206\u6790", icon: <Zap className="h-4 w-4 text-amber-500" />, content: data.t0TimingReport, accent: "border-l-amber-500" },
    { title: "\u6280\u672F\u5206\u6790", icon: <BarChart3 className="h-4 w-4 text-blue-500" />, content: data.technicalReport, accent: "border-l-blue-500" },
    { title: "\u8F6C\u80A1\u6EA2\u4EF7\u5206\u6790", icon: <Percent className="h-4 w-4 text-purple-500" />, content: data.premiumReport, accent: "border-l-purple-500" },
    { title: "\u5F3A\u8D4E/\u4E0B\u4FEE\u535A\u5F08", icon: <RotateCcw className="h-4 w-4 text-rose-500" />, content: data.redemptionReport, accent: "border-l-rose-500" },
  ];

  const star = "\u2605";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{data.bondName || data.bondCode}</h1>
          <p className="text-sm text-muted-foreground">{data.bondCode} &middot; {TF_LABEL[data.timeFrame || "day"] || data.timeFrame}</p>
        </div>
        {data.status === "completed" && (
          <Badge className={`${color} text-white px-4 py-1 text-sm font-bold gap-1`}>
            <Icon className="h-4 w-4" />{label}
          </Badge>
        )}
      </div>

      {ind && (
        <Card className="bg-muted/40">
          <CardContent className="py-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4 md:grid-cols-6">
              {[
                ["MACD", ind.macdHistogram?.toFixed(3)],
                ["RSI6", ind.rsi6?.toFixed(1)],
                ["RSI12", ind.rsi12?.toFixed(1)],
                ["K", ind.k?.toFixed(1)],
                ["D", ind.d?.toFixed(1)],
                ["J", ind.j?.toFixed(1)],
                ["\u5E03\u6797\u4E0A\u8F68", ind.bollUpper?.toFixed(2)],
                ["\u5E03\u6797\u4E2D\u8F68", ind.bollMiddle?.toFixed(2)],
                ["\u5E03\u6797\u4E0B\u8F68", ind.bollLower?.toFixed(2)],
                ["ATR", ind.atr14?.toFixed(3)],
                ["\u4E5D\u8F6C\u4E70", `${ind.tdBuyCount || 0}${ind.tdBuy9 ? star : ""}`],
                ["\u4E5D\u8F6C\u5356", `${ind.tdSellCount || 0}${ind.tdSell9 ? star : ""}`],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-mono font-medium">{v}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.rawData && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          <span>\u4EF7\u683C: {data.rawData.priceSummary}</span>
          <span>{data.rawData.quoteInfo}</span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((s) => (
          <Card key={s.title} className={`border-l-4 ${s.accent}`}>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm">{s.icon}{s.title}</CardTitle>
            </CardHeader>
            <CardContent className="prose dark:prose-invert prose-sm max-h-96 overflow-y-auto max-w-none pb-4">
              {s.content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.content}</ReactMarkdown>
              ) : (
                <p className="text-muted-foreground">\u65E0\u62A5\u544A</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      {data.investmentPlan && (
        <Card className="border-l-4 border-l-indigo-500">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm"><Target className="h-4 w-4" />\u6295\u8D44\u8BA1\u5212</CardTitle>
          </CardHeader>
          <CardContent className="prose dark:prose-invert prose-sm max-w-none pb-4">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.investmentPlan}</ReactMarkdown>
          </CardContent>
        </Card>
      )}

      {data.traderPlan && (
        <Card className="border-l-4 border-l-cyan-500">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm"><Clock className="h-4 w-4" />\u4EA4\u6613\u6267\u884C\u65B9\u6848</CardTitle>
          </CardHeader>
          <CardContent className="prose dark:prose-invert prose-sm max-w-none pb-4">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.traderPlan}</ReactMarkdown>
          </CardContent>
        </Card>
      )}

      {data.finalDecision && (
        <Card className="border-2 border-primary">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-base"><Shield className="h-5 w-5" />\u6700\u7EC8\u6295\u8D44\u51B3\u7B56</CardTitle>
          </CardHeader>
          <CardContent className="prose dark:prose-invert max-w-none pb-4">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.finalDecision}</ReactMarkdown>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
