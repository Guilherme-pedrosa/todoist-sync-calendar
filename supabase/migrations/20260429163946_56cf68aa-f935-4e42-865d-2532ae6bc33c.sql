-- =========================================================
-- PHASE 1: Multi-tenant workspaces, teams, roles
-- =========================================================

-- ---------- BACKUPS ----------
CREATE TABLE IF NOT EXISTS public.projects_backup_pre_phase4 AS SELECT * FROM public.projects;
CREATE TABLE IF NOT EXISTS public.tasks_backup_pre_phase4    AS SELECT * FROM public.tasks;
CREATE TABLE IF NOT EXISTS public.labels_backup_pre_phase4   AS SELECT * FROM public.labels;

-- ---------- ENUMS ----------
DO $$ BEGIN
  CREATE TYPE public.workspace_role     AS ENUM ('owner','admin','member','guest');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.team_role          AS ENUM ('lead','member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.project_role       AS ENUM ('admin','editor','commenter','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.project_visibility AS ENUM ('private','team','workspace');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- WORKSPACES ----------
CREATE TABLE IF NOT EXISTS public.workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  owner_id    uuid NOT NULL,
  is_personal boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.workspace_members (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,
  role         public.workspace_role NOT NULL DEFAULT 'member',
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- ---------- TEAMS ----------
CREATE TABLE IF NOT EXISTS public.teams (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.team_members (
  team_id   uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL,
  role      public.team_role NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- ---------- PROJECTS (extend) ----------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS team_id      uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_id     uuid,
  ADD COLUMN IF NOT EXISTS icon         text,
  ADD COLUMN IF NOT EXISTS visibility   public.project_visibility NOT NULL DEFAULT 'private';

CREATE TABLE IF NOT EXISTS public.project_members (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  role       public.project_role NOT NULL DEFAULT 'editor',
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- ---------- TASK STATUSES ----------
CREATE TABLE IF NOT EXISTS public.task_statuses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT 'hsl(220, 10%, 50%)',
  position    integer NOT NULL DEFAULT 0,
  is_done     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.task_statuses ENABLE ROW LEVEL SECURITY;

-- ---------- TASKS (extend) ----------
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status_id    uuid REFERENCES public.task_statuses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by   uuid;

CREATE TABLE IF NOT EXISTS public.task_assignees (
  task_id    uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid,
  PRIMARY KEY (task_id, user_id)
);
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.task_dependencies (
  task_id            uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.task_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  body       text NOT NULL,
  mentions   jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.task_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  uploaded_by  uuid NOT NULL,
  storage_path text NOT NULL,
  name         text NOT NULL,
  size         integer,
  mime_type    text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.task_activity_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id    uuid,
  action     text NOT NULL,
  payload    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.task_activity_log ENABLE ROW LEVEL SECURITY;

-- ---------- CUSTOM FIELDS ----------
CREATE TABLE IF NOT EXISTS public.custom_fields (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name       text NOT NULL,
  type       text NOT NULL,
  config     jsonb NOT NULL DEFAULT '{}'::jsonb,
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.task_custom_values (
  task_id         uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  custom_field_id uuid NOT NULL REFERENCES public.custom_fields(id) ON DELETE CASCADE,
  value           jsonb,
  PRIMARY KEY (task_id, custom_field_id)
);
ALTER TABLE public.task_custom_values ENABLE ROW LEVEL SECURITY;

-- ---------- AUTOMATIONS ----------
CREATE TABLE IF NOT EXISTS public.automations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name       text NOT NULL,
  trigger    jsonb NOT NULL,
  actions    jsonb NOT NULL,
  enabled    boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

-- ---------- NOTIFICATIONS ----------
CREATE TABLE IF NOT EXISTS public.notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type         text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ---------- EXTERNAL LINKS ----------
CREATE TABLE IF NOT EXISTS public.external_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  source_system text NOT NULL,
  source_url    text NOT NULL,
  source_id     text,
  preview       jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.external_links ENABLE ROW LEVEL SECURITY;

-- ---------- API KEYS / WEBHOOKS ----------
CREATE TABLE IF NOT EXISTS public.workspace_api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  key_hash     text NOT NULL,
  key_prefix   text NOT NULL,
  scopes       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by   uuid NOT NULL,
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workspace_api_keys ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.workspace_webhooks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  url          text NOT NULL,
  secret       text NOT NULL,
  events       jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled      boolean NOT NULL DEFAULT true,
  created_by   uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workspace_webhooks ENABLE ROW LEVEL SECURITY;

-- ---------- LABELS / SETTINGS extend ----------
ALTER TABLE public.labels
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS sync_paused_at timestamptz;

-- =========================================================
-- HELPER FUNCTIONS (SECURITY DEFINER, bypass RLS, no recursion)
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.workspace_role(_workspace_id uuid, _user_id uuid)
RETURNS public.workspace_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.workspace_members
  WHERE workspace_id = _workspace_id AND user_id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_admin(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
      AND role IN ('owner','admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.has_project_access(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    LEFT JOIN public.project_members pm
      ON pm.project_id = p.id AND pm.user_id = _user_id
    LEFT JOIN public.workspace_members wm
      ON wm.workspace_id = p.workspace_id AND wm.user_id = _user_id
    LEFT JOIN public.team_members tm
      ON tm.team_id = p.team_id AND tm.user_id = _user_id
    WHERE p.id = _project_id
      AND (
        p.owner_id = _user_id
        OR pm.user_id IS NOT NULL
        OR (p.visibility = 'workspace' AND wm.user_id IS NOT NULL)
        OR (p.visibility = 'team'      AND tm.user_id IS NOT NULL)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.project_role(_project_id uuid, _user_id uuid)
RETURNS public.project_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT role FROM public.project_members WHERE project_id = _project_id AND user_id = _user_id),
    CASE
      WHEN EXISTS (SELECT 1 FROM public.projects WHERE id = _project_id AND owner_id = _user_id) THEN 'admin'::public.project_role
      WHEN EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
        WHERE p.id = _project_id AND wm.user_id = _user_id AND wm.role IN ('owner','admin')
      ) THEN 'admin'::public.project_role
      WHEN public.has_project_access(_project_id, _user_id) THEN 'editor'::public.project_role
      ELSE NULL
    END
  );
$$;

CREATE OR REPLACE FUNCTION public.has_task_access(_task_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = _task_id
      AND public.has_project_access(t.project_id, _user_id)
  );
$$;

-- =========================================================
-- RLS POLICIES
-- =========================================================

-- workspaces
DROP POLICY IF EXISTS ws_select ON public.workspaces;
CREATE POLICY ws_select ON public.workspaces FOR SELECT
  USING (public.is_workspace_member(id, auth.uid()));
DROP POLICY IF EXISTS ws_insert ON public.workspaces;
CREATE POLICY ws_insert ON public.workspaces FOR INSERT
  WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS ws_update ON public.workspaces;
CREATE POLICY ws_update ON public.workspaces FOR UPDATE
  USING (public.is_workspace_admin(id, auth.uid()));
DROP POLICY IF EXISTS ws_delete ON public.workspaces;
CREATE POLICY ws_delete ON public.workspaces FOR DELETE
  USING (owner_id = auth.uid());

-- workspace_members
DROP POLICY IF EXISTS wm_select ON public.workspace_members;
CREATE POLICY wm_select ON public.workspace_members FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));
DROP POLICY IF EXISTS wm_insert ON public.workspace_members;
CREATE POLICY wm_insert ON public.workspace_members FOR INSERT
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));
DROP POLICY IF EXISTS wm_update ON public.workspace_members;
CREATE POLICY wm_update ON public.workspace_members FOR UPDATE
  USING (public.is_workspace_admin(workspace_id, auth.uid()));
DROP POLICY IF EXISTS wm_delete ON public.workspace_members;
CREATE POLICY wm_delete ON public.workspace_members FOR DELETE
  USING (public.is_workspace_admin(workspace_id, auth.uid()) OR user_id = auth.uid());

-- teams
DROP POLICY IF EXISTS tm_select ON public.teams;
CREATE POLICY tm_select ON public.teams FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));
DROP POLICY IF EXISTS tm_cud ON public.teams;
CREATE POLICY tm_cud ON public.teams FOR ALL
  USING (public.is_workspace_admin(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

-- team_members
DROP POLICY IF EXISTS tmm_select ON public.team_members;
CREATE POLICY tmm_select ON public.team_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_members.team_id AND public.is_workspace_member(t.workspace_id, auth.uid())));
DROP POLICY IF EXISTS tmm_cud ON public.team_members;
CREATE POLICY tmm_cud ON public.team_members FOR ALL
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_members.team_id AND public.is_workspace_admin(t.workspace_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_members.team_id AND public.is_workspace_admin(t.workspace_id, auth.uid())));

