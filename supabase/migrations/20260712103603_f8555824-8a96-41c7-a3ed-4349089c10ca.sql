
REVOKE EXECUTE ON FUNCTION public.grant_super_admin_by_email(TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revoke_super_admin(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_super_admins() FROM anon;
