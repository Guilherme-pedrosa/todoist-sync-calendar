import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, User, Palette, Sparkles, Bell, Languages, ArrowLeft } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, calendarConnected, connectCalendar, disconnectCalendar } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!active) return;
      setSettings(data);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const update = (patch: Record<string, any>) => {
    setSettings((s: any) => ({ ...s, ...patch }));
  };

  const save = async () => {
    if (!user || !settings) return;
    setSaving(true);
    const { id, user_id, created_at, updated_at, ...payload } = settings;
    const { error } = await supabase
      .from('user_settings')
      .update(payload)
      .eq('user_id', user.id);
    setSaving(false);
    if (error) toast.error('Falha ao salvar configurações');
    else toast.success('Configurações salvas');
  };

  if (loading || !settings) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Carregando configurações…
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-border/50">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Settings className="h-5 w-5" />
        <h2 className="font-display text-xl font-bold tracking-tight">Configurações</h2>
        <Button onClick={save} disabled={saving} className="ml-auto h-8">
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto p-6">
          <Tabs defaultValue="account" className="w-full">
            <TabsList className="grid grid-cols-5 mb-6">
              <TabsTrigger value="account"><User className="h-3.5 w-3.5 mr-1" /> Conta</TabsTrigger>
              <TabsTrigger value="general"><Languages className="h-3.5 w-3.5 mr-1" /> Geral</TabsTrigger>
              <TabsTrigger value="theme"><Palette className="h-3.5 w-3.5 mr-1" /> Tema</TabsTrigger>
              <TabsTrigger value="productivity"><Sparkles className="h-3.5 w-3.5 mr-1" /> Produtividade</TabsTrigger>
              <TabsTrigger value="reminders"><Bell className="h-3.5 w-3.5 mr-1" /> Lembretes</TabsTrigger>
            </TabsList>

            <TabsContent value="account" className="space-y-6">
              <Section title="Informações da conta">
                <Field label="E-mail">
                  <Input value={user?.email || ''} disabled className="bg-muted/40" />
                </Field>
              </Section>
              <Section title="Integrações">
                <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                  <div>
                    <div className="text-sm font-medium">Google Calendar</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Sincronização bidirecional de eventos do dia
                    </div>
                  </div>
                  {calendarConnected ? (
                    <Button variant="outline" size="sm" onClick={() => disconnectCalendar()}>
                      Desconectar
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => connectCalendar()}>
                      Conectar
                    </Button>
                  )}
                </div>
              </Section>
            </TabsContent>

            <TabsContent value="general" className="space-y-6">
              <Section title="Idioma & Região">
                <Field label="Idioma">
                  <Select value={settings.language} onValueChange={(v) => update({ language: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                      <SelectItem value="en-US">English</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Fuso horário">
                  <Input value={settings.timezone} onChange={(e) => update({ timezone: e.target.value })} />
                </Field>
                <Field label="Início da semana">
                  <Select value={String(settings.week_start)} onValueChange={(v) => update({ week_start: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Domingo</SelectItem>
                      <SelectItem value="1">Segunda-feira</SelectItem>
                      <SelectItem value="6">Sábado</SelectItem>
                    </SelectContent>
                  </Select>
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

            <TabsContent value="theme" className="space-y-6">
              <Section title="Aparência">
                <Field label="Tema">
                  <Select value={settings.theme} onValueChange={(v) => update({ theme: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todoist">Todoist (claro)</SelectItem>
                      <SelectItem value="dark">Escuro</SelectItem>
                      <SelectItem value="moonstone">Moonstone</SelectItem>
                      <SelectItem value="kraft-paper">Papel kraft</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <ToggleRow
                  label="Tema escuro automático"
                  desc="Segue a configuração do sistema"
                  value={settings.auto_dark_mode}
                  onChange={(v) => update({ auto_dark_mode: v })}
                />
                <ToggleRow
                  label="Mostrar descrição da tarefa"
                  desc="Exibe a descrição abaixo do título"
                  value={settings.show_task_description}
                  onChange={(v) => update({ show_task_description: v })}
                />
              </Section>
            </TabsContent>

            <TabsContent value="productivity" className="space-y-6">
              <Section title="Karma & Metas">
                <ToggleRow
                  label="Karma"
                  desc="Pontuação por produtividade"
                  value={settings.karma_enabled}
                  onChange={(v) => update({ karma_enabled: v })}
                />
                <Field label="Meta diária">
                  <Input
                    type="number"
                    value={settings.daily_goal}
                    onChange={(e) => update({ daily_goal: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Meta semanal">
                  <Input
                    type="number"
                    value={settings.weekly_goal}
                    onChange={(e) => update({ weekly_goal: Number(e.target.value) })}
                  />
                </Field>
                <ToggleRow
                  label="Comemorações"
                  desc="Animação ao completar metas"
                  value={settings.celebrations}
                  onChange={(v) => update({ celebrations: v })}
                />
                <ToggleRow
                  label="Modo férias"
                  desc="Pausa contagem de Karma"
                  value={settings.vacation_mode}
                  onChange={(v) => update({ vacation_mode: v })}
                />
              </Section>
            </TabsContent>

            <TabsContent value="reminders" className="space-y-6">
              <Section title="Lembretes">
                <Field label="Antecedência padrão (minutos)">
                  <Input
                    type="number"
                    value={settings.default_reminder_minutes}
                    onChange={(e) => update({ default_reminder_minutes: Number(e.target.value) })}
                  />
                </Field>
                <ToggleRow
                  label="Excluir evento do calendário ao concluir"
                  desc="Apaga evento sincronizado do Google Calendar quando a tarefa é concluída"
                  value={settings.delete_calendar_event_on_complete}
                  onChange={(v) => update({ delete_calendar_event_on_complete: v })}
                />
              </Section>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-3">
      <Label className="text-sm">{label}</Label>
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
    <div className="flex items-center justify-between p-3 rounded-lg border border-border">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
      </div>
      <Switch checked={!!value} onCheckedChange={onChange} />
    </div>
  );
}
