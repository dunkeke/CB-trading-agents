import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, BarChart3 } from "lucide-react";

const TF_BADGE: Record<string, string> = { "1": "1分", "5": "5分", "15": "15分", "30": "30分", "60": "60分", day: "日线" };
const STATUS_STYLE: Record<string, string> = {
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

export function HistoryList() {
  const navigate = useNavigate();
  const list = trpc.analysis.list.useQuery();

  return (
    <Card className="h-full">
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4" />历史分析</CardTitle></CardHeader>
      <CardContent>
        {list.isLoading && <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>}
        {list.data?.length === 0 && (
          <div className="flex flex-col items-center py-8 text-muted-foreground"><BarChart3 className="mb-2 h-8 w-8 opacity-50" /><p className="text-sm">暂无分析记录，启动你的第一个分析</p></div>
        )}
        {list.data && list.data.length > 0 && (
          <ScrollArea className="h-[420px]">
            <div className="space-y-1.5">
              {list.data.map((item) => (
                <button key={item.id} onClick={() => navigate(`/analysis/${item.id}`)} className="flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-left transition-colors hover:bg-muted">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{item.bondName || item.bondCode}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{TF_BADGE[item.timeFrame || "day"]}</Badge>
                  </div>
                  <Badge variant="secondary" className={`text-[10px] ${STATUS_STYLE[item.status || "pending"]}`}>{item.status}</Badge>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
