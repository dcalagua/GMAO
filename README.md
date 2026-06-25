# GMAO SaaS – Fase 0 (Fundaciones)

Plataforma GMAO multi-tenant con integraciones SAP/ERP configurables.
Stack: **Supabase (Postgres + Edge Functions Deno)**, multi-tenant **schema-per-tenant**, frontend React+Vite+MUI (fases siguientes).

## Arquitectura: dos planos de datos

```
platform  (plano de control, 1 vez)         tenant_<slug>  (plano de datos, 1 por cliente)
├── tenants                                  ├── functional_locations   (→ SAP IFLOT)
├── plans / subscriptions                    ├── equipment              (→ SAP EQUI)
├── tenant_users  (auth → tenant + rol)      ├── materials  (MRO)       (→ SAP MARA)
├── integration_connections (SAP/ERP)        ├── notifications          (→ SAP QMEL)
├── integration_flows (mapeos + cron)        ├── maintenance_plans      (→ SAP MPLA)
├── sync_jobs                                ├── work_orders            (→ SAP AUFK)
└── audit_log                                ├── work_order_materials   (→ SAP RESB)
                                             ├── labor_confirmations    (→ SAP AFRU)
                                             └── sync_log
```

**Por qué schema-per-tenant y no RLS-por-columna:** aislamiento físico real, backup/restore y borrado por cliente, y segregación que los clientes con SAP exigen en auditoría.

**Por qué Edge Functions y no PostgREST directo:** PostgREST no expone schemas dinámicos. El acceso a datos de tenant pasa por `tenant-data`, que fija `search_path = tenant_<slug>` por request según el `tenant_id` del JWT.

## Componentes Fase 0

| Archivo | Rol |
|---|---|
| `supabase/migrations/...platform_control_plane.sql` | Schema `platform` + planes seed |
| `supabase/migrations/...tenant_provisioning_function.sql` | `provision_tenant_schema()` |
| `supabase/functions/_shared/tenant.ts` | Resolución de tenant + `search_path` |
| `supabase/functions/tenant-provision/index.ts` | Alta atómica de cliente |
| `supabase/functions/tenant-data/index.ts` | CRUD operativo aislado por schema |

## Despliegue (DEV)

```bash
# 1) Migraciones (NO usar db push — usar db query --linked)
supabase db query --linked --file supabase/migrations/20260625120000_platform_control_plane.sql
supabase db query --linked --file supabase/migrations/20260625120100_tenant_provisioning_function.sql

# 2) Edge Functions
supabase functions deploy tenant-provision --project-ref <PROJECT_REF>
supabase functions deploy tenant-data      --project-ref <PROJECT_REF>

# 3) Secret: connection string con service role (para postgres.js)
supabase secrets set SUPABASE_DB_URL="postgresql://postgres:<pwd>@<host>:5432/postgres" \
  --project-ref <PROJECT_REF>
```

## Probar el provisioning

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/tenant-provision" \
  -H "Authorization: Bearer <PLATFORM_ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "acme-peru",
    "name": "ACME Perú S.A.",
    "ownerAuthUserId": "<uuid-de-auth.users>",
    "ownerEmail": "owner@acme.pe",
    "countryCode": "PE",
    "planCode": "pro"
  }'
```

## Roadmap

| Fase | Contenido |
|---|---|
| **Fase 0** ✅ | Fundaciones: DB schema, Edge Functions, multi-tenant |
| **Fase 1** | Panel de tenants (React): onboarding visual |
| **Fase 2** | Core GMAO web: activos, OT, planes, avisos |
| **Fase 3** | Capa de integración: adaptadores SAP PM/MM/CO-FI, mapeo por UI, `pg_cron` |
| **Fase 4** | PWA de campo offline-first + dashboards (MTBF, MTTR, cumplimiento) |
