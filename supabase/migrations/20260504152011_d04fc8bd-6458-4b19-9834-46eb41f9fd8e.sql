-- Etapa 1: schema para integração FleetDesk
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS external_ref text,
  ADD COLUMN IF NOT EXISTS assignee text,
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS last_sync_source text;

CREATE UNIQUE INDEX IF NOT EXISTS tasks_external_ref_unique
  ON public.tasks(external_ref)
  WHERE external_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fleetdesk_task_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  external_ref text NOT NULL UNIQUE,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  last_sync_source text
);

ALTER TABLE public.fleetdesk_task_links ENABLE ROW LEVEL SECURITY;

-- Apenas service_role manipula este vínculo (edge functions)
DROP POLICY IF EXISTS "service role manages fleetdesk links" ON public.fleetdesk_task_links;
CREATE POLICY "service role manages fleetdesk links"
  ON public.fleetdesk_task_links
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Leitura por usuários que enxergam a task
DROP POLICY IF EXISTS "users can view links of accessible tasks" ON public.fleetdesk_task_links;
CREATE POLICY "users can view links of accessible tasks"
  ON public.fleetdesk_task_links
  FOR SELECT
  USING (public.has_task_access(task_id, auth.uid()));