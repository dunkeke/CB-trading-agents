import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Activity, AlertCircle, Loader2, Zap } from "lucide-react";

const TIMEFRAMES = [
  { value: "1", label: "1分钟 (超短)" },
  { value: "5", label: "5分钟 (短线)" },
  { value: "15", label: "15分钟 (波段)" },
  { value: "30", label: "30分钟 (趋势)" },
  { value: "60", label: "60分钟 (大波段)" },
  { value: "day", label: "日线 (趋势)" },
];

export function AnalysisRunner() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const configQuery = trpc.config.get.useQuery();

  const [code, setCode] = useState("sz128106");
  const [name, setName] = useState("");
  const [tf, setTf] = useState("15");
  const [progress, setProgress] = useState(0);

  const run = trpc.analysis.run.useMutation({
    onSuccess: (d) => { setProgress(100); utils.analysis.list.invalidate(); setTimeout(() => navigate(`/analysis/${d.id}`), 400); },
  });

  const handleRun = () => {
    if (!code.trim()) return;
    setProgress(8);
    const iv = setInterval(() => setProgress((p) => Math.min(p + 4, 92)), 1800);
    run.mutate({ bondCode: code.trim(), bondName: name.trim() || undefined, timeFrame: tf as any }, {
      onSettled: () => clearInterval(iv),
    });
  };

  const isConfigured = configQuery.data?.hasKey ?? false;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4" />
          启动可转债分析
        </CardTitle>
        <CardDescription>输入可转债代码，选择分钟级/日线周期</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isConfigured && (
          <div className="flex items-center gap-1 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
            <AlertCircle className="h-3 w-3" />请先配置 API Key
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs">可转债代码</Label>
          <Input placeholder="如: sz128106 或 sh113052" value={code} onChange={(e) => setCode(e.target.value)} className="h-9 font-mono" />
          <p className="text-[10px] text-muted-foreground">格式: sz+6位 或 sh+6位，如 sz128106、sh113052</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">转债名称 (可选)</Label>
          <Input placeholder="如: 华统转债" value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">分析周期</Label>
          <Select value={tf} onValueChange={setTf}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIMEFRAMES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  <div className="flex items-center gap-2">
                    {t.value === "1" || t.value === "5" ? <Zap className="h-3 w-3 text-amber-500" /> : <Activity className="h-3 w-3" />}
                    {t.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {run.isPending && (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />多Agent分析中...
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        )}
        {run.error && (
          <div className="rounded bg-red-50 px-2 py-1 text-xs text-red-600">{run.error.message}</div>
        )}
        <Button onClick={handleRun} disabled={!isConfigured || run.isPending || !code.trim()} className="w-full h-9">
          {run.isPending ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" />分析中...</> : "启动多Agent分析"}
        </Button>
      </CardContent>
    </Card>
  );
}
