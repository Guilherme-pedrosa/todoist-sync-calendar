import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Settings,
  User,
  Palette,
  Sparkles,
  Bell,
  Languages,
  ArrowLeft,
  Sidebar as SidebarIcon,
  Zap,
  BellRing,
  Database,
  Plug,
  CalendarDays,
  Info,
  LogOut,
  Trash2,
  Loader2,
  Check,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileSettings } from '@/components/settings/ProfileSettings';
import { TodoistIntegration } from '@/components/settings/TodoistIntegration';
import { InstallAppCard } from '@/components/settings/InstallAppCard';
import { PushSubscriptionPanel } from '@/components/settings/PushSubscriptionPanel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useDebouncedEffect } from '@/hooks/useDebouncedEffect';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const THEMES: { value: string; label: string; preview: string }[] = [
  { value: 'todoist', label: 'Todoist', preview: 'hsl(40, 20%, 98%)' },
  { value: 'dark', label: 'Escuro', preview: 'hsl(230, 25%, 8%)' },
  { value: 'moonstone', label: 'Pedra da lua', preview: 'hsl(220, 15%, 90%)' },
  { value: 'tangerine', label: 'Tangerina', preview: 'hsl(20, 95%, 60%)' },
  { value: 'kale', label: 'Kale', preview: 'hsl(140, 50%, 35%)' },
  { value: 'blueberry', label: 'Mirtilo', preview: 'hsl(220, 70%, 55%)' },
  { value: 'lavender', label: 'Lavanda', preview: 'hsl(265, 50%, 70%)' },
  { value: 'raspberry', label: 'Framboesa', preview: 'hsl(340, 75%, 55%)' },
  { value: 'gold', label: 'Ouro', preview: 'hsl(45, 80%, 55%)' },
];

const TAB_ITEMS = [
  { value: 'account', icon: User, label: 'Conta' },
  { value: 'general', icon: Languages, label: 'Geral' },
  { value: 'theme', icon: Palette, label: 'Tema' },
  { value: 'sidebar', icon: SidebarIcon, label: 'Barra lateral' },
  { value: 'quickadd', icon: Zap, label: 'Adição rápida' },
  { value: 'productivity', icon: Sparkles, label: 'Produtividade' },
  { value: 'reminders', icon: Bell, label: 'Lembretes' },
  { value: 'notifications', icon: BellRing, label: 'Notificações' },
  { value: 'backups', icon: Database, label: 'Backups' },
  { value: 'integrations', icon: Plug, label: 'Integrações' },
  { value: 'calendars', icon: CalendarDays, label: 'Calendários' },
  { value: 'about', icon: Info, label: 'Sobre' },
];

const DEFAULT_SETTINGS = {
  language: 'pt-BR',
  timezone: 'America/Sao_Paulo',
  time_format: '24h',
  date_format: 'DD-MM-YYYY',
  week_start: 1,
  next_week_start: 'monday',
  home_page: 'today',
  smart_date_recognition: true,
  theme: 'todoist',
  auto_dark_mode: false,
  color_mode: 'system',
  show_sidebar_counts: true,
  show_calendar_status: true,
  default_reminder_minutes: 15,
  reminder_channels: ['push', 'email'],
  daily_goal: 5,
  weekly_goal: 30,
  vacation_mode: false,
  days_off: ['6', '0'],
  karma_enabled: true,
  quick_add_chips: ['date', 'deadline', 'assignee', 'attachment', 'priority', 'reminders'],
  sidebar_order: ['inbox', 'today', 'upcoming', 'completed', 'more'],
  sidebar_hidden: [],
  show_task_description: true,
  celebrations: true,
  delete_calendar_event_on_complete: true,
  notify_on_task_complete: true,
  notify_on_comments: true,
  notify_on_reminders: true,
};

const GOOGLE_SYNC_PAUSED_KEY = 'taskflow_google_sync_paused';
const GOOGLE_SYNC_SAFETY_KEY = 'taskflow_google_sync_safety_v2';

