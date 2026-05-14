import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, CalendarIcon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

type Row = {
  day: string;
  gc_user_id: string;
  gc_user_name: string;
  vendas_count: number; vendas_valor: number;
  os_count: number; os_valor: number;
  orcamentos_count: number; orcamentos_valor: number;
  nfs_count: number; nfs_valor: number;
  entrada_notas: number;
  separacao_pecas: number;
  entrega_pecas: number;
  tratativa_incorreta: number;
  cadastro_produto: number;
  abertura_os: number;
};

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);

const fmtDay = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y.slice(2)}`;
};

const toISODate = (d: Date | undefined) => d ? format(d, "yyyy-MM-dd") : "";

const PRESET_DAYS: Record<string, number> = {
  "1": 1,
  "7": 7,
  "14": 14,
  "30": 30,
  "60": 60,
  "90": 90,
  "180": 180,
  "365": 365,
};

export function GcLogTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStartedAt, setSyncStartedAt] = useState<number | null>(null);
  const [syncElapsed, setSyncElapsed] = useState(0);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStage, setSyncStage] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [lastSyncBuckets, setLastSyncBuckets] = useState<number | null>(null);
  const [preset, setPreset] = useState<string>("7");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(subDays(new Date(), 7));
  const [dateTo, setDateTo] = useState<Date | undefined>(new Date());
  const [selectedUser, setSelectedUser] = useState<string>("all");

  const applyPreset = (key: string) => {
    setPreset(key);
    if (key === "custom") return;
    const days = PRESET_DAYS[key] ?? 7;
    setDateFrom(subDays(new Date(), days));
    setDateTo(new Date());
  };

  const isCustom = preset === "custom";

  const load = async () => {
    setLoading(true);
    const fromStr = toISODate(dateFrom) || format(subDays(new Date(), 7), "yyyy-MM-dd");
    const toStr = toISODate(dateTo) || format(new Date(), "yyyy-MM-dd");
    const { data, error } = await supabase
      .from("gc_daily_activity")
      .select("*")
      .gte("day", fromStr)
      .lte("day", toStr)
      .order("day", { ascending: false })
      .order("gc_user_name", { ascending: true });
    if (error) toast.error("Erro ao carregar Log GC: " + error.message);
    else setRows((data as Row[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [dateFrom, dateTo]);

  // Carrega status atual ao montar (caso outra aba tenha disparado)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("gc_sync_status").select("*").eq("id", "current").maybeSingle();
      if (cancelled || !data) return;
      if (data.status === "running") {
        setSyncing(true);
        setSyncStartedAt(data.started_at ? new Date(data.started_at).getTime() : Date.now());
        setSyncStage(data.stage ?? "Sincronizando...");
        setSyncProgress(data.progress ?? 0);
      } else if (data.finished_at) {
        setLastSyncAt(new Date(data.finished_at));
        setLastSyncBuckets(data.buckets ?? 0);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Polling enquanto está sincronizando
  useEffect(() => {
    if (!syncing) return;
    const tick = setInterval(() => {
      if (syncStartedAt) setSyncElapsed(Math.floor((Date.now() - syncStartedAt) / 1000));
    }, 500);
    const poll = setInterval(async () => {
      const { data } = await supabase.from("gc_sync_status").select("*").eq("id", "current").maybeSingle();
      if (!data) return;
      setSyncStage(data.stage ?? "");
      setSyncProgress(data.progress ?? 0);
      if (data.status === "done") {
        setSyncProgress(100);
        setSyncing(false);
        setSyncStartedAt(null);
        setLastSyncAt(data.finished_at ? new Date(data.finished_at) : new Date());
        setLastSyncBuckets(data.buckets ?? 0);
        toast.success(`Sincronizado: ${data.buckets ?? 0} registros`);
        load();
      } else if (data.status === "error") {
        setSyncing(false);
        setSyncStartedAt(null);
        toast.error("Falha na sincronização: " + (data.error ?? "erro desconhecido"));
      }
    }, 2000);
    return () => { clearInterval(tick); clearInterval(poll); };
    // eslint-disable-next-line
  }, [syncing, syncStartedAt]);

  const sync = async () => {
    const fromStr = toISODate(dateFrom) || format(subDays(new Date(), 7), "yyyy-MM-dd");
    const toStr = toISODate(dateTo) || format(new Date(), "yyyy-MM-dd");

    setSyncing(true);
    const started = Date.now();
    setSyncStartedAt(started);
    setSyncElapsed(0);
    setSyncProgress(2);
    setSyncStage("Iniciando...");

    const { error } = await supabase.functions.invoke("gc-sync-activity", {
      body: { data_inicio: fromStr, data_fim: toStr },
    });

    if (error) {
      setSyncing(false);
      setSyncStartedAt(null);
      setSyncStage("Erro");
      toast.error("Falha ao iniciar sincronização: " + error.message);
    }
  };

  const uniqueUsers = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (!map.has(r.gc_user_id)) map.set(r.gc_user_id, r.gc_user_name);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (selectedUser === "all") return rows;
    return rows.filter(r => r.gc_user_id === selectedUser);
  }, [rows, selectedUser]);

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of filteredRows) {
      const arr = map.get(r.day) ?? [];
      arr.push(r);
      map.set(r.day, arr);
    }
    return Array.from(map.entries());
  }, [filteredRows]);

  const totals = useMemo(() => {
    return filteredRows.reduce((acc, r) => ({
      vendas_count: acc.vendas_count + r.vendas_count,
      vendas_valor: acc.vendas_valor + Number(r.vendas_valor),
      os_count: acc.os_count + r.os_count,
      os_valor: acc.os_valor + Number(r.os_valor),
      orcamentos_count: acc.orcamentos_count + r.orcamentos_count,
      orcamentos_valor: acc.orcamentos_valor + Number(r.orcamentos_valor),
      nfs_count: acc.nfs_count + r.nfs_count,
      nfs_valor: acc.nfs_valor + Number(r.nfs_valor),
      entrada_notas: acc.entrada_notas + (r.entrada_notas ?? 0),
      separacao_pecas: acc.separacao_pecas + (r.separacao_pecas ?? 0),
      entrega_pecas: acc.entrega_pecas + (r.entrega_pecas ?? 0),
      tratativa_incorreta: acc.tratativa_incorreta + (r.tratativa_incorreta ?? 0),
      cadastro_produto: acc.cadastro_produto + (r.cadastro_produto ?? 0),
      abertura_os: acc.abertura_os + (r.abertura_os ?? 0),
    }), {
      vendas_count: 0, vendas_valor: 0, os_count: 0, os_valor: 0,
      orcamentos_count: 0, orcamentos_valor: 0, nfs_count: 0, nfs_valor: 0,
      entrada_notas: 0, separacao_pecas: 0, entrega_pecas: 0,
      tratativa_incorreta: 0, cadastro_produto: 0, abertura_os: 0,
    });
  }, [filteredRows]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card className="p-3 flex flex-wrap items-center gap-3">
        {/* Preset */}
        <Select value={preset} onValueChange={applyPreset}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Hoje + 1 dia</SelectItem>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="14">Últimos 14 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="60">Últimos 60 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="180">Últimos 180 dias</SelectItem>
            <SelectItem value="365">Últimos 365 dias</SelectItem>
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>

        {/* Custom date range */}
        {isCustom && (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "dd/MM/yyyy", { locale: ptBR }) : <span>De</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={(d) => { setDateFrom(d); if (d && dateTo && d > dateTo) setDateTo(d); }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "dd/MM/yyyy", { locale: ptBR }) : <span>Até</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={(d) => { setDateTo(d); if (d && dateFrom && d < dateFrom) setDateFrom(d); }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </>
        )}

        {/* User filter */}
        <Select value={selectedUser} onValueChange={setSelectedUser}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Filtrar por usuário" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os usuários</SelectItem>
            {uniqueUsers.map(([uid, name]) => (
              <SelectItem key={uid} value={uid}>{name || uid}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={sync} disabled={syncing}>
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Sincronizar GC</span>
        </Button>
      </Card>

      {/* Barra de status da sincronização */}
      {(syncing || lastSyncAt) && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2 gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {syncing && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
              <span className="text-sm font-medium truncate">
                {syncing ? syncStage || "Sincronizando..." : "Última sincronização concluída"}
              </span>
            </div>
            <div className="text-xs text-muted-foreground whitespace-nowrap">
              {syncing
                ? `${syncElapsed}s · ${Math.round(syncProgress)}%`
                : lastSyncAt
                  ? `${format(lastSyncAt, "dd/MM/yy HH:mm:ss")} · ${lastSyncBuckets ?? 0} registros`
                  : ""}
            </div>
          </div>
          <Progress value={syncing ? syncProgress : 100} className="h-2" />
        </Card>
      )}

      {/* Totais do período - Documentos */}
      <Card className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Documentos no período</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Vendas" qty={totals.vendas_count} value={totals.vendas_valor} accent="text-green-500" />
          <Stat label="OS" qty={totals.os_count} value={totals.os_valor} accent="text-blue-500" />
          <Stat label="Orçamentos" qty={totals.orcamentos_count} value={totals.orcamentos_valor} accent="text-amber-500" />
          <Stat label="Notas Fiscais" qty={totals.nfs_count} value={totals.nfs_valor} accent="text-purple-500" />
        </div>
      </Card>

      {/* Totais do período - Atividades operacionais */}
      <Card className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Atividades operacionais no período</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <ActivityStat label="Entrada de notas" qty={totals.entrada_notas} accent="text-emerald-500" />
          <ActivityStat label="Separação de peças" qty={totals.separacao_pecas} accent="text-cyan-500" />
          <ActivityStat label="Entrega de peças" qty={totals.entrega_pecas} accent="text-indigo-500" />
          <ActivityStat label="OS incorreta" qty={totals.tratativa_incorreta} accent="text-rose-500" />
          <ActivityStat label="Cadastro de produto" qty={totals.cadastro_produto} accent="text-fuchsia-500" />
          <ActivityStat label="Abertura de OS" qty={totals.abertura_os} accent="text-orange-500" />
        </div>
      </Card>

      {/* Per-day cards */}
      {loading ? (
        <Card className="p-8 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </Card>
      ) : grouped.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          Nenhum registro do GestãoClick neste período.
        </Card>
      ) : (
        grouped.map(([day, dayRows]) => (
          <Card key={day} className="p-0 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between">
              <div className="font-display font-semibold">{fmtDay(day)}</div>
              <div className="text-xs text-muted-foreground">
                {dayRows.length} {dayRows.length === 1 ? "usuário" : "usuários"}
              </div>
            </div>
            <div className="divide-y divide-border">
              {dayRows.map(r => (
                <div key={`${r.day}-${r.gc_user_id}`} className="px-4 py-3 space-y-2">
                  <div className="font-medium text-sm">{r.gc_user_name}</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <Cell label="Vendas" qty={r.vendas_count} value={r.vendas_valor} />
                    <Cell label="OS" qty={r.os_count} value={r.os_valor} />
                    <Cell label="Orçamentos" qty={r.orcamentos_count} value={r.orcamentos_valor} />
                    <Cell label="NFs" qty={r.nfs_count} value={r.nfs_valor} />
                  </div>
                  {(r.entrada_notas + r.separacao_pecas + r.entrega_pecas + r.tratativa_incorreta + r.cadastro_produto + r.abertura_os) > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 pt-1 border-t border-border/50">
                      <ActivityCell label="Entrada notas" qty={r.entrada_notas} />
                      <ActivityCell label="Separação" qty={r.separacao_pecas} />
                      <ActivityCell label="Entrega" qty={r.entrega_pecas} />
                      <ActivityCell label="OS incorreta" qty={r.tratativa_incorreta} />
                      <ActivityCell label="Cad. produto" qty={r.cadastro_produto} />
                      <ActivityCell label="Abertura OS" qty={r.abertura_os} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function Stat({ label, qty, value, accent }: { label: string; qty: number; value: number; accent: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-display font-semibold ${accent}`}>{qty}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{fmtBRL(value)}</div>
    </div>
  );
}

function Cell({ label, qty, value }: { label: string; qty: number; value: number }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-sm">
        <span className="font-medium">{qty}</span>
        <span className="text-muted-foreground ml-2 text-xs">{fmtBRL(value)}</span>
      </div>
    </div>
  );
}

function ActivityStat({ label, qty, accent }: { label: string; qty: number; accent: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-display font-semibold ${accent}`}>{qty}</div>
    </div>
  );
}

function ActivityCell({ label, qty }: { label: string; qty: number }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-sm font-medium">{qty}</div>
    </div>
  );
}
