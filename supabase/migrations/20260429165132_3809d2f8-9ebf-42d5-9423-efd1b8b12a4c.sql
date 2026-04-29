
CREATE OR REPLACE FUNCTION public.handle_new_user_projects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ws_id uuid;
BEGIN
  -- Get the personal workspace created by handle_new_user_workspace
  SELECT id INTO ws_id
  FROM public.workspaces
  WHERE owner_id = NEW.id AND is_personal = true
  LIMIT 1;

  -- Fallback: create one if missing (shouldn't happen, but defensive)
  IF ws_id IS NULL THEN
    INSERT INTO public.workspaces (name, slug, owner_id, is_personal)
    VALUES ('Pessoal', 'pessoal-' || NEW.id::text, NEW.id, true)
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO ws_id;

    IF ws_id IS NULL THEN
      SELECT id INTO ws_id FROM public.workspaces WHERE slug = 'pessoal-' || NEW.id::text;
    END IF;

    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (ws_id, NEW.id, 'owner')
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.projects (user_id, workspace_id, owner_id, name, color, is_inbox, position, visibility) VALUES
    (NEW.id, ws_id, NEW.id, 'Caixa de Entrada', 'hsl(230, 10%, 50%)', true, 0, 'private'),
    (NEW.id, ws_id, NEW.id, 'Pessoal', 'hsl(152, 60%, 42%)', false, 1, 'private'),
    (NEW.id, ws_id, NEW.id, 'Trabalho', 'hsl(262, 60%, 55%)', false, 2, 'private');

  RETURN NEW;
END;
$function$;
