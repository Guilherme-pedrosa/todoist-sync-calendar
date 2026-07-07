
CREATE OR REPLACE FUNCTION public.notify_project_announcement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_name text;
  v_workspace_id uuid;
  v_author_name text;
  v_preview text;
BEGIN
  SELECT p.name, p.workspace_id INTO v_project_name, v_workspace_id
  FROM public.projects p WHERE p.id = NEW.project_id;

  SELECT COALESCE(NULLIF(pr.display_name, ''), pr.email, 'Alguém')
    INTO v_author_name
  FROM public.profiles pr WHERE pr.user_id = NEW.user_id;

  v_preview := COALESCE(NULLIF(NEW.content, ''), NULLIF(NEW.content_below, ''), '');
  IF length(v_preview) > 200 THEN
    v_preview := left(v_preview, 200) || '…';
  END IF;

  INSERT INTO public.notifications (user_id, workspace_id, type, payload)
  SELECT DISTINCT u.user_id,
                  v_workspace_id,
                  'project_announcement',
                  jsonb_build_object(
                    'announcement_id', NEW.id,
                    'project_id', NEW.project_id,
                    'project_name', v_project_name,
                    'author_id', NEW.user_id,
                    'author_name', v_author_name,
                    'preview', v_preview,
                    'has_attachments', (jsonb_typeof(NEW.attachments) = 'array' AND jsonb_array_length(NEW.attachments) > 0)
                  )
  FROM (
    SELECT pm.user_id FROM public.project_members pm WHERE pm.project_id = NEW.project_id
    UNION
    SELECT tm.user_id
    FROM public.project_teams pt
    JOIN public.team_members tm ON tm.team_id = pt.team_id
    WHERE pt.project_id = NEW.project_id
    UNION
    SELECT p.owner_id FROM public.projects p WHERE p.id = NEW.project_id AND p.owner_id IS NOT NULL
    UNION
    SELECT p.user_id FROM public.projects p WHERE p.id = NEW.project_id
  ) u
  WHERE u.user_id IS NOT NULL AND u.user_id <> NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_project_announcement ON public.project_announcements;
CREATE TRIGGER trg_notify_project_announcement
AFTER INSERT ON public.project_announcements
FOR EACH ROW EXECUTE FUNCTION public.notify_project_announcement();
