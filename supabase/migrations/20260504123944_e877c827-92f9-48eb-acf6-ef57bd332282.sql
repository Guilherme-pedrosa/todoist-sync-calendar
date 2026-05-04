-- Tabela de administradores do painel de Produtividade
CREATE TABLE IF NOT EXISTS public.productivity_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  is_super boolean NOT NULL DEFAULT false,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.productivity_admins ENABLE ROW LEVEL SECURITY;

-- Função helper (security definer evita recursão)
CREATE OR REPLACE FUNCTION public.is_productivity_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.productivity_admins WHERE user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_productivity_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.productivity_admins WHERE user_id = _user_id AND is_super = true)
$$;

-- Bootstrap: se a tabela está vazia, qualquer usuário autenticado pode se cadastrar como super admin (1ª vez)
CREATE POLICY "bootstrap super admin"
  ON public.productivity_admins
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND is_super = true
    AND NOT EXISTS (SELECT 1 FROM public.productivity_admins)
  );

-- Super admins podem cadastrar outros admins
CREATE POLICY "super admin manages admins - insert"
  ON public.productivity_admins
  FOR INSERT
  WITH CHECK (public.is_productivity_super_admin(auth.uid()));

CREATE POLICY "super admin manages admins - delete"
  ON public.productivity_admins
  FOR DELETE
  USING (public.is_productivity_super_admin(auth.uid()) AND user_id <> auth.uid());

CREATE POLICY "super admin manages admins - update"
  ON public.productivity_admins
  FOR UPDATE
  USING (public.is_productivity_super_admin(auth.uid()));

-- Admins podem se ver entre si (e ver a lista)
CREATE POLICY "admins can view list"
  ON public.productivity_admins
  FOR SELECT
  USING (public.is_productivity_admin(auth.uid()));

-- Permite que QUALQUER usuário autenticado verifique se ele próprio é admin (necessário pra mostrar/esconder o link no menu)
CREATE POLICY "user can check own row"
  ON public.productivity_admins
  FOR SELECT
  USING (auth.uid() = user_id);

-- Atualiza can_view_activity: agora somente productivity_admins (e o próprio user) veem dados
CREATE OR REPLACE FUNCTION public.can_view_activity(_target_user uuid, _workspace_id uuid, _viewer uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _target_user = _viewer
    OR public.is_productivity_admin(_viewer);
$$;