-- projects (replace old policies with new workspace-aware ones)
DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can insert own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;

CREATE POLICY proj_select ON public.projects FOR SELECT
  USING (public.has_project_access(id, auth.uid()));
CREATE POLICY proj_insert ON public.projects FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND auth.uid() = owner_id);
CREATE POLICY proj_update ON public.projects FOR UPDATE
  USING (public.project_role(id, auth.uid()) = 'admin');
CREATE POLICY proj_delete ON public.projects FOR DELETE
  USING (public.project_role(id, auth.uid()) = 'admin');

-- project_members
CREATE POLICY pm_select ON public.project_members FOR SELECT
  USING (public.has_project_access(project_id, auth.uid()));
CREATE POLICY pm_cud ON public.project_members FOR ALL
  USING (public.project_role(project_id, auth.uid()) = 'admin')
  WITH CHECK (public.project_role(project_id, auth.uid()) = 'admin');

-- task_statuses
CREATE POLICY ts_select ON public.task_statuses FOR SELECT
  USING (public.has_project_access(project_id, auth.uid()));
CREATE POLICY ts_cud ON public.task_statuses FOR ALL
  USING (public.project_role(project_id, auth.uid()) IN ('admin','editor'))
  WITH CHECK (public.project_role(project_id, auth.uid()) IN ('admin','editor'));

