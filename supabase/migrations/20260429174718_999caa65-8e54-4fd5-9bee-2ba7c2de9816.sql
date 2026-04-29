
-- =========================================================
-- SUB-FASE 2.A.2 — Auditoria de gestão + Vínculo Time↔Projeto
-- =========================================================

-- 1) Auditoria do workspace
CREATE TABLE IF NOT EXISTS public.workspace_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL,
  actor_user_id uuid,
  entity_type   text NOT NULL,
  entity_id     uuid,
  action        text NOT NULL,
  before        jsonb,
  after         jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wal_workspace_created
  ON public.workspace_audit_log (workspace_id, created_at DESC);

ALTER TABLE public.workspace_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wal_select ON public.workspace_audit_log;
CREATE POLICY wal_select
  ON public.workspace_audit_log
  FOR SELECT TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()));

DROP POLICY IF EXISTS wal_insert_self ON public.workspace_audit_log;
CREATE POLICY wal_insert_self
  ON public.workspace_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_workspace_admin(workspace_id, auth.uid())
    AND actor_user_id = auth.uid()
  );

-- 2) Vínculo Time ↔ Projeto (acesso herdado)
CREATE TABLE IF NOT EXISTS public.project_teams (
  project_id    uuid NOT NULL,
  team_id       uuid NOT NULL,
  default_role  public.project_role NOT NULL DEFAULT 'editor',
  added_by      uuid,
  added_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_project_teams_team ON public.project_teams (team_id);

ALTER TABLE public.project_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pt_select ON public.project_teams;
CREATE POLICY pt_select
  ON public.project_teams
  FOR SELECT TO authenticated
  USING (public.has_project_access(project_id, auth.uid()));

DROP POLICY IF EXISTS pt_cud ON public.project_teams;
CREATE POLICY pt_cud
  ON public.project_teams
  FOR ALL TO authenticated
  USING (public.project_role(project_id, auth.uid()) = 'admin'::public.project_role)
  WITH CHECK (public.project_role(project_id, auth.uid()) = 'admin'::public.project_role);

-- 3) Atualizar has_project_access para considerar project_teams
CREATE OR REPLACE FUNCTION public.has_project_access(_project_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    LEFT JOIN public.project_members pm
      ON pm.project_id = p.id AND pm.user_id = _user_id
    LEFT JOIN public.workspace_members wm
      ON wm.workspace_id = p.workspace_id AND wm.user_id = _user_id
    LEFT JOIN public.team_members tm
      ON tm.team_id = p.team_id AND tm.user_id = _user_id
    LEFT JOIN public.project_teams pt
      ON pt.project_id = p.id
    LEFT JOIN public.team_members ptm
      ON ptm.team_id = pt.team_id AND ptm.user_id = _user_id
    WHERE p.id = _project_id
      AND (
        p.owner_id = _user_id
        OR pm.user_id IS NOT NULL
        OR (p.visibility = 'workspace' AND wm.user_id IS NOT NULL)
        OR (p.visibility = 'team'      AND tm.user_id IS NOT NULL)
        OR ptm.user_id IS NOT NULL  -- acesso herdado por time vinculado
      )
  );
$function$;

-- 4) project_role v2: considera default_role do time vinculado
CREATE OR REPLACE FUNCTION public.project_role(_project_id uuid, _user_id uuid)
 RETURNS public.project_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    -- 1) papel direto explícito
    (SELECT role FROM public.project_members
       WHERE project_id = _project_id AND user_id = _user_id),
    CASE
      -- 2) owner do projeto
      WHEN EXISTS (
        SELECT 1 FROM public.projects WHERE id = _project_id AND owner_id = _user_id
      ) THEN 'admin'::public.project_role

      -- 3) admin do workspace
      WHEN EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
        WHERE p.id = _project_id
          AND wm.user_id = _user_id
          AND wm.role IN ('owner','admin')
      ) THEN 'admin'::public.project_role

      -- 4) acesso herdado via project_teams (pega o maior default_role)
      WHEN EXISTS (
        SELECT 1
        FROM public.project_teams pt
        JOIN public.team_members ptm
          ON ptm.team_id = pt.team_id AND ptm.user_id = _user_id
        WHERE pt.project_id = _project_id
      ) THEN (
        SELECT pt.default_role
        FROM public.project_teams pt
        JOIN public.team_members ptm
          ON ptm.team_id = pt.team_id AND ptm.user_id = _user_id
        WHERE pt.project_id = _project_id
        ORDER BY CASE pt.default_role
                   WHEN 'admin' THEN 1
                   WHEN 'editor' THEN 2
                   WHEN 'commenter' THEN 3
                   WHEN 'viewer' THEN 4
                 END
        LIMIT 1
      )

      -- 5) fallback: tem acesso de alguma forma → editor
      WHEN public.has_project_access(_project_id, _user_id) THEN 'editor'::public.project_role

      ELSE NULL
    END
  );
$function$;
