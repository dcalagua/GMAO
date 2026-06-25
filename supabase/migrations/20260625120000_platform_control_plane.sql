-- ============================================================================
-- GMAO SaaS – Fase 0: PLANO DE CONTROL (schema: platform)
-- ============================================================================
-- Este schema vive una sola vez en el proyecto Supabase y gobierna TODOS los
-- tenants. Nunca contiene datos operativos de mantenimiento; solo metadatos
-- de quién es cada cliente, su schema físico, sus usuarios, su plan y sus
-- integraciones (SAP / ERP).
--
-- Convenciones (alineadas a eSupplier):
--   - CREATE ... IF NOT EXISTS siempre
--   - RLS habilitado; el acceso real pasa por Edge Functions con service_role
--   - Timestamps con timezone, defaults now()
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS platform;

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid, cifrado
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- búsquedas

-- ----------------------------------------------------------------------------
-- 1. TENANTS – cada cliente del SaaS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT NOT NULL UNIQUE,              -- identificador url-safe (ej. "acme-peru")
    name            TEXT NOT NULL,                     -- razón social mostrada
    schema_name     TEXT NOT NULL UNIQUE,              -- schema físico: tenant_<slug_normalizado>
    status          TEXT NOT NULL DEFAULT 'provisioning'
                    CHECK (status IN ('provisioning','active','suspended','archived')),
    country_code    TEXT,                              -- PE/EC/BO/... (igual que EBIM)
    timezone        TEXT NOT NULL DEFAULT 'America/Lima',
    locale          TEXT NOT NULL DEFAULT 'es',
    -- Branding por tenant (white-label SaaS)
    primary_color   TEXT DEFAULT '#5AA97F',
    logo_url        TEXT,
    -- Control de ciclo de vida
    provisioned_at  TIMESTAMPTZ,
    suspended_at    TIMESTAMPTZ,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON platform.tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_slug   ON platform.tenants(slug);

-- ----------------------------------------------------------------------------
-- 2. PLANES Y SUSCRIPCIONES SaaS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT NOT NULL UNIQUE,              -- free / pro / enterprise
    name            TEXT NOT NULL,
    max_assets      INTEGER,                           -- NULL = ilimitado
    max_users       INTEGER,
    max_work_orders_month INTEGER,
    allows_integrations BOOLEAN NOT NULL DEFAULT false,-- si puede conectar SAP/ERP
    price_month_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
    features        JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
    plan_id         UUID NOT NULL REFERENCES platform.plans(id),
    status          TEXT NOT NULL DEFAULT 'trialing'
                    CHECK (status IN ('trialing','active','past_due','canceled')),
    trial_ends_at   TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON platform.subscriptions(tenant_id);

-- ----------------------------------------------------------------------------
-- 3. USUARIOS DE TENANT – vincula auth.users de Supabase con un tenant + rol
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.tenant_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
    auth_user_id    UUID NOT NULL,                     -- referencia a auth.users.id
    email           TEXT NOT NULL,
    full_name       TEXT,
    role            TEXT NOT NULL DEFAULT 'technician'
                    CHECK (role IN ('owner','admin','planner','technician','viewer')),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    invited_at      TIMESTAMPTZ,
    accepted_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, auth_user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_auth   ON platform.tenant_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON platform.tenant_users(tenant_id);

-- ----------------------------------------------------------------------------
-- 4. INTEGRACIONES – configuración de conexión a SAP / ERP por tenant
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.integration_connections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
    code            TEXT NOT NULL,
    name            TEXT NOT NULL,
    system_type     TEXT NOT NULL DEFAULT 'sap'
                    CHECK (system_type IN ('sap','erp_generic','rest_api','soap','csv','odata')),
    connection_method TEXT NOT NULL DEFAULT 'rest'
                    CHECK (connection_method IN ('rest','odata','soap','sap_gateway','cpi_middleware','native_connector')),
    base_url        TEXT,
    auth_type       TEXT NOT NULL DEFAULT 'basic'
                    CHECK (auth_type IN ('basic','oauth2','api_key','bearer','none')),
    credentials_enc BYTEA,                             -- pgp_sym_encrypt(JSON, vault_key)
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_tested_at  TIMESTAMPTZ,
    last_test_ok    BOOLEAN,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_integration_conn_tenant ON platform.integration_connections(tenant_id);

