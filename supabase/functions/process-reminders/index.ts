// Edge function: process-reminders
// Roda a cada 1 minuto via pg_cron. Marca reminders cujo trigger_at já passou.
// Por enquanto é um esqueleto: apenas marca fired_at e loga. Push real fica pra
// fase posterior (Web Push + service worker).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

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

    const { data: due, error: selErr } = await supabase
      .from('reminders')
      .select('id, task_id, trigger_at, type, channel, relative_minutes, tasks(id, title, user_id, workspace_id)')
      .lte('trigger_at', nowIso)
      .is('fired_at', null)
      .limit(200);

    if (selErr) throw selErr;

    if (!due || due.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, at: nowIso }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ids = due.map((r) => r.id);
    const { error: updErr } = await supabase
      .from('reminders')
      .update({ fired_at: nowIso, notification_sent: true })
      .in('id', ids);

    if (updErr) throw updErr;

    const notificationRows = due
      .map((r) => {
        const task = Array.isArray((r as any).tasks) ? (r as any).tasks[0] : (r as any).tasks;
        if (!task?.user_id || !task?.workspace_id) return null;
        return {
          user_id: task.user_id,
          type: 'task_reminder',
          workspace_id: task.workspace_id,
          payload: {
            task_id: r.task_id,
            task_title: task.title,
            reminder_id: r.id,
            trigger_at: r.trigger_at,
          },
        };
      })
      .filter(Boolean);

    if (notificationRows.length > 0) {
      const { error: notifErr } = await supabase.from('notifications').insert(notificationRows);
      if (notifErr) throw notifErr;
    }

    console.log(`[process-reminders] Marcados ${ids.length} lembretes em ${nowIso}`);

    return new Response(
      JSON.stringify({ processed: ids.length, ids, at: nowIso }),
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
