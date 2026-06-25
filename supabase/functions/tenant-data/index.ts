// ============================================================================
// GMAO SaaS – Edge Function: tenant-data
// ============================================================================
// Punto de acceso a los datos OPERATIVOS de un tenant. Demuestra el patrón
// de aislamiento físico: resuelve el tenant del JWT y ejecuta toda query con
// search_path apuntando a su schema. Aquí va el CRUD del core GMAO (Fase 2);
// como arranque incluye las entidades principales como referencia.
//
// Rutas (querystring ?entity=&action=):
//   GET  ?entity=equipment            -> lista
//   POST ?entity=equipment&action=create
// ============================================================================

import {
  corsHeaders,
  getAuthUserId,
  json,
  resolveTenant,
  withTenantConnection,
} from "../_shared/tenant.ts";

// Entidades permitidas y sus columnas insertables (whitelist anti-inyección)
const ENTITIES: Record<string, { table: string; insertable: string[] }> = {
  equipment: {
    table: "equipment",
    insertable: ["code", "name", "description", "functional_location_id",
                 "manufacturer", "model", "serial_number", "criticality", "status"],
  },
  functional_locations: {
    table: "functional_locations",
    insertable: ["code", "name", "description", "parent_id", "cost_center"],
  },
  materials: {
    table: "materials",
    insertable: ["code", "name", "description", "unit", "stock_qty", "min_stock", "unit_cost", "warehouse"],
  },
  work_orders: {
    table: "work_orders",
    insertable: ["code", "equipment_id", "type", "priority", "status", "title", "description", "assigned_to"],
  },
  notifications: {
    table: "notifications",
    insertable: ["code", "equipment_id", "type", "priority", "title", "description", "reported_by"],
  },
  maintenance_plans: {
    table: "maintenance_plans",
    insertable: ["code", "name", "equipment_id", "strategy", "interval_days", "counter_unit", "counter_interval", "next_due_date"],
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const entityKey = url.searchParams.get("entity") ?? "";
  const action = url.searchParams.get("action") ?? "";
  const entity = ENTITIES[entityKey];
  if (!entity) return json({ error: "UNKNOWN_ENTITY", entity: entityKey }, 400);

  let ctx;
  try {
    const authUserId = getAuthUserId(req);
    ctx = await resolveTenant(authUserId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: "AUTH_OR_TENANT_ERROR", detail: msg }, 401);
  }

  try {
    // LISTAR
    if (req.method === "GET") {
      const rows = await withTenantConnection(ctx, (sql) =>
        sql`SELECT * FROM ${sql(entity.table)} ORDER BY created_at DESC LIMIT 200`
      );
      return json({ ok: true, data: rows });
    }

    // CREAR
    if (req.method === "POST" && action === "create") {
      if (!["owner", "admin", "planner"].includes(ctx.role)) {
        return json({ error: "FORBIDDEN", role: ctx.role }, 403);
      }
      const payload = await req.json();
      const cols = entity.insertable.filter((c) => c in payload);
      if (cols.length === 0) return json({ error: "NO_VALID_FIELDS" }, 400);

      const values: Record<string, unknown> = {};
      for (const c of cols) values[c] = payload[c];

      const [created] = await withTenantConnection(ctx, (sql) =>
        sql`INSERT INTO ${sql(entity.table)} ${sql(values, ...cols)} RETURNING *`
      );
      return json({ ok: true, data: created }, 201);
    }

    return json({ error: "UNSUPPORTED_ACTION" }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: "DATA_ERROR", detail: msg }, 500);
  }
});