-- ----------------------------------------------------------------------------
-- 5. MAPEOS DE FLUJO – qué entidad GMAO se sincroniza con qué objeto SAP/ERP
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.integration_flows (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id   UUID NOT NULL REFERENCES platform.integration_connections(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
    flow_code       TEXT NOT NULL,
    name            TEXT NOT NULL,
    direction       TEXT NOT NULL DEFAULT 'inbound'
                    CHECK (direction IN ('inbound','outbound','bidirectional')),
    local_entity    TEXT NOT NULL,
    remote_object   TEXT NOT NULL,
    field_mapping   JSONB NOT NULL DEFAULT '[]'::jsonb,
    filters         JSONB NOT NULL DEFAULT '{}'::jsonb,
    trigger_type    TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK (trigger_type IN ('scheduled','event','manual')),
    schedule_cron   TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (connection_id, flow_code)
);

CREATE INDEX IF NOT EXISTS idx_integration_flows_tenant ON platform.integration_flows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_flows_conn   ON platform.integration_flows(connection_id);

-- ----------------------------------------------------------------------------
-- 6. SYNC JOBS – historial y estado de cada ejecución de sincronización
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.sync_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
    flow_id         UUID REFERENCES platform.integration_flows(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','running','success','partial','failed')),
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    records_read    INTEGER DEFAULT 0,
    records_written INTEGER DEFAULT 0,
    records_failed  INTEGER DEFAULT 0,
    error_detail    JSONB,
    triggered_by    TEXT DEFAULT 'system',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_tenant ON platform.sync_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON platform.sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_flow   ON platform.sync_jobs(flow_id);

-- ----------------------------------------------------------------------------
-- 7. AUDITORÍA DE PLATAFORMA
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES platform.tenants(id) ON DELETE SET NULL,
    actor           TEXT,
    action          TEXT NOT NULL,
    target          TEXT,
    detail          JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant ON platform.audit_log(tenant_id);

-- ----------------------------------------------------------------------------
-- 8. RLS
-- ----------------------------------------------------------------------------
ALTER TABLE platform.tenants                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.plans                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.subscriptions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenant_users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.integration_flows       ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.sync_jobs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.audit_log               ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_users_self_read" ON platform.tenant_users;
CREATE POLICY "tenant_users_self_read" ON platform.tenant_users
    FOR SELECT TO authenticated
    USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "plans_public_read" ON platform.plans;
CREATE POLICY "plans_public_read" ON platform.plans
    FOR SELECT TO anon, authenticated
    USING (is_active = true);

-- ----------------------------------------------------------------------------
-- 9. TRIGGER updated_at genérico
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tenants_updated ON platform.tenants;
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON platform.tenants
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

DROP TRIGGER IF EXISTS trg_integration_conn_updated ON platform.integration_connections;
CREATE TRIGGER trg_integration_conn_updated BEFORE UPDATE ON platform.integration_connections
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

DROP TRIGGER IF EXISTS trg_integration_flows_updated ON platform.integration_flows;
CREATE TRIGGER trg_integration_flows_updated BEFORE UPDATE ON platform.integration_flows
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- ----------------------------------------------------------------------------
-- 10. SEED de planes base
-- ----------------------------------------------------------------------------
INSERT INTO platform.plans (code, name, max_assets, max_users, max_work_orders_month, allows_integrations, price_month_usd, features)
VALUES
    ('free',       'Free',         50,   3,    100,  false, 0,   '{"mobile":true,"analytics":false}'),
    ('pro',        'Pro',          1000, 25,   5000, true,  99,  '{"mobile":true,"analytics":true,"sap_integration":true}'),
    ('enterprise', 'Enterprise',   NULL, NULL, NULL, true,  499, '{"mobile":true,"analytics":true,"sap_integration":true,"sso":true,"dedicated_support":true}')
ON CONFLICT (code) DO NOTHING;
