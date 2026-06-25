-- Exponer schema platform a PostgREST y corregir permisos
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, platform';

GRANT USAGE ON SCHEMA platform TO authenticated, anon, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA platform TO authenticated;
GRANT SELECT ON platform.plans TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA platform TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA platform TO service_role;

DROP POLICY IF EXISTS tenants_authenticated_read ON platform.tenants;
CREATE POLICY tenants_authenticated_read
  ON platform.tenants FOR SELECT TO authenticated USING (true);

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
