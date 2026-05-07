// Edge function: process-reminders
// Roda a cada 1 minuto via pg_cron.
// 1) Marca reminders cujo trigger_at já passou e cria notification (que aciona push)
// 2) Cria reminders de "tarefa atrasada" (1x por tarefa) para usuários que habilitaram
// 3) Enfileira e-mails para usuários que escolheram canal "email"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const nowIso = new Date().toISOString();
    let processed = 0;
    let overdueCreated = 0;
    let emailsQueued = 0;

    // ============ 1) PROCESSAR REMINDERS VENCIDOS ============
    const { data: due, error: selErr } = await supabase
      .from('reminders')
      .select('id, task_id, trigger_at, type, channel, relative_minutes, tasks!inner(id, title, user_id, workspace_id, due_at, completed_at, deleted_at)')
      .lte('trigger_at', nowIso)
      .is('fired_at', null)
      .limit(200);

    if (selErr) throw selErr;

    // Filtrar reminders cujas tasks foram soft-deletadas
    const dueValid = (due || []).filter((r: any) => {
      const t = Array.isArray(r.tasks) ? r.tasks[0] : r.tasks;
      return t && !t.deleted_at;
    });

    if (dueValid.length > 0) {
      const ids = dueValid.map((r) => r.id);
      const { error: updErr } = await supabase
        .from('reminders')
        .update({ fired_at: nowIso, notification_sent: true })
        .in('id', ids);
      if (updErr) throw updErr;

      // Buscar settings dos usuários afetados (para saber canais e e-mail)
      const userIds = Array.from(new Set(
        due.map((r) => {
          const t = Array.isArray((r as any).tasks) ? (r as any).tasks[0] : (r as any).tasks;
          return t?.user_id;
        }).filter(Boolean)
      ));

      const { data: settingsRows } = await supabase
        .from('user_settings')
        .select('user_id, reminder_channels, notify_on_reminders')
        .in('user_id', userIds);

      const settingsByUser = new Map(
        (settingsRows || []).map((s: any) => [s.user_id, s])
      );

      // Buscar e-mails dos usuários
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', userIds);
      const profileByUser = new Map((profiles || []).map((p: any) => [p.user_id, p]));

      const notificationRows: any[] = [];
      const emailJobs: { userId: string; taskTitle: string; mins: number | null; dueAt: string | null }[] = [];

      for (const r of due) {
        const task = Array.isArray((r as any).tasks) ? (r as any).tasks[0] : (r as any).tasks;
        if (!task?.user_id || !task?.workspace_id) continue;
        if (task.completed_at) continue; // tarefa já concluída — pular

        const settings = settingsByUser.get(task.user_id);
        // Default: notificações de lembrete ligadas, canais ['push','email']
        if (settings && settings.notify_on_reminders === false) continue;

        const channels: string[] = settings?.reminder_channels || ['push', 'email'];

        if (channels.includes('push') || channels.includes('mobile')) {
          notificationRows.push({
            user_id: task.user_id,
            type: 'task_reminder',
            workspace_id: task.workspace_id,
            payload: {
              task_id: r.task_id,
              task_title: task.title,
              reminder_id: r.id,
              trigger_at: r.trigger_at,
              relative_minutes: r.relative_minutes,
              due_at: task.due_at,
            },
          });
        }

        if (channels.includes('email')) {
          emailJobs.push({
            userId: task.user_id,
            taskTitle: task.title,
            mins: r.relative_minutes,
            dueAt: task.due_at,
          });
        }
      }

      if (notificationRows.length > 0) {
        const { error: notifErr } = await supabase.from('notifications').insert(notificationRows);
        if (notifErr) console.error('[process-reminders] notif insert err', notifErr);
      }

      // Enfileirar e-mails (best-effort)
      for (const job of emailJobs) {
        try {
          const profile = profileByUser.get(job.userId);
          // Buscar email do auth.users via RPC simples
          const { data: authUser } = await supabase.auth.admin.getUserById(job.userId);
          const email = authUser?.user?.email;
          if (!email) continue;

          const when = job.mins === 0
            ? 'agora'
            : job.mins
            ? `em ${job.mins} minuto${job.mins > 1 ? 's' : ''}`
            : 'em breve';
          const subject = `⏰ Lembrete: ${job.taskTitle}`;
          const html = `
            <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0F172A">
              <h2 style="margin:0 0 12px;color:#EA580C">⏰ Lembrete TaskFlow</h2>
              <p style="font-size:16px;margin:0 0 8px"><strong>${job.taskTitle}</strong></p>
              <p style="color:#64748B;margin:0 0 16px">Seu compromisso é ${when}.</p>
              <a href="https://taskflowedo.lovable.app/upcoming"
                 style="display:inline-block;background:#EA580C;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">
                Abrir tarefa
              </a>
            </div>
          `;
          await supabase.rpc('enqueue_email', {
            queue_name: 'transactional_emails',
            payload: {
              to: email,
              subject,
              html,
              purpose: 'transactional',
            },
          });
          emailsQueued++;
        } catch (e) {
          console.error('[process-reminders] email enqueue failed', e);
        }
      }

      processed = ids.length;
    }

    // ============ 2) CRIAR LEMBRETES DE ATRASO ============
    // Pega tarefas vencidas há entre 1 e 60 min, não concluídas, sem reminder de atraso
    const overdueWindow = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: overdueTasks } = await supabase
      .from('tasks')
      .select('id, user_id, workspace_id, title, due_at')
      .lte('due_at', nowIso)
      .gte('due_at', overdueWindow)
      .is('completed_at', null)
      .limit(100);

    if (overdueTasks && overdueTasks.length > 0) {
      const taskIds = overdueTasks.map((t) => t.id);
      const { data: existingOverdue } = await supabase
        .from('reminders')
        .select('task_id')
        .in('task_id', taskIds)
        .eq('type', 'overdue');
      const alreadyHas = new Set((existingOverdue || []).map((r: any) => r.task_id));

      const userIds2 = Array.from(new Set(overdueTasks.map((t) => t.user_id)));
      const { data: settings2 } = await supabase
        .from('user_settings')
        .select('user_id, notify_overdue, reminder_channels')
        .in('user_id', userIds2);
      const set2 = new Map((settings2 || []).map((s: any) => [s.user_id, s]));

      const overdueNotifs: any[] = [];
      const overdueReminders: any[] = [];
      for (const t of overdueTasks) {
        if (alreadyHas.has(t.id)) continue;
        const s = set2.get(t.user_id);
        if (s && s.notify_overdue === false) continue;

        overdueReminders.push({
          task_id: t.id,
          type: 'overdue',
          channel: 'push',
          trigger_at: nowIso,
          fired_at: nowIso,
          notification_sent: true,
          relative_minutes: 0,
        });

        const channels: string[] = s?.reminder_channels || ['push'];
        if (channels.includes('push') || channels.includes('mobile')) {
          overdueNotifs.push({
            user_id: t.user_id,
            type: 'task_overdue',
            workspace_id: t.workspace_id,
            payload: { task_id: t.id, task_title: t.title, due_at: t.due_at },
          });
        }
      }

      if (overdueReminders.length > 0) {
        await supabase.from('reminders').insert(overdueReminders);
        overdueCreated = overdueReminders.length;
      }
      if (overdueNotifs.length > 0) {
        await supabase.from('notifications').insert(overdueNotifs);
      }
    }

    console.log(`[process-reminders] processed=${processed} overdue=${overdueCreated} emails=${emailsQueued}`);
    return new Response(
      JSON.stringify({ processed, overdueCreated, emailsQueued, at: nowIso }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[process-reminders] erro:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
