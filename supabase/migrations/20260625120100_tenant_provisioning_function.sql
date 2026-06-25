-- ============================================================================
-- GMAO SaaS – Fase 0: PROVISIONING DE TENANT (función)
-- ============================================================================
-- platform.provision_tenant_schema(schema_name TEXT) construye, de forma
-- idempotente, un schema físico aislado con el modelo de dominio GMAO completo
-- para un cliente. Se invoca desde la Edge Function tenant-provision tras
-- insertar la fila en platform.tenants.
--
-- Modelo de dominio (mapeo a SAP PM como referencia funcional):
--   functional_locations   → IFLOT  (ubicaciones técnicas)
--   equipment              → EQUI   (equipos/activos)
--   materials              → MARA   (repuestos MRO)
--   work_orders            → AUFK   (órdenes de mantenimiento)
--   notifications          → QMEL   (avisos)
--   maintenance_plans      → MPLA   (planes de mantenimiento)
--   work_order_materials   → RESB   (consumo de repuestos)
--   labor_confirmations    → AFRU   (confirmaciones de mano de obra)
-- ============================================================================

CREATE OR REPLACE FUNCTION platform.provision_tenant_schema(p_schema_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_schema_name !~ '^tenant_[a-z0-9_]{1,50}$' THEN
        RAISE EXCEPTION 'Nombre de schema inválido: %', p_schema_name;
    END IF;

    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', p_schema_name);

    -- UBICACIONES TÉCNICAS (jerárquicas) – SAP IFLOT
    EXECUTE format($f$
        CREATE TABLE IF NOT EXISTS %I.functional_locations (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code          TEXT NOT NULL,
            name          TEXT NOT NULL,
            description   TEXT,
            parent_id     UUID REFERENCES %I.functional_locations(id) ON DELETE SET NULL,
            level         INTEGER NOT NULL DEFAULT 0,
            path          TEXT,
            cost_center   TEXT,
            is_active     BOOLEAN NOT NULL DEFAULT true,
            sap_key       TEXT,
            sap_synced_at TIMESTAMPTZ,
            sap_sync_status TEXT DEFAULT 'local'
                          CHECK (sap_sync_status IN ('local','synced','pending','error')),
            metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (code)
        )$f$, p_schema_name, p_schema_name);

    -- EQUIPOS / ACTIVOS – SAP EQUI
    EXECUTE format($f$
        CREATE TABLE IF NOT EXISTS %I.equipment (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code          TEXT NOT NULL,
            name          TEXT NOT NULL,
            description   TEXT,
            functional_location_id UUID REFERENCES %I.functional_locations(id) ON DELETE SET NULL,
            manufacturer  TEXT,
            model         TEXT,
            serial_number TEXT,
            criticality   TEXT DEFAULT 'medium'
                          CHECK (criticality IN ('low','medium','high','critical')),
            status        TEXT NOT NULL DEFAULT 'operational'
                          CHECK (status IN ('operational','down','maintenance','decommissioned')),
            install_date  DATE,
            warranty_until DATE,
            sap_key       TEXT,
            sap_synced_at TIMESTAMPTZ,
            sap_sync_status TEXT DEFAULT 'local'
                          CHECK (sap_sync_status IN ('local','synced','pending','error')),
            metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (code)
        )$f$, p_schema_name, p_schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_equip_floc ON %I.equipment(functional_location_id)',
                   replace(p_schema_name,'tenant_',''), p_schema_name);

    -- MATERIALES / REPUESTOS MRO – SAP MARA
    EXECUTE format($f$
        CREATE TABLE IF NOT EXISTS %I.materials (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code          TEXT NOT NULL,
            name          TEXT NOT NULL,
            description   TEXT,
            unit          TEXT NOT NULL DEFAULT 'UN',
            stock_qty     NUMERIC(14,3) NOT NULL DEFAULT 0,
            min_stock     NUMERIC(14,3) NOT NULL DEFAULT 0,
            max_stock     NUMERIC(14,3),
            unit_cost     NUMERIC(14,4) DEFAULT 0,
            warehouse     TEXT,
            sap_key       TEXT,
            sap_synced_at TIMESTAMPTZ,
            sap_sync_status TEXT DEFAULT 'local'
                          CHECK (sap_sync_status IN ('local','synced','pending','error')),
            metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (code)
        )$f$, p_schema_name);

    -- AVISOS / NOTIFICACIONES – SAP QMEL
    EXECUTE format($f$
        CREATE TABLE IF NOT EXISTS %I.notifications (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code          TEXT NOT NULL,
            equipment_id  UUID REFERENCES %I.equipment(id) ON DELETE SET NULL,
            type          TEXT NOT NULL DEFAULT 'malfunction'
                          CHECK (type IN ('malfunction','request','activity')),
            priority      TEXT NOT NULL DEFAULT 'medium'
                          CHECK (priority IN ('low','medium','high','urgent')),
            title         TEXT NOT NULL,
            description   TEXT,
            status        TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','in_review','converted','closed')),
            reported_by   UUID,
            work_order_id UUID,
            sap_key       TEXT,
            sap_synced_at TIMESTAMPTZ,
            sap_sync_status TEXT DEFAULT 'local'
                          CHECK (sap_sync_status IN ('local','synced','pending','error')),
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (code)
        )$f$, p_schema_name, p_schema_name);

    -- PLANES DE MANTENIMIENTO – SAP MPLA
    EXECUTE format($f$
        CREATE TABLE IF NOT EXISTS %I.maintenance_plans (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code          TEXT NOT NULL,
            name          TEXT NOT NULL,
            equipment_id  UUID REFERENCES %I.equipment(id) ON DELETE CASCADE,
            strategy      TEXT NOT NULL DEFAULT 'time'
                          CHECK (strategy IN ('time','counter','condition')),
            interval_days INTEGER,
            counter_unit  TEXT,
            counter_interval NUMERIC(14,2),
            task_list     JSONB NOT NULL DEFAULT '[]'::jsonb,
            next_due_date DATE,
            is_active     BOOLEAN NOT NULL DEFAULT true,
            sap_key       TEXT,
            sap_synced_at TIMESTAMPTZ,
            sap_sync_status TEXT DEFAULT 'local'
                          CHECK (sap_sync_status IN ('local','synced','pending','error')),
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (code)
        )$f$, p_schema_name, p_schema_name);

    -- ÓRDENES DE TRABAJO – SAP AUFK
    EXECUTE format($f$
        CREATE TABLE IF NOT EXISTS %I.work_orders (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code          TEXT NOT NULL,
            equipment_id  UUID REFERENCES %I.equipment(id) ON DELETE SET NULL,
            plan_id       UUID REFERENCES %I.maintenance_plans(id) ON DELETE SET NULL,
            notification_id UUID REFERENCES %I.notifications(id) ON DELETE SET NULL,
            type          TEXT NOT NULL DEFAULT 'corrective'
                          CHECK (type IN ('corrective','preventive','predictive','inspection')),
            priority      TEXT NOT NULL DEFAULT 'medium'
                          CHECK (priority IN ('low','medium','high','urgent')),
            status        TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','planned','released','in_progress','completed','closed','canceled')),
            title         TEXT NOT NULL,
            description   TEXT,
            assigned_to   UUID,
            scheduled_start TIMESTAMPTZ,
            scheduled_end   TIMESTAMPTZ,
            actual_start    TIMESTAMPTZ,
            actual_end      TIMESTAMPTZ,
            labor_cost    NUMERIC(14,2) DEFAULT 0,
            material_cost NUMERIC(14,2) DEFAULT 0,
            total_cost    NUMERIC(14,2) GENERATED ALWAYS AS (COALESCE(labor_cost,0)+COALESCE(material_cost,0)) STORED,
            sap_key       TEXT,
            sap_synced_at TIMESTAMPTZ,
            sap_sync_status TEXT DEFAULT 'local'
                          CHECK (sap_sync_status IN ('local','synced','pending','error')),
            metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (code)
        )$f$, p_schema_name, p_schema_name, p_schema_name, p_schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_wo_status ON %I.work_orders(status)',
                   replace(p_schema_name,'tenant_',''), p_schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_wo_equip ON %I.work_orders(equipment_id)',
                   replace(p_schema_name,'tenant_',''), p_schema_name);

    -- CONSUMO DE REPUESTOS EN OT – SAP RESB
    EXECUTE format($f$
        CREATE TABLE IF NOT EXISTS %I.work_order_materials (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            work_order_id UUID NOT NULL REFERENCES %I.work_orders(id) ON DELETE CASCADE,
            material_id   UUID NOT NULL REFERENCES %I.materials(id),
            qty           NUMERIC(14,3) NOT NULL,
            unit_cost     NUMERIC(14,4) NOT NULL DEFAULT 0,
            line_cost     NUMERIC(14,2) GENERATED ALWAYS AS (qty*unit_cost) STORED,
            consumed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            sap_posted    BOOLEAN NOT NULL DEFAULT false,
            sap_posted_at TIMESTAMPTZ,
            sap_doc_key   TEXT,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )$f$, p_schema_name, p_schema_name, p_schema_name);

    -- CONFIRMACIONES DE MANO DE OBRA – SAP AFRU
    EXECUTE format($f$
        CREATE TABLE IF NOT EXISTS %I.labor_confirmations (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            work_order_id UUID NOT NULL REFERENCES %I.work_orders(id) ON DELETE CASCADE,
            technician_id UUID,
            hours         NUMERIC(8,2) NOT NULL,
            hourly_rate   NUMERIC(12,4) NOT NULL DEFAULT 0,
            line_cost     NUMERIC(14,2) GENERATED ALWAYS AS (hours*hourly_rate) STORED,
            work_date     DATE NOT NULL DEFAULT CURRENT_DATE,
            notes         TEXT,
            sap_posted    BOOLEAN NOT NULL DEFAULT false,
            sap_posted_at TIMESTAMPTZ,
            sap_doc_key   TEXT,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )$f$, p_schema_name, p_schema_name);

    -- LOG LOCAL DE SINCRONIZACIÓN
    EXECUTE format($f$
        CREATE TABLE IF NOT EXISTS %I.sync_log (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            entity        TEXT NOT NULL,
            entity_id     UUID,
            direction     TEXT NOT NULL,
            operation     TEXT NOT NULL,
            status        TEXT NOT NULL,
            payload       JSONB,
            error_detail  TEXT,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )$f$, p_schema_name);

    -- Trigger updated_at compartido dentro del schema del tenant
    EXECUTE format($f$
        CREATE OR REPLACE FUNCTION %I.set_updated_at()
        RETURNS TRIGGER AS $t$
        BEGIN NEW.updated_at = now(); RETURN NEW; END;
        $t$ LANGUAGE plpgsql$f$, p_schema_name);

    PERFORM platform._attach_updated_at_triggers(p_schema_name);
END;
$$;

-- Helper: adjunta el trigger updated_at a cada tabla relevante del schema
CREATE OR REPLACE FUNCTION platform._attach_updated_at_triggers(p_schema_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY['functional_locations','equipment','materials',
                           'notifications','maintenance_plans','work_orders'];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON %I.%I', t, p_schema_name, t);
        EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I.%I
                        FOR EACH ROW EXECUTE FUNCTION %I.set_updated_at()',
                       t, p_schema_name, t, p_schema_name);
    END LOOP;
END;
$$;