-- tasks (replace old)
DROP POLICY IF EXISTS "Users can view own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can insert own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can update own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can delete own tasks" ON public.tasks;

CREATE POLICY tasks_select ON public.tasks FOR SELECT
  USING (public.has_project_access(project_id, auth.uid()));
CREATE POLICY tasks_insert ON public.tasks FOR INSERT
  WITH CHECK (public.has_project_access(project_id, auth.uid()) AND auth.uid() = user_id);
CREATE POLICY tasks_update ON public.tasks FOR UPDATE
  USING (public.has_project_access(project_id, auth.uid()));
CREATE POLICY tasks_delete ON public.tasks FOR DELETE
  USING (public.has_project_access(project_id, auth.uid()));

-- task_assignees
CREATE POLICY ta_select ON public.task_assignees FOR SELECT
  USING (public.has_task_access(task_id, auth.uid()));
CREATE POLICY ta_cud ON public.task_assignees FOR ALL
  USING (public.has_task_access(task_id, auth.uid()))
  WITH CHECK (public.has_task_access(task_id, auth.uid()));

-- task_dependencies
CREATE POLICY td_select ON public.task_dependencies FOR SELECT
  USING (public.has_task_access(task_id, auth.uid()));
CREATE POLICY td_cud ON public.task_dependencies FOR ALL
  USING (public.has_task_access(task_id, auth.uid()))
  WITH CHECK (public.has_task_access(task_id, auth.uid()));

-- task_comments
CREATE POLICY tc_select ON public.task_comments FOR SELECT
  USING (public.has_task_access(task_id, auth.uid()));
CREATE POLICY tc_insert ON public.task_comments FOR INSERT
  WITH CHECK (public.has_task_access(task_id, auth.uid()) AND auth.uid() = user_id);
CREATE POLICY tc_update ON public.task_comments FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY tc_delete ON public.task_comments FOR DELETE
  USING (auth.uid() = user_id);

