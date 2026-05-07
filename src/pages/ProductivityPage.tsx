import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Activity, CheckCircle2, Clock, MoonStar, Trophy, RefreshCw, Shield, UserPlus, Trash2, Crown, Sparkles, AlertTriangle, Lightbulb, TrendingUp } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { userDisplayName } from "@/lib/userDisplay";

interface TopDomain { domain: string; seconds: number; category: string }
interface DailyStat {
  user_id: string;
  workspace_id: string;
  day: string;
  active_seconds: number;
  idle_seconds: number;
  online_seconds: number;
  sessions_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  tasks_completed: number;
  tasks_completed_with_project: number;
  tasks_completed_inbox: number;
  activity_score: number;
  hourly_buckets: Record<string, number>;
  by_project: Record<string, { name: string; tasks: number; seconds: number }>;
  productive_seconds: number;
  neutral_seconds: number;
  distracting_seconds: number;
  top_domains: TopDomain[];
}

interface MemberLite {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

const fmtH = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const initials = (name: string | null) =>
  (name || "?")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default function ProductivityPage() {
  const { user } = useAuth();
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentWs = workspaces.find((w) => w.id === currentWorkspaceId);

  const [range, setRange] = useState<string>("7");
  const [stats, setStats] = useState<DailyStat[]>([]);
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>("all");

  // Acesso ao painel via productivity_admins
  const [accessChecking, setAccessChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuper, setIsSuper] = useState(false);
  const [noAdminsYet, setNoAdminsYet] = useState(false);
  const [admins, setAdmins] = useState<Array<{ user_id: string; is_super: boolean; display_name: string | null; avatar_url: string | null }>>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);

