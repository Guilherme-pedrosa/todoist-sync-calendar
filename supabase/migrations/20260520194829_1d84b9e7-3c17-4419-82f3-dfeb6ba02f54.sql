
CREATE OR REPLACE FUNCTION public.notify_project_announcement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project RECORD;
  v_author_name text;
  v_snippet text;
BEGIN
  SELECT p.id, p.name, p.owner_id, p.workspace_id, p.visibility, p.team_id
    INTO v_project
  FROM public.projects p
  WHERE p.id = NEW.project_id;

  IF v_project.id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(pr.display_name, pr.email, 'Alguém')
    INTO v_author_name
  FROM public.profiles pr
  WHERE pr.user_id = NEW.user_id;

  v_snippet := LEFT(COALESCE(NEW.content, ''), 140);
  IF v_snippet = '' AND jsonb_typeof(NEW.attachments) = 'array' AND jsonb_array_length(NEW.attachments) > 0 THEN
    v_snippet := 'Compartilhou ' || jsonb_array_length(NEW.attachments)::text || ' anexo(s)';
  END IF;

  INSERT INTO public.notifications (user_id, type, workspace_id, payload)
  SELECT DISTINCT u.user_id,
    'project_announcement',
    v_project.workspace_id,
    jsonb_build_object(
      'announcement_id', NEW.id,
      'project_id', v_project.id,
      'project_name', v_project.name,
      'author_id', NEW.user_id,
      'author_name', v_author_name,
      'snippet', v_snippet,
      'has_attachments', (jsonb_typeof(NEW.attachments) = 'array' AND jsonb_array_length(NEW.attachments) > 0)
    )
  FROM (
    SELECT v_project.owner_id AS user_id
    UNION
    SELECT pm.user_id FROM public.project_members pm WHERE pm.project_id = v_project.id
    UNION
    SELECT wm.user_id FROM public.workspace_members wm
      WHERE wm.workspace_id = v_project.workspace_id
        AND v_project.visibility = 'workspace'
    UNION
    SELECT tm.user_id FROM public.team_members tm
      WHERE tm.team_id = v_project.team_id
        AND v_project.visibility = 'team'
    UNION
    SELECT ptm.user_id FROM public.project_teams pt
      JOIN public.team_members ptm ON ptm.team_id = pt.team_id
      WHERE pt.project_id = v_project.id
  ) u
  WHERE u.user_id IS NOT NULL
    AND u.user_id <> NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_project_announcement ON public.project_announcements;
CREATE TRIGGER trg_notify_project_announcement
AFTER INSERT ON public.project_announcements
FOR EACH ROW EXECUTE FUNCTION public.notify_project_announcement();

CREATE INDEX IF NOT EXISTS idx_project_announcements_user
  ON public.project_announcements (user_id, created_at DESC);
