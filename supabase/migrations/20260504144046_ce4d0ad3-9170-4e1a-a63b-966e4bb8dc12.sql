CREATE OR REPLACE FUNCTION public.create_project_secure(
  p_workspace_id uuid,
  p_name text,
  p_color text,
  p_parent_id uuid DEFAULT NULL,
  p_is_favorite boolean DEFAULT false,
  p_view_type text DEFAULT 'list',
  p_description text DEFAULT NULL
)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_project public.projects;
  v_position integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF NOT public.is_workspace_member(p_workspace_id, v_user_id) THEN
    RAISE EXCEPTION 'Usuário não participa deste workspace';
  END IF;

  IF p_parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_parent_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'Projeto pai inválido para este workspace';
  END IF;

  SELECT COALESCE(MAX(position), 0) + 1
  INTO v_position
  FROM public.projects
  WHERE workspace_id = p_workspace_id;

  INSERT INTO public.projects (
    user_id,
    workspace_id,
    owner_id,
    visibility,
    name,
    color,
    parent_id,
    is_favorite,
    view_type,
    description,
    position
  ) VALUES (
    v_user_id,
    p_workspace_id,
    v_user_id,
    'private',
    trim(p_name),
    p_color,
    p_parent_id,
    COALESCE(p_is_favorite, false),
    CASE WHEN p_view_type IN ('list', 'board') THEN p_view_type ELSE 'list' END,
    p_description,
    v_position
  )
  RETURNING * INTO v_project;

  RETURN v_project;
END;
$$;

REVOKE ALL ON FUNCTION public.create_project_secure(uuid, text, text, uuid, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_project_secure(uuid, text, text, uuid, boolean, text, text) TO authenticated;