export default function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut, calendarConnected, connectCalendar, reconnectCalendar, disconnectCalendar } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingFlash, setSavingFlash] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmWipeTasks, setConfirmWipeTasks] = useState(false);
  const [confirmWipeLabels, setConfirmWipeLabels] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    return TAB_ITEMS.some((item) => item.value === tab) ? tab! : 'account';
  });
  const [calendarMaintenanceLoading, setCalendarMaintenanceLoading] = useState<null | 'analyze' | 'delete'>(null);
  const [calendarDuplicateCount, setCalendarDuplicateCount] = useState<number | null>(null);
  const [syncPaused, setSyncPaused] = useState(
    () =>
      typeof window !== 'undefined' &&
      (localStorage.getItem(GOOGLE_SYNC_SAFETY_KEY) !== 'acknowledged' ||
        localStorage.getItem(GOOGLE_SYNC_PAUSED_KEY) !== 'false')
  );

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get('tab');
    if (tab && TAB_ITEMS.some((item) => item.value === tab)) setActiveTab(tab);
  }, [location.search]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!active) return;
      if (error) {
        toast.error('Falha ao carregar configurações');
        setSettings({ ...DEFAULT_SETTINGS, user_id: user.id });
      } else if (data) {
        setSettings({ ...DEFAULT_SETTINGS, ...data });
      } else {
        const { data: created } = await supabase
          .from('user_settings')
          .insert({ user_id: user.id })
          .select('*')
          .maybeSingle();
        if (!active) return;
        setSettings({ ...DEFAULT_SETTINGS, ...(created || {}), user_id: user.id });
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const update = (patch: Record<string, any>) => {
    setSettings((s: any) => ({ ...s, ...patch }));
  };

  // Debounced save (500ms)
  useDebouncedEffect(
    async () => {
      if (!user || !settings) return;
      const { id, user_id, created_at, updated_at, ...payload } = settings;
      const { error } = await supabase
        .from('user_settings')
        .update(payload)
        .eq('user_id', user.id);
      if (error) {
        toast.error('Falha ao salvar');
        return;
      }
      setSavingFlash(true);
      setTimeout(() => setSavingFlash(false), 1200);
    },
    [settings],
    500
  );

  const exportAll = async () => {
    if (!user) return;
    const [tasks, projects, labels, sections, comments] = await Promise.all([
      supabase.from('tasks').select('*').eq('user_id', user.id),
      supabase.from('projects').select('*').eq('user_id', user.id),
      supabase.from('labels').select('*').eq('user_id', user.id),
      supabase.from('sections').select('*'),
      supabase.from('comments').select('*').eq('user_id', user.id),
    ]);
    const data = {
      exportedAt: new Date().toISOString(),
      user: user.email,
      tasks: tasks.data || [],
      projects: projects.data || [],
      labels: labels.data || [],
      sections: sections.data || [],
      comments: comments.data || [],
      settings,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `taskflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Backup exportado');
  };

  const testReminder = () => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('TaskFlow', { body: 'Teste de lembrete ✅', icon: '/icon-192.png' });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((p) => {
          if (p === 'granted') new Notification('TaskFlow', { body: 'Teste de lembrete ✅', icon: '/icon-192.png' });
        });
      } else {
        toast.error('Notificações bloqueadas no navegador');
      }
    } else {
      toast.error('Navegador não suporta notificações');
    }
  };

  const deleteAccount = async () => {
    if (!user) return;
    // Soft path: sign out — actual deletion needs admin API. Show informativo.
    toast.error('Exclusão definitiva: contate suporte. Sessão encerrada.');
    await signOut();
  };

  const wipeAllTasks = async () => {
    if (!user) return;
    setWiping(true);
    try {
      // Reminders (via task ownership), comments, task_labels, then tasks
      const { data: taskIds } = await supabase.from('tasks').select('id').eq('user_id', user.id);
      const ids = (taskIds || []).map((t: any) => t.id);
      if (ids.length) {
        await supabase.from('reminders').delete().in('task_id', ids);
        await supabase.from('comments').delete().in('task_id', ids);
        await supabase.from('task_labels').delete().in('task_id', ids);
      }
      await supabase.from('tasks').delete().eq('user_id', user.id);
      await supabase.from('activity_log').delete().eq('user_id', user.id).eq('entity_type', 'task');
      toast.success('Todas as tarefas foram apagadas');
      setConfirmWipeTasks(false);
    } catch (e: any) {
      toast.error('Erro ao apagar tarefas: ' + (e?.message || ''));
    } finally {
      setWiping(false);
    }
  };

  const wipeAllLabels = async () => {
    if (!user) return;
    setWiping(true);
    try {
      const { data: lbls } = await supabase.from('labels').select('id').eq('user_id', user.id);
      const ids = (lbls || []).map((l: any) => l.id);
      if (ids.length) {
        await supabase.from('task_labels').delete().in('label_id', ids);
      }
      await supabase.from('labels').delete().eq('user_id', user.id);
      toast.success('Todas as etiquetas foram apagadas');
      setConfirmWipeLabels(false);
    } catch (e: any) {
      toast.error('Erro ao apagar etiquetas: ' + (e?.message || ''));
    } finally {
      setWiping(false);
    }
  };

  const setCalendarSyncPaused = (paused: boolean) => {
    if (!paused) localStorage.setItem(GOOGLE_SYNC_SAFETY_KEY, 'acknowledged');
    localStorage.setItem(GOOGLE_SYNC_PAUSED_KEY, paused ? 'true' : 'false');
    setSyncPaused(paused);
    toast.success(paused ? 'Sync pausado' : 'Sync retomado');
  };

  const cleanupCalendarDuplicates = async (dryRun: boolean) => {
    const mode = dryRun ? 'analyze' : 'delete';
    setCalendarMaintenanceLoading(mode);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Sessão inválida. Faça login novamente.');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar?action=cleanup-duplicates`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dryRun }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.error) throw new Error(payload?.error || 'Falha ao limpar duplicatas');

      const count = Number(payload?.duplicateCount || 0);
      setCalendarDuplicateCount(dryRun ? count : 0);
      toast.success(dryRun ? `${count} duplicatas encontradas` : `${count} duplicatas removidas`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao limpar duplicatas');
    } finally {
      setCalendarMaintenanceLoading(null);
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Carregando configurações…
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="hidden sm:flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-border/50">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Settings className="h-5 w-5" />
        <h2 className="font-display text-xl font-bold tracking-tight">Configurações</h2>
        {savingFlash && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-success">
            <Check className="h-3 w-3" /> Salvo
          </span>
        )}
      </header>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 overflow-hidden flex flex-col lg:flex-row"
      >
        {/* Mobile horizontal tabs */}
        <TabsList className="lg:hidden flex w-full justify-start overflow-x-auto h-auto bg-card border-b border-border rounded-none p-1 gap-1 scrollbar-thin">
          {TAB_ITEMS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="shrink-0 text-[11px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <t.icon className="h-3 w-3 mr-1" /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Desktop vertical tabs */}
        <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-border p-3 gap-1 overflow-y-auto scrollbar-thin">
          {TAB_ITEMS.map((t) => (
            <button
              key={t.value}
              onClick={() => setActiveTab(t.value)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-left transition-colors',
                activeTab === t.value
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <t.icon className="h-4 w-4 shrink-0" />
              {t.label}
            </button>
          ))}
        </aside>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-2xl mx-auto p-4 sm:p-6">
            <TabsContent value="account" className="space-y-6 mt-0">
              <Section title="Perfil">
                <ProfileSettings />
              </Section>
              <Section title="Aplicativo">
                <InstallAppCard />
              </Section>
              <Section title="Segurança">
                <Button variant="outline" size="sm" onClick={() => navigate('/auth')}>
                  Alterar senha
                </Button>
              </Section>
              <Section title="Zona perigosa">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmWipeTasks(true)}
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" /> Apagar todas as tarefas
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmWipeLabels(true)}
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" /> Apagar todas as etiquetas
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" /> Excluir conta
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Apagar tarefas/etiquetas é irreversível. Projetos, configurações e integrações são preservados.
                </p>
              </Section>
            </TabsContent>

            <TabsContent value="general" className="space-y-6 mt-0">
              <Section title="Idioma & Região">
                <Field label="Idioma">
                  <Select value={settings.language} onValueChange={(v) => update({ language: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Fuso horário">
                  <Input value={settings.timezone} onChange={(e) => update({ timezone: e.target.value })} />
                </Field>
                <Field label="Formato de hora">
                  <Select value={settings.time_format} onValueChange={(v) => update({ time_format: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24h">24 horas</SelectItem>
                      <SelectItem value="12h">12 horas (AM/PM)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Formato de data">
                  <Select value={settings.date_format} onValueChange={(v) => update({ date_format: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DD-MM-YYYY">DD/MM/AAAA</SelectItem>
                      <SelectItem value="MM-DD-YYYY">MM/DD/AAAA</SelectItem>
                      <SelectItem value="YYYY-MM-DD">AAAA-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Início da semana">
                  <Select
                    value={String(settings.week_start)}
                    onValueChange={(v) => update({ week_start: Number(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Domingo</SelectItem>
                      <SelectItem value="1">Segunda-feira</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Próxima semana começa em">
                  <Select
                    value={settings.next_week_start || 'monday'}
                    onValueChange={(v) => update({ next_week_start: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="saturday">Sábado</SelectItem>
                      <SelectItem value="sunday">Domingo</SelectItem>
                      <SelectItem value="monday">Segunda-feira</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Página inicial">
                  <Select value={settings.home_page} onValueChange={(v) => update({ home_page: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inbox">Caixa de Entrada</SelectItem>
                      <SelectItem value="today">Hoje</SelectItem>
                      <SelectItem value="upcoming">Em breve</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <ToggleRow
                  label="Reconhecimento inteligente de datas"
                  desc='Detecta "amanhã 14h", "toda segunda" etc.'
                  value={settings.smart_date_recognition}
                  onChange={(v) => update({ smart_date_recognition: v })}
                />
              </Section>
            </TabsContent>

            <TabsContent value="theme" className="space-y-6 mt-0">
              <Section title="Tema">
                <div className="grid grid-cols-3 sm:grid-cols-3 gap-3">
                  {THEMES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => update({ theme: t.value })}
                      className={cn(
                        'group relative aspect-[4/3] rounded-xl border-2 overflow-hidden transition-all',
                        settings.theme === t.value
                          ? 'border-primary ring-2 ring-primary/30'
                          : 'border-border hover:border-primary/40'
                      )}
                      style={{ backgroundColor: t.preview }}
                    >
                      <div className="absolute inset-x-0 bottom-0 bg-background/90 py-1 text-[11px] font-medium">
                        {t.label}
                      </div>
                      {settings.theme === t.value && (
                        <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </Section>
              <Section title="Modo">
                <Field label="Modo de cor">
                  <Select
                    value={settings.color_mode || 'system'}
                    onValueChange={(v) => update({ color_mode: v, auto_dark_mode: v === 'system' })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Claro</SelectItem>
                      <SelectItem value="dark">Escuro</SelectItem>
                      <SelectItem value="system">Sistema</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </Section>
            </TabsContent>

            <TabsContent value="sidebar" className="space-y-6 mt-0">
              <Section title="Barra lateral">
                <ToggleRow
                  label="Mostrar contadores"
                  desc="Exibe número de tarefas ao lado de cada visão"
                  value={settings.show_sidebar_counts !== false}
                  onChange={(v) => update({ show_sidebar_counts: v })}
                />
                <ToggleRow
                  label="Mostrar status do Google Calendar"
                  desc="Bloco de conexão no rodapé da barra lateral"
                  value={settings.show_calendar_status !== false}
                  onChange={(v) => update({ show_calendar_status: v })}
                />
                <Field label="Ordem dos itens">
                  <p className="text-xs text-muted-foreground italic">
                    Atual: {(settings.sidebar_order || []).join(' → ') || 'padrão'}
                  </p>
                </Field>
              </Section>
            </TabsContent>

            <TabsContent value="quickadd" className="space-y-6 mt-0">
              <Section title="Adição rápida">
                <Field label="Chips visíveis">
                  <p className="text-xs text-muted-foreground">
                    {(settings.quick_add_chips || []).join(', ')}
                  </p>
                </Field>
                <ToggleRow
                  label="Mostrar descrição por padrão"
                  desc="Exibe campo de descrição já aberto no Quick Add"
                  value={settings.show_task_description}
                  onChange={(v) => update({ show_task_description: v })}
                />
              </Section>
            </TabsContent>

            <TabsContent value="productivity" className="space-y-6 mt-0">
              <Section title="Karma">
                <ToggleRow
                  label="Karma"
                  desc="Pontuação por produtividade"
                  value={settings.karma_enabled}
                  onChange={(v) => update({ karma_enabled: v })}
                />
              </Section>
              <Section title="Metas">
                <SliderField
                  label="Meta diária"
                  value={settings.daily_goal || 10}
                  min={1}
                  max={30}
                  onChange={(v) => update({ daily_goal: v })}
                  suffix="tarefas/dia"
                />
                <SliderField
                  label="Meta semanal"
                  value={settings.weekly_goal || 50}
                  min={5}
                  max={150}
                  step={5}
                  onChange={(v) => update({ weekly_goal: v })}
                  suffix="tarefas/semana"
                />
                <ToggleRow
                  label="Comemorações"
                  desc="Animação ao concluir tarefas"
                  value={settings.celebrations}
                  onChange={(v) => update({ celebrations: v })}
                />
                <ToggleRow
                  label="Modo férias"
                  desc="Pausa a contagem de Karma e streaks"
                  value={settings.vacation_mode}
                  onChange={(v) => update({ vacation_mode: v })}
                />
              </Section>
            </TabsContent>

            <TabsContent value="reminders" className="space-y-6 mt-0">
              <Section title="Notificações push neste dispositivo">
                <PushSubscriptionPanel />
              </Section>
              <Section title="Quando avisar">
                <Field label="Antecedências (você pode escolher várias)">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {[
                      { v: 0, label: 'No horário' },
                      { v: 5, label: '5 min antes' },
                      { v: 10, label: '10 min antes' },
                      { v: 15, label: '15 min antes' },
                      { v: 30, label: '30 min antes' },
                      { v: 60, label: '1 h antes' },
                      { v: 120, label: '2 h antes' },
                      { v: 1440, label: '1 dia antes' },
                    ].map((opt) => {
                      const list: number[] = settings.reminder_offsets_minutes || [Number(settings.default_reminder_minutes ?? 15)];
                      const active = list.includes(opt.v);
                      return (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => {
                            const next = active
                              ? list.filter((m) => m !== opt.v)
                              : [...list, opt.v].sort((a, b) => a - b);
                            const safe = next.length ? next : [15];
                            update({
                              reminder_offsets_minutes: safe,
                              default_reminder_minutes: safe[safe.length - 1] ?? 15,
                            });
                          }}
                          className={cn(
                            'rounded-md border px-3 py-2 text-sm transition',
                            active
                              ? 'border-primary bg-primary/10 text-primary font-medium'
                              : 'border-border hover:bg-muted',
                          )}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <ToggleRow
                  label="Avisar quando uma tarefa atrasar"
                  desc="Você recebe um alerta logo após o horário marcado caso ainda não tenha concluído"
                  value={settings.notify_overdue !== false}
                  onChange={(v) => update({ notify_overdue: v })}
                />
              </Section>
              <Section title="Canais">
                {(['push', 'email', 'mobile'] as const).map((ch) => {
                  const active = (settings.reminder_channels || []).includes(ch);
                  const labels: Record<string, { t: string; d: string }> = {
                    push: { t: 'Notificações no navegador', d: 'Desktop e Android via push' },
                    mobile: { t: 'Notificações móveis', d: 'iOS / app instalado' },
                    email: { t: 'E-mail', d: 'Recebe um e-mail no horário do lembrete' },
                  };
                  return (
                    <ToggleRow
                      key={ch}
                      label={labels[ch].t}
                      desc={labels[ch].d}
                      value={active}
                      onChange={(v) =>
                        update({
                          reminder_channels: v
                            ? [...(settings.reminder_channels || []), ch]
                            : (settings.reminder_channels || []).filter((c: string) => c !== ch),
                        })
                      }
                    />
                  );
                })}
              </Section>
            </TabsContent>

            <TabsContent value="notifications" className="space-y-6 mt-0">
              <Section title="Receber notificações sobre">
                <ToggleRow
                  label="Conclusão de tarefa atribuída"
                  desc="Quando alguém concluir uma tarefa atribuída a você"
                  value={settings.notify_on_task_complete !== false}
                  onChange={(v) => update({ notify_on_task_complete: v })}
                />
                <ToggleRow
                  label="Comentários novos"
                  desc="Em tarefas que você criou ou comentou"
                  value={settings.notify_on_comments !== false}
                  onChange={(v) => update({ notify_on_comments: v })}
                />
                <ToggleRow
                  label="Lembretes"
                  desc="Notificações no horário marcado"
                  value={settings.notify_on_reminders !== false}
                  onChange={(v) => update({ notify_on_reminders: v })}
                />
              </Section>
            </TabsContent>

            <TabsContent value="backups" className="space-y-6 mt-0">
              <Section title="Backups">
                <p className="text-sm text-muted-foreground">
                  Exporte um snapshot completo dos seus dados (tarefas, projetos, etiquetas e comentários)
                  em formato JSON.
                </p>
                <Button onClick={exportAll} className="mt-2">
                  <Database className="h-4 w-4 mr-1.5" /> Exportar tudo (JSON)
                </Button>
              </Section>
              <Section title="Snapshots automáticos">
                <p className="text-xs text-muted-foreground italic">
                  Snapshot pré-migração disponível: tasks_backup_pre_phase1.
                </p>
              </Section>
            </TabsContent>

            <TabsContent value="integrations" className="space-y-6 mt-0">
              <Section title="Todoist">
                <TodoistIntegration />
              </Section>
              <Section title="Em breve">
                <IntegrationCard name="Slack" desc="Notificações em canal" status="soon" />
                <IntegrationCard name="Zapier" desc="Automações com 5000+ apps" status="soon" />
              </Section>
            </TabsContent>

            <TabsContent value="calendars" className="space-y-6 mt-0">
              <Section title="Google Calendar">
                <div className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">
                        Status:{' '}
                        <span className={calendarConnected ? 'text-success' : 'text-muted-foreground'}>
                          {calendarConnected === null ? '…' : calendarConnected ? 'Conectado' : 'Desconectado'}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Sincronização bidirecional dos eventos do dia
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    {calendarConnected ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => reconnectCalendar()}>
                          Reconectar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            try {
                              await disconnectCalendar();
                              toast.success('Desconectado');
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : 'Falha');
                            }
                          }}
                          className="text-destructive hover:text-destructive"
                        >
                          Desconectar
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" onClick={() => connectCalendar()}>
                        Conectar
                      </Button>
                    )}
                  </div>
                </div>
                <ToggleRow
                  label="Excluir evento ao concluir"
                  desc="Apaga o evento sincronizado do Google Calendar quando a tarefa for concluída"
                  value={settings.delete_calendar_event_on_complete}
                  onChange={(v) => update({ delete_calendar_event_on_complete: v })}
                />
                <Section title="Manutenção do sync">
                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant={syncPaused ? 'default' : 'outline'}
                        onClick={() => setCalendarSyncPaused(!syncPaused)}
                      >
                        {syncPaused ? '▶️ Retomar sync' : '⏸️ Pausar sync'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={calendarMaintenanceLoading !== null || !calendarConnected}
                        onClick={() => cleanupCalendarDuplicates(true)}
                      >
                        {calendarMaintenanceLoading === 'analyze' ? 'Analisando…' : '🧹 Analisar duplicatas'}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={calendarMaintenanceLoading !== null || !calendarConnected || !calendarDuplicateCount}
                        onClick={() => cleanupCalendarDuplicates(false)}
                      >
                        {calendarMaintenanceLoading === 'delete'
                          ? 'Deletando…'
                          : `🗑️ Deletar ${calendarDuplicateCount || 0} duplicatas`}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Status do sync: {syncPaused ? 'pausado' : 'ativo'}.
                      {calendarDuplicateCount !== null ? ` Última análise: ${calendarDuplicateCount} duplicatas.` : ''}
                    </p>
                  </div>
                </Section>
              </Section>
            </TabsContent>

            <TabsContent value="about" className="space-y-6 mt-0">
              <Section title="TaskFlow">
                <div className="text-sm space-y-2">
                  <p>
                    <strong>Versão:</strong> 1.0.0 (Fase 5)
                  </p>
                  <p className="text-muted-foreground">
                    Construído com Lovable Cloud, React, Vite e Tailwind.
                  </p>
                </div>
              </Section>
              <Section title="Links">
                <div className="flex flex-col gap-2 text-sm">
                  <a href="#" className="text-primary hover:underline">Termos de uso</a>
                  <a href="#" className="text-primary hover:underline">Política de privacidade</a>
                </div>
              </Section>
              <Section title="Sessão">
                <Button variant="outline" size="sm" onClick={signOut}>
                  <LogOut className="h-4 w-4 mr-1.5" /> Sair
                </Button>
              </Section>
            </TabsContent>
          </div>
        </div>
      </Tabs>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. Todos os seus dados serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={deleteAccount}
            >
              Sim, excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmWipeTasks} onOpenChange={setConfirmWipeTasks}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar todas as tarefas?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove todas as tarefas, lembretes, comentários e vínculos com etiquetas.
              Projetos, etiquetas e configurações são preservados. Esta ação é irreversível.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={wiping}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={wipeAllTasks}
              disabled={wiping}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {wiping ? 'Apagando…' : 'Apagar tudo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmWipeLabels} onOpenChange={setConfirmWipeLabels}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar todas as etiquetas?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove todas as etiquetas e seus vínculos com tarefas. As tarefas em si não
              serão excluídas. Esta ação é irreversível.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={wiping}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={wipeAllLabels}
              disabled={wiping}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {wiping ? 'Apagando…' : 'Apagar tudo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 items-start gap-2 sm:gap-3">
      <Label className="text-sm pt-2">{label}</Label>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-border gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
      </div>
      <Switch checked={!!value} onCheckedChange={onChange} />
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="p-3 rounded-lg border border-border space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <span className="text-sm font-semibold tabular-nums">
          {value} <span className="text-muted-foreground font-normal text-xs">{suffix}</span>
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  );
}

function IntegrationCard({
  name,
  desc,
  status,
  actionLabel,
  onAction,
}: {
  name: string;
  desc: string;
  status: 'connected' | 'soon';
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-border">
      <div>
        <p className="text-sm font-semibold flex items-center gap-2">
          {name}
          <span
            className={cn(
              'text-[10px] uppercase font-bold px-1.5 py-0.5 rounded',
              status === 'connected'
                ? 'bg-success/15 text-success'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {status === 'connected' ? 'Conectado' : 'Em breve'}
          </span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      {status === 'connected' && actionLabel && (
        <Button size="sm" variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
