-- Tabela para chaves de API que sistemas externos usam pra criar tarefas
CREATE TABLE public.external_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  workspace_id uuid NOT NULL,
  default_project_id uuid,
  default_assignee_id uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

ALTER TABLE public.external_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY eak_select ON public.external_api_keys
  FOR SELECT USING (is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY eak_insert ON public.external_api_keys
  FOR INSERT WITH CHECK (
    is_workspace_admin(workspace_id, auth.uid()) AND auth.uid() = created_by
  );

CREATE POLICY eak_update ON public.external_api_keys
  FOR UPDATE USING (is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY eak_delete ON public.external_api_keys
  FOR DELETE USING (is_workspace_admin(workspace_id, auth.uid()));

CREATE INDEX idx_eak_workspace ON public.external_api_keys(workspace_id);
CREATE INDEX idx_eak_hash ON public.external_api_keys(key_hash) WHERE revoked_at IS NULL;