import { useParams, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { ReportViewer } from "@/components/ReportViewer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, AlertCircle } from "lucide-react";

export default function Analysis() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const aid = parseInt(id || "0", 10);
  const q = trpc.analysis.get.useQuery({ id: aid }, { enabled: aid > 0 });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/")}><ArrowLeft className="mr-1 h-4 w-4" />返回</Button>
          <h1 className="text-lg font-bold">分析报告</h1>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {q.isLoading && <div className="space-y-3"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>}
        {q.isError && <div className="flex flex-col items-center py-12 text-red-600"><AlertCircle className="mb-2 h-8 w-8" /><p>加载失败</p></div>}
        {q.data && <ReportViewer data={q.data} />}
      </main>
    </div>
  );
}