-- task_attachments
CREATE POLICY tatt_select ON public.task_attachments FOR SELECT
  USING (public.has_task_access(task_id, auth.uid()));
CREATE POLICY tatt_cud ON public.task_attachments FOR ALL
  USING (public.has_task_access(task_id, auth.uid()))
  WITH CHECK (public.has_task_access(task_id, auth.uid()) AND auth.uid() = uploaded_by);

-- task_activity_log
CREATE POLICY tal_select ON public.task_activity_log FOR SELECT
  USING (public.has_task_access(task_id, auth.uid()));
CREATE POLICY tal_insert ON public.task_activity_log FOR INSERT
  WITH CHECK (public.has_task_access(task_id, auth.uid()));

-- custom_fields
CREATE POLICY cf_select ON public.custom_fields FOR SELECT
  USING (public.has_project_access(project_id, auth.uid()));
CREATE POLICY cf_cud ON public.custom_fields FOR ALL
  USING (public.project_role(project_id, auth.uid()) = 'admin')
  WITH CHECK (public.project_role(project_id, auth.uid()) = 'admin');

-- task_custom_values
CREATE POLICY tcv_select ON public.task_custom_values FOR SELECT
  USING (public.has_task_access(task_id, auth.uid()));
CREATE POLICY tcv_cud ON public.task_custom_values FOR ALL
  USING (public.has_task_access(task_id, auth.uid()))
  WITH CHECK (public.has_task_access(task_id, auth.uid()));

-- automations
CREATE POLICY au_select ON public.automations FOR SELECT
  USING (public.has_project_access(project_id, auth.uid()));
CREATE POLICY au_cud ON public.automations FOR ALL
  USING (public.project_role(project_id, auth.uid()) = 'admin')
  WITH CHECK (public.project_role(project_id, auth.uid()) = 'admin');

-- notifications
CREATE POLICY notif_select ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY notif_update ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY notif_insert ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- external_links
CREATE POLICY el_select ON public.external_links FOR SELECT
  USING (public.has_task_access(task_id, auth.uid()));
CREATE POLICY el_cud ON public.external_links FOR ALL
  USING (public.has_task_access(task_id, auth.uid()))
  WITH CHECK (public.has_task_access(task_id, auth.uid()));

-- workspace_api_keys
CREATE POLICY wak_select ON public.workspace_api_keys FOR SELECT
  USING (public.is_workspace_admin(workspace_id, auth.uid()));
