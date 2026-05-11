import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KeyRound, CheckCircle, AlertCircle } from "lucide-react";

export function ApiConfigForm() {
  const utils = trpc.useUtils();
  const configQuery = trpc.config.get.useQuery();
  const upsert = trpc.config.upsert.useMutation({
    onSuccess: () => { utils.config.get.invalidate(); setSaved(true); setTimeout(() => setSaved(false), 3000); },
  });

  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [deepModel, setDeepModel] = useState("deepseek-chat");
  const [quickModel, setQuickModel] = useState("deepseek-chat");
  const [saved, setSaved] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" />
          DeepSeek API 配置
        </CardTitle>
        <CardDescription>支持 DeepSeek 或任意 OpenAI 兼容接口</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {configQuery.data?.hasKey && (
          <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400">
            <CheckCircle className="mr-1 h-3 w-3" />已配置
          </Badge>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs">API Key</Label>
          <Input type="password" placeholder="sk-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Base URL</Label>
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="h-9" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">深度模型</Label>
            <Input value={deepModel} onChange={(e) => setDeepModel(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">快速模型</Label>
            <Input value={quickModel} onChange={(e) => setQuickModel(e.target.value)} className="h-9" />
          </div>
        </div>
        {upsert.error && (
          <div className="flex items-center gap-1 rounded bg-red-50 px-2 py-1 text-xs text-red-600">
            <AlertCircle className="h-3 w-3" />{upsert.error.message}
          </div>
        )}
        {saved && (
          <div className="flex items-center gap-1 rounded bg-green-50 px-2 py-1 text-xs text-green-600">
            <CheckCircle className="h-3 w-3" />保存成功
          </div>
        )}
        <Button onClick={() => apiKey.trim() && upsert.mutate({ apiKey: apiKey.trim(), baseUrl, deepModel, quickModel })} disabled={!apiKey.trim() || upsert.isPending} className="w-full h-9">
          {upsert.isPending ? "保存中..." : "保存配置"}
        </Button>
      </CardContent>
    </Card>
  );
}
