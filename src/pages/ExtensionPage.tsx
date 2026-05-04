import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chrome, Copy, Download, RefreshCw, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

export default function ExtensionPage() {
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const ws = workspaces.find((w) => w.id === currentWorkspaceId);
  const [code, setCode] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (!currentWorkspaceId) return;
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Sessão expirada — faça login novamente.");
        return;
      }
      const payload = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at ? session.expires_at * 1000 : Date.now() + 50 * 60 * 1000,
        workspace_id: currentWorkspaceId,
      };
      // base64 to make it a single tidy string
      const b64 = btoa(JSON.stringify(payload));
      setCode(b64);
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    setCode("");
  }, [currentWorkspaceId]);

  const copy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Código copiado!");
  };

  const downloadZip = async () => {
    try {
      const res = await fetch("/taskflow-tracker.zip");
      if (!res.ok) throw new Error("Falha ao baixar");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "taskflow-tracker.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-3">
            <Chrome className="h-8 w-8 text-primary" />
            Extensão do Chrome
          </h1>
          <p className="text-muted-foreground text-sm mt-2">
            Capture o tempo logado, idle e janela ativa em qualquer site — não só dentro do TaskFlow.
            Os dados aparecem no painel <strong>Produtividade</strong>.
          </p>
        </div>

        {/* Step 1 */}
        <Card className="p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
              1
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Baixe a extensão</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Descompacte o arquivo, abra <code className="text-xs bg-muted px-1 rounded">chrome://extensions</code>,
                ative o <strong>Modo do desenvolvedor</strong> e clique em
                <strong> Carregar sem compactação</strong> apontando para a pasta descompactada.
              </p>
              <Button onClick={downloadZip} className="mt-3" variant="default">
                <Download className="h-4 w-4 mr-2" />
                Baixar TaskFlow Tracker (.zip)
              </Button>
            </div>
          </div>
        </Card>

        {/* Step 2 */}
        <Card className="p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
              2
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Gere seu código de pareamento</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Pareando o workspace <strong>{ws?.name || "—"}</strong>. O código contém seu token de
                acesso — não compartilhe.
              </p>
              <Button
                onClick={generate}
                className="mt-3"
                variant="outline"
                disabled={generating || !currentWorkspaceId}
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {code ? "Gerar novo código" : "Gerar código"}
              </Button>

              {code && (
                <div className="mt-3 space-y-2">
                  <textarea
                    readOnly
                    value={code}
                    className="w-full h-24 p-3 rounded-md bg-muted text-xs font-mono resize-none border border-border"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button onClick={copy} size="sm" variant="secondary">
                    {copied ? (
                      <><Check className="h-4 w-4 mr-2" /> Copiado</>
                    ) : (
                      <><Copy className="h-4 w-4 mr-2" /> Copiar código</>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Step 3 */}
        <Card className="p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
              3
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Conecte na extensão</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Clique no ícone <strong>TaskFlow Tracker</strong> na barra do Chrome, cole o código e
                aperte <strong>Conectar</strong>. Pronto — heartbeats serão enviados a cada 60s e o
                Chrome detectará idle automaticamente após 5min sem atividade.
              </p>
            </div>
          </div>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          O código de pareamento expira em ~1h, mas a extensão renova o acesso automaticamente
          enquanto você estiver logado no TaskFlow.
        </p>
      </div>
    </div>
  );
}