CREATE POLICY wak_cud ON public.workspace_api_keys FOR ALL
  USING (public.is_workspace_admin(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

-- workspace_webhooks
CREATE POLICY wh_select ON public.workspace_webhooks FOR SELECT
  USING (public.is_workspace_admin(workspace_id, auth.uid()));
CREATE POLICY wh_cud ON public.workspace_webhooks FOR ALL
  USING (public.is_workspace_admin(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

-- =========================================================
-- DATA MIGRATION
-- =========================================================
DO $$
DECLARE
  u RECORD;
  ws_id uuid;
  wedo_ws uuid;
  guilherme_id uuid;
BEGIN
  -- Find guilherme
  SELECT id INTO guilherme_id FROM auth.users WHERE email = 'guilherme@wedocorp.com' LIMIT 1;

  -- Create personal workspace per user (idempotent via slug)
  FOR u IN SELECT id, email FROM auth.users LOOP
    INSERT INTO public.workspaces (name, slug, owner_id, is_personal)
    VALUES ('Pessoal', 'pessoal-' || u.id::text, u.id, true)
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO ws_id;

    IF ws_id IS NULL THEN
      SELECT id INTO ws_id FROM public.workspaces WHERE slug = 'pessoal-' || u.id::text;
    END IF;

    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (ws_id, u.id, 'owner')
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Create WEDO shared workspace
  IF guilherme_id IS NOT NULL THEN
    INSERT INTO public.workspaces (name, slug, owner_id, is_personal)
    VALUES ('WEDO', 'wedo', guilherme_id, false)
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO wedo_ws;

    IF wedo_ws IS NULL THEN
      SELECT id INTO wedo_ws FROM public.workspaces WHERE slug = 'wedo';
    END IF;

    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (wedo_ws, guilherme_id, 'owner')
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner';

    -- All other users as member of WEDO
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    SELECT wedo_ws, u2.id, 'member'
    FROM auth.users u2
    WHERE u2.id <> guilherme_id
    ON CONFLICT DO NOTHING;
  END IF;

  -- Migrate projects: private (Caixa de Entrada/Pessoal/Trabalho/is_inbox) -> personal ws of owner
  UPDATE public.projects p
  SET workspace_id = w.id,
      owner_id     = COALESCE(p.owner_id, p.user_id),
      visibility   = 'private'
  FROM public.workspaces w
  WHERE w.slug = 'pessoal-' || p.user_id::text
    AND p.workspace_id IS NULL
    AND (p.is_inbox = true OR p.name IN ('Caixa de Entrada','Pessoal','Trabalho','Inbox'));

  -- Remaining projects -> WEDO workspace, visibility = workspace
  IF wedo_ws IS NOT NULL THEN
    UPDATE public.projects
    SET workspace_id = wedo_ws,
        owner_id     = COALESCE(owner_id, user_id),
        visibility   = 'workspace'
    WHERE workspace_id IS NULL;
  END IF;

  -- Backfill tasks.workspace_id from project
  UPDATE public.tasks t
  SET workspace_id = p.workspace_id,
      created_by   = COALESCE(t.created_by, t.user_id)
  FROM public.projects p
  WHERE p.id = t.project_id AND t.workspace_id IS NULL;

  -- Backfill labels.workspace_id from user's personal workspace
  UPDATE public.labels l
  SET workspace_id = w.id
  FROM public.workspaces w
  WHERE w.slug = 'pessoal-' || l.user_id::text
    AND l.workspace_id IS NULL;

  -- Default statuses per project (3)
  INSERT INTO public.task_statuses (project_id, name, color, position, is_done)
  SELECT p.id, 'A fazer',       'hsl(220, 10%, 50%)', 0, false FROM public.projects p
  WHERE NOT EXISTS (SELECT 1 FROM public.task_statuses s WHERE s.project_id = p.id);

  INSERT INTO public.task_statuses (project_id, name, color, position, is_done)
  SELECT p.id, 'Em andamento',  'hsl(38, 92%, 50%)',  1, false FROM public.projects p
  WHERE NOT EXISTS (SELECT 1 FROM public.task_statuses s WHERE s.project_id = p.id AND s.name = 'Em andamento');

  INSERT INTO public.task_statuses (project_id, name, color, position, is_done)
  SELECT p.id, 'Concluída',     'hsl(152, 60%, 42%)', 2, true  FROM public.projects p
  WHERE NOT EXISTS (SELECT 1 FROM public.task_statuses s WHERE s.project_id = p.id AND s.name = 'Concluída');

  -- Populate task_assignees with current owner
  INSERT INTO public.task_assignees (task_id, user_id, assigned_by)
  SELECT t.id, t.user_id, t.user_id
  FROM public.tasks t
  WHERE NOT EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = t.id);

  -- Pause sync
  UPDATE public.user_settings SET sync_paused_at = now() WHERE sync_paused_at IS NULL;
END $$;

-- Make workspace_id NOT NULL where safe
ALTER TABLE public.projects ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tasks    ALTER COLUMN workspace_id SET NOT NULL;

-- Trigger: auto-create personal workspace for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_workspace()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_ws uuid;
BEGIN
  INSERT INTO public.workspaces (name, slug, owner_id, is_personal)
  VALUES ('Pessoal', 'pessoal-' || NEW.id::text, NEW.id, true)
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO new_ws;

  IF new_ws IS NULL THEN
    SELECT id INTO new_ws FROM public.workspaces WHERE slug = 'pessoal-' || NEW.id::text;
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_ws, NEW.id, 'owner')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created_workspace ON auth.users;
CREATE TRIGGER on_auth_user_created_workspace
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_workspace();

-- updated_at triggers
CREATE TRIGGER trg_workspaces_updated BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_teams_updated BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_task_comments_updated BEFORE UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();