  // Insights AI
  interface InsightItem { text: string; metric?: string; severity?: string; category?: string }
  interface Insight {
    id?: string;
    summary: string;
    highlights: InsightItem[];
    concerns: InsightItem[];
    suggestions: InsightItem[];
    generated_at?: string;
    generated_by?: string;
    period_start?: string;
    period_end?: string;
  }
  const [insight, setInsight] = useState<Insight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightGenerating, setInsightGenerating] = useState(false);

  const refreshAccess = async () => {
    if (!user) return;
    setAccessChecking(true);
    const { data: me } = await supabase
      .from("productivity_admins")
      .select("user_id,is_super")
      .eq("user_id", user.id)
      .maybeSingle();
    if (me) {
      setIsAdmin(true);
      setIsSuper(!!me.is_super);
      setNoAdminsYet(false);
    } else {
      setIsAdmin(false);
      setIsSuper(false);
      // Se não há nenhum admin, qualquer usuário pode se cadastrar como super
      const { count } = await supabase
        .from("productivity_admins")
        .select("user_id", { count: "exact", head: true });
      setNoAdminsYet((count ?? 0) === 0);
    }
    setAccessChecking(false);
  };

  useEffect(() => { void refreshAccess(); /* eslint-disable-next-line */ }, [user]);

  const claimSuperAdmin = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("productivity_admins")
      .insert({ user_id: user.id, is_super: true });
    if (error) { toast.error(error.message); return; }
    toast.success("Você agora é o Super Admin do painel de Produtividade");
    await refreshAccess();
  };

  const loadAdmins = async () => {
    const { data } = await supabase
      .from("productivity_admins")
      .select("user_id,is_super");
    const list = data || [];
    if (list.length === 0) { setAdmins([]); return; }
    const ids = list.map((a: any) => a.user_id);
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id,display_name,avatar_url")
      .in("user_id", ids);
    const profMap = new Map((profs || []).map((p: any) => [p.user_id, p]));
    setAdmins(list.map((a: any) => ({
      user_id: a.user_id,
      is_super: a.is_super,
      display_name: profMap.get(a.user_id)?.display_name ?? null,
      avatar_url: profMap.get(a.user_id)?.avatar_url ?? null,
    })));
  };

  useEffect(() => { if (manageOpen) void loadAdmins(); }, [manageOpen]);

  const addAdminByEmail = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    setAdding(true);
    try {
      // Busca user_id pelo email via edge function admin (auth.users não é acessível via RLS)
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lookup-user-by-email`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email }),
        },
      );
      const j = await res.json();
      if (!res.ok || !j.user_id) throw new Error(j.error || "Usuário não encontrado");
      const { error } = await supabase
        .from("productivity_admins")
        .insert({ user_id: j.user_id, is_super: false, added_by: user!.id });
      if (error) throw error;
      toast.success(`${email} agora tem acesso ao painel`);
      setNewEmail("");
      await loadAdmins();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAdding(false);
    }
  };

  const removeAdmin = async (uid: string) => {
    const { error } = await supabase.from("productivity_admins").delete().eq("user_id", uid);
    if (error) { toast.error(error.message); return; }
    toast.success("Acesso removido");
    await loadAdmins();
  };

  const load = async () => {
    if (!currentWorkspaceId) return;
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - parseInt(range, 10));
    const sinceStr = since.toISOString().slice(0, 10);

    const { data: rows } = await supabase
      .from("daily_activity_stats")
      .select("*")
      .eq("workspace_id", currentWorkspaceId)
      .gte("day", sinceStr)
      .order("day", { ascending: false });

    setStats(((rows as unknown) as DailyStat[]) || []);

    // members of workspace
    const { data: wm } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", currentWorkspaceId);

    const ids = (wm || []).map((m: any) => m.user_id);
    if (ids.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", ids);
      setMembers((profiles as MemberLite[] | null) || []);
    } else {
      setMembers([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspaceId, range]);

  const triggerAggregate = async () => {
    setRefreshing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/activity-aggregate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Falha ao recalcular");
      toast.success(`Recalculado: ${j.processed} registros`);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  // Filtered to selected user (or all)
  const filtered = useMemo(
    () => (selectedUser === "all" ? stats : stats.filter((s) => s.user_id === selectedUser)),
    [stats, selectedUser],
  );

  // Per-user aggregates over the range
  const perUser = useMemo(() => {
    const map = new Map<string, {
      user_id: string;
      online: number;
      active: number;
      idle: number;
      tasks: number;
      tasks_proj: number;
      tasks_inbox: number;
      score: number;
      days: number;
    }>();
    for (const r of stats) {
      let agg = map.get(r.user_id);
      if (!agg) {
        agg = { user_id: r.user_id, online: 0, active: 0, idle: 0, tasks: 0, tasks_proj: 0, tasks_inbox: 0, score: 0, days: 0 };
        map.set(r.user_id, agg);
      }
      agg.online += r.online_seconds;
      agg.active += r.active_seconds;
      agg.idle += r.idle_seconds;
      agg.tasks += r.tasks_completed;
      agg.tasks_proj += r.tasks_completed_with_project;
      agg.tasks_inbox += r.tasks_completed_inbox;
      agg.score += r.activity_score;
      agg.days += 1;
    }
    return [...map.values()].map((a) => ({
      ...a,
      avg_score: a.days > 0 ? Math.round(a.score / a.days) : 0,
    })).sort((a, b) => b.avg_score - a.avg_score);
  }, [stats]);

  // Heatmap data (24 hours x days of week)
  const heatmap = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const r of filtered) {
      const dow = new Date(r.day + "T12:00:00Z").getUTCDay(); // 0..6
      for (const [hStr, sec] of Object.entries(r.hourly_buckets || {})) {
        const h = parseInt(hStr, 10);
        if (h >= 0 && h < 24) grid[dow][h] += Number(sec) || 0;
      }
    }
    const max = Math.max(1, ...grid.flat());
    return { grid, max };
  }, [filtered]);

  // Totals (selected user or everyone)
  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.online += r.online_seconds;
        acc.active += r.active_seconds;
        acc.idle += r.idle_seconds;
        acc.tasks += r.tasks_completed;
        return acc;
      },
      { online: 0, active: 0, idle: 0, tasks: 0 },
    );
  }, [filtered]);

  // Aggregate top domains across the filtered range
  const topDomains = useMemo(() => {
    const m = new Map<string, { seconds: number; category: string }>();
    for (const r of filtered) {
      for (const d of r.top_domains || []) {
        const cur = m.get(d.domain) || { seconds: 0, category: d.category || "neutral" };
        cur.seconds += d.seconds;
        if (d.category) cur.category = d.category;
        m.set(d.domain, cur);
      }
    }
    return [...m.entries()]
      .map(([domain, v]) => ({ domain, ...v }))
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 30);
  }, [filtered]);

  const siteTotals = useMemo(() => filtered.reduce(
    (a, r) => ({
      productive: a.productive + (r.productive_seconds || 0),
      neutral: a.neutral + (r.neutral_seconds || 0),
      distracting: a.distracting + (r.distracting_seconds || 0),
    }),
    { productive: 0, neutral: 0, distracting: 0 },
  ), [filtered]);

  const setCategory = async (domain: string, category: "productive" | "neutral" | "distracting") => {
    if (!currentWorkspaceId) return;
    const { error } = await supabase
      .from("domain_categories")
      .upsert({ workspace_id: currentWorkspaceId, domain, category }, { onConflict: "workspace_id,domain" });
    if (error) { toast.error(error.message); return; }
    toast.success(`${domain} marcado como ${category === "productive" ? "produtivo" : category === "distracting" ? "improdutivo" : "neutro"}`);
  };

  const memberById = (id: string) => members.find((m) => m.user_id === id);

  if (accessChecking) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <Card className="p-8 text-center max-w-xl mx-auto">
          <Shield className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="font-display text-xl font-semibold mb-2">Painel restrito</h2>
          <p className="text-muted-foreground text-sm mb-4">
            O painel de Produtividade é privado. Somente administradores autorizados podem acessar.
          </p>
          {noAdminsYet && (
            <>
              <p className="text-xs text-muted-foreground mb-3">
                Nenhum Super Admin configurado ainda. Reivindique o acesso agora:
              </p>
              <Button onClick={claimSuperAdmin}>
                <Crown className="h-4 w-4 mr-2" /> Tornar-me Super Admin
              </Button>
            </>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Produtividade</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Tempo logado, idle, tarefas concluídas e score por colaborador.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Colaborador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os colaboradores</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {userDisplayName(m.display_name, (m as any).email)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Hoje</SelectItem>
                <SelectItem value="2">Últimos 2 dias</SelectItem>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="14">Últimos 14 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="60">Últimos 60 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="180">Últimos 6 meses</SelectItem>
                <SelectItem value="365">Último ano</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={triggerAggregate} disabled={refreshing} title="Recalcular">
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            {isSuper && (
              <Button variant="outline" onClick={() => setManageOpen(true)} title="Gerenciar acesso">
                <Shield className="h-4 w-4 mr-2" /> Acesso
              </Button>
            )}
          </div>
        </div>

        {/* Dialog: gerenciar admins */}
        <Dialog open={manageOpen} onOpenChange={setManageOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" /> Acesso ao painel de Produtividade
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Apenas as pessoas listadas abaixo podem ver as métricas. Adicione pelo e-mail (precisa já ter conta no TaskFlow).
              </p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="email@exemplo.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void addAdminByEmail(); }}
                />
                <Button onClick={addAdminByEmail} disabled={adding || !newEmail.trim()}>
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="h-4 w-4 mr-1" /> Adicionar</>}
                </Button>
              </div>
              <div className="border border-border rounded-md divide-y divide-border max-h-72 overflow-auto">
                {admins.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">Nenhum administrador.</div>
                ) : admins.map((a) => (
                  <div key={a.user_id} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-8 w-8">
                        {a.avatar_url && <AvatarImage src={a.avatar_url} />}
                        <AvatarFallback className="text-xs">{initials(a.display_name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate flex items-center gap-2">
                          {userDisplayName(a.display_name, (a as any).email)}
                          {a.is_super && <Crown className="h-3.5 w-3.5 text-warning" />}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {a.is_super ? "Super Admin" : "Admin"}
                        </div>
                      </div>
                    </div>
                    {a.user_id !== user?.id && (
                      <Button size="icon" variant="ghost" onClick={() => removeAdmin(a.user_id)} title="Remover">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setManageOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
                  <Clock className="h-4 w-4" /> Online
                </div>
                <div className="text-2xl font-display font-bold mt-2">{fmtH(totals.online)}</div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
                  <Activity className="h-4 w-4" /> Ativo
                </div>
                <div className="text-2xl font-display font-bold mt-2 text-primary">{fmtH(totals.active)}</div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
                  <MoonStar className="h-4 w-4" /> Idle
                </div>
                <div className="text-2xl font-display font-bold mt-2">{fmtH(totals.idle)}</div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
                  <CheckCircle2 className="h-4 w-4" /> Tarefas concluídas
                </div>
                <div className="text-2xl font-display font-bold mt-2">{totals.tasks}</div>
              </Card>
            </div>

            <Tabs defaultValue="ranking">
              <TabsList>
                <TabsTrigger value="ranking">Ranking</TabsTrigger>
                <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
                <TabsTrigger value="sites">Sites</TabsTrigger>
                <TabsTrigger value="daily">Dia a dia</TabsTrigger>
              </TabsList>

              {/* Ranking */}
              <TabsContent value="ranking">
                <Card className="p-0 overflow-hidden">
                  <div className="grid grid-cols-12 px-4 py-3 text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                    <div className="col-span-4">Colaborador</div>
                    <div className="col-span-2 text-right">Online</div>
                    <div className="col-span-2 text-right">Ativo</div>
                    <div className="col-span-2 text-right">Tarefas</div>
                    <div className="col-span-2 text-right">Score médio</div>
                  </div>
                  {perUser.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                      Sem dados ainda — aguarde o primeiro agregado ou clique em recalcular.
                    </div>
                  ) : (
                    perUser.map((u) => {
                      const m = memberById(u.user_id);
                      return (
                        <div key={u.user_id} className="grid grid-cols-12 items-center px-4 py-3 border-b border-border last:border-0 hover:bg-muted/30">
                          <div className="col-span-4 flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              {m?.avatar_url && <AvatarImage src={m.avatar_url} />}
                              <AvatarFallback className="text-xs">{initials(m?.display_name || null)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-sm">{userDisplayName(m?.display_name, (m as any)?.email)}</div>
                              <div className="text-xs text-muted-foreground">
                                {u.tasks_proj} c/ projeto · {u.tasks_inbox} inbox
                              </div>
                            </div>
                          </div>
                          <div className="col-span-2 text-right text-sm tabular-nums">{fmtH(u.online)}</div>
                          <div className="col-span-2 text-right text-sm tabular-nums text-primary">{fmtH(u.active)}</div>
                          <div className="col-span-2 text-right text-sm tabular-nums">{u.tasks}</div>
                          <div className="col-span-2 text-right">
                            <span className={`inline-flex items-center justify-center w-12 h-7 rounded text-xs font-bold tabular-nums ${
                              u.avg_score >= 70 ? "bg-primary/20 text-primary"
                              : u.avg_score >= 40 ? "bg-warning/20 text-warning"
                              : "bg-muted text-muted-foreground"
                            }`}>
                              {u.avg_score}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </Card>
              </TabsContent>

              {/* Heatmap */}
              <TabsContent value="heatmap">
                <Card className="p-4 overflow-x-auto">
                  <div className="text-xs text-muted-foreground mb-3">
                    Atividade por hora do dia (UTC). Mais escuro = mais ativo.
                  </div>
                  <div className="inline-block">
                    <div className="grid grid-cols-[60px_repeat(24,minmax(20px,1fr))] gap-[2px] text-[10px]">
                      <div></div>
                      {Array.from({ length: 24 }).map((_, h) => (
                        <div key={h} className="text-center text-muted-foreground">{h}</div>
                      ))}
                      {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d, dow) => (
                        <>
                          <div key={`l${dow}`} className="text-muted-foreground py-1">{d}</div>
                          {heatmap.grid[dow].map((sec, h) => {
                            const intensity = sec / heatmap.max;
                            return (
                              <div
                                key={`${dow}-${h}`}
                                className="aspect-square rounded-sm border border-border/40"
                                style={{
                                  backgroundColor: intensity > 0
                                    ? `hsl(var(--primary) / ${0.15 + intensity * 0.85})`
                                    : "hsl(var(--muted) / 0.4)",
                                }}
                                title={`${d} ${h}h: ${fmtH(sec)}`}
                              />
                            );
                          })}
                        </>
                      ))}
                    </div>
                  </div>
                </Card>
              </TabsContent>

              {/* Sites */}
              <TabsContent value="sites" className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <Card className="p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Produtivo</div>
                    <div className="text-2xl font-display font-bold mt-2 text-primary">{fmtH(siteTotals.productive)}</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Neutro</div>
                    <div className="text-2xl font-display font-bold mt-2">{fmtH(siteTotals.neutral)}</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Improdutivo</div>
                    <div className="text-2xl font-display font-bold mt-2 text-destructive">{fmtH(siteTotals.distracting)}</div>
                  </Card>
                </div>

                <Card className="p-0 overflow-hidden">
                  <div className="grid grid-cols-12 px-4 py-3 text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                    <div className="col-span-5">Domínio</div>
                    <div className="col-span-2 text-right">Tempo</div>
                    <div className="col-span-5 text-right">Categoria</div>
                  </div>
                  {topDomains.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                      Nenhum site capturado ainda. Instale a extensão e aguarde alguns minutos.
                    </div>
                  ) : (
                    topDomains.map((d) => (
                      <div key={d.domain} className="grid grid-cols-12 items-center px-4 py-3 border-b border-border last:border-0 hover:bg-muted/30">
                        <div className="col-span-5 font-mono text-sm truncate">{d.domain}</div>
                        <div className="col-span-2 text-right text-sm tabular-nums">{fmtH(d.seconds)}</div>
                        <div className="col-span-5 flex justify-end gap-1">
                          <Button size="sm" variant={d.category === "productive" ? "default" : "outline"} onClick={() => setCategory(d.domain, "productive")} className="h-7 text-xs">Produtivo</Button>
                          <Button size="sm" variant={d.category === "neutral" ? "default" : "outline"} onClick={() => setCategory(d.domain, "neutral")} className="h-7 text-xs">Neutro</Button>
                          <Button size="sm" variant={d.category === "distracting" ? "destructive" : "outline"} onClick={() => setCategory(d.domain, "distracting")} className="h-7 text-xs">Improdutivo</Button>
                        </div>
                      </div>
                    ))
                  )}
                </Card>
                <p className="text-xs text-muted-foreground">
                  Categorias afetam o score a partir do próximo agregado. Clique no <RefreshCw className="inline h-3 w-3" /> para recalcular agora.
                </p>
              </TabsContent>

              {/* Daily */}
              <TabsContent value="daily">
                <Card className="p-0 overflow-hidden">
                  <div className="grid grid-cols-12 px-4 py-3 text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                    <div className="col-span-2">Dia</div>
                    <div className="col-span-3">Colaborador</div>
                    <div className="col-span-2 text-right">Online</div>
                    <div className="col-span-2 text-right">Ativo</div>
                    <div className="col-span-1 text-right">Tarefas</div>
                    <div className="col-span-2 text-right">Score</div>
                  </div>
                  {filtered.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">Sem dados.</div>
                  ) : (
                    filtered.map((r) => {
                      const m = memberById(r.user_id);
                      return (
                        <div key={`${r.user_id}-${r.day}`} className="grid grid-cols-12 items-center px-4 py-2.5 border-b border-border last:border-0 text-sm">
                          <div className="col-span-2 text-muted-foreground tabular-nums">
                            {new Date(r.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                          </div>
                          <div className="col-span-3 flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              {m?.avatar_url && <AvatarImage src={m.avatar_url} />}
                              <AvatarFallback className="text-[10px]">{initials(m?.display_name || null)}</AvatarFallback>
                            </Avatar>
                            <span className="truncate">{userDisplayName(m?.display_name, (m as any)?.email)}</span>
                          </div>
                          <div className="col-span-2 text-right tabular-nums">{fmtH(r.online_seconds)}</div>
                          <div className="col-span-2 text-right tabular-nums text-primary">{fmtH(r.active_seconds)}</div>
                          <div className="col-span-1 text-right tabular-nums">{r.tasks_completed}</div>
                          <div className="col-span-2 text-right">
                            <span className={`inline-flex items-center justify-center w-12 h-6 rounded text-xs font-bold tabular-nums ${
                              r.activity_score >= 70 ? "bg-primary/20 text-primary"
                              : r.activity_score >= 40 ? "bg-warning/20 text-warning"
                              : "bg-muted text-muted-foreground"
                            }`}>{r.activity_score}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}
