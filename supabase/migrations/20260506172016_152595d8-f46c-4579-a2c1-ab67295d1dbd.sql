CREATE OR REPLACE FUNCTION public.debug_whoami()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'uid', auth.uid(),
    'role', auth.role(),
    'jwt_sub', current_setting('request.jwt.claim.sub', true),
    'jwt_claims', current_setting('request.jwt.claims', true)
  );
$$;
GRANT EXECUTE ON FUNCTION public.debug_whoami() TO public, anon, authenticated;