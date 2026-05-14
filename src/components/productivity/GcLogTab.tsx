import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Row = {
  day: string;
  gc_user_id: string;
  gc_user_name: string;
  vendas_count: number; vendas_valor: number;
  os_count: number; os_valor: number;
  orcamentos_count: number; orcamentos_valor: number;
  nfs_count: number; nfs_valor: number;
};

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);

const fmtDay = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y.slice(2)}`;
};

export function GcLogTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [days, setDays] = useState(7);
  const [filter, setFilter] = useState("");

  const load = async () => {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - days);
    const { data, error } = await supabase
      .from("gc_daily_activity")
      .select("*")
      .gte("day", since.toISOString().slice(0, 10))
      .order("day", { ascending: false })
      .order("gc_user_name", { ascending: true });
    if (error) toast.error("Erro ao carregar Log GC: " + error.message);
    else setRows((data as Row[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [days]);

  const sync = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("gc-sync-activity", {
      body: { days },
    });
    setSyncing(false);
    if (error) { toast.error("Falha na sincronização: " + error.message); return; }
    toast.success(`Sincronizado: ${data?.buckets ?? 0} registros`);
    load();
  };

  const grouped = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const filtered = f
      ? rows.filter(r => r.gc_user_name.toLowerCase().includes(f) || r.gc_user_id.includes(f))
      : rows;
    // Group by day
    const map = new Map<string, Row[]>();
    for (const r of filtered) {
      const arr = map.get(r.day) ?? [];
      arr.push(r);
      map.set(r.day, arr);
    }
    return Array.from(map.entries());
  }, [rows, filter]);

  const totals = useMemo(() => {
    return rows.reduce((acc, r) => ({
      vendas_count: acc.vendas_count + r.vendas_count,
      vendas_valor: acc.vendas_valor + Number(r.vendas_valor),
      os_count: acc.os_count + r.os_count,
      os_valor: acc.os_valor + Number(r.os_valor),
      orcamentos_count: acc.orcamentos_count + r.orcamentos_count,
      orcamentos_valor: acc.orcamentos_valor + Number(r.orcamentos_valor),
      nfs_count: acc.nfs_count + r.nfs_count,
      nfs_valor: acc.nfs_valor + Number(r.nfs_valor),
    }), { vendas_count: 0, vendas_valor: 0, os_count: 0, os_valor: 0, orcamentos_count: 0, orcamentos_valor: 0, nfs_count: 0, nfs_valor: 0 });
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card className="p-3 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Filtrar por usuário..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="bg-background border border-border rounded-md px-2 py-1 text-sm"
        >
          <option value={1}>Hoje + 1 dia</option>
          <option value={7}>Últimos 7 dias</option>
          <option value={14}>Últimos 14 dias</option>
          <option value={30}>Últimos 30 dias</option>
        </select>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={sync} disabled={syncing}>
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Sincronizar GC</span>
        </Button>
      </Card>

      {/* Totais do período */}
      <Card className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Totais do período</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Vendas" qty={totals.vendas_count} value={totals.vendas_valor} accent="text-green-500" />
          <Stat label="OS" qty={totals.os_count} value={totals.os_valor} accent="text-blue-500" />
          <Stat label="Orçamentos" qty={totals.orcamentos_count} value={totals.orcamentos_valor} accent="text-amber-500" />
          <Stat label="Notas Fiscais" qty={totals.nfs_count} value={totals.nfs_valor} accent="text-purple-500" />
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
                <div key={`${r.day}-${r.gc_user_id}`} className="px-4 py-3 grid grid-cols-12 gap-2 items-center text-sm">
                  <div className="col-span-12 md:col-span-3 font-medium truncate">{r.gc_user_name}</div>
                  <Cell label="Vendas" qty={r.vendas_count} value={r.vendas_valor} />
                  <Cell label="OS" qty={r.os_count} value={r.os_valor} />
                  <Cell label="Orçamentos" qty={r.orcamentos_count} value={r.orcamentos_valor} />
                  <Cell label="NFs" qty={r.nfs_count} value={r.nfs_valor} />
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
    <div className="col-span-6 md:col-span-2">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-sm">
        <span className="font-medium">{qty}</span>
        <span className="text-muted-foreground ml-2 text-xs">{fmtBRL(value)}</span>
      </div>
    </div>
  );
}
