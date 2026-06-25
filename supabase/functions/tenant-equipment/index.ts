import { getAuthUserId, resolveTenant, withTenantConnection, corsHeaders, json } from "../_shared/tenant.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const authUserId = getAuthUserId(req);
    const ctx = await resolveTenant(authUserId);
    const body = await req.json() as Record<string, unknown>;
    const action = body.action as string;

    return await withTenantConnection(ctx, async (sql) => {

      // ── LIST ──────────────────────────────────────────────────────────────
      if (action === "list") {
        const rows = await sql`
          SELECT e.id, e.code, e.name, e.description, e.equipment_type,
                 e.manufacturer, e.model, e.serial_number,
                 e.install_date, e.status, e.criticality,
                 e.sap_key, e.created_at, e.updated_at,
                 fl.name AS location_name,
                 e.functional_location_id
          FROM equipment e
          LEFT JOIN functional_locations fl ON fl.id = e.functional_location_id
          ORDER BY e.created_at DESC
        `;
        return json({ data: rows });
      }

      // ── CREATE ────────────────────────────────────────────────────────────
      if (action === "create") {
        const d = body.data as Record<string, unknown>;
        if (!d?.code || !d?.name) return json({ error: "MISSING_FIELDS", required: ["code","name"] }, 400);
        const [row] = await sql`
          INSERT INTO equipment
            (code, name, description, equipment_type, manufacturer, model,
             serial_number, install_date, status, criticality, functional_location_id)
          VALUES (
            ${d.code as string}, ${d.name as string},
            ${d.description as string ?? null}, ${d.equipment_type as string ?? null},
            ${d.manufacturer as string ?? null}, ${d.model as string ?? null},
            ${d.serial_number as string ?? null}, ${d.install_date as string ?? null},
            ${d.status as string ?? "operational"}, ${d.criticality as string ?? "medium"},
            ${d.functional_location_id as string ?? null}
          )
          RETURNING *
        `;
        return json({ data: row }, 201);
      }

      // ── UPDATE ────────────────────────────────────────────────────────────
      if (action === "update") {
        const { id, data: d } = body as { id: string; data: Record<string, unknown> };
        if (!id) return json({ error: "MISSING_ID" }, 400);
        const [row] = await sql`
          UPDATE equipment SET
            name             = COALESCE(${d.name as string ?? null}, name),
            description      = COALESCE(${d.description as string ?? null}, description),
            equipment_type   = COALESCE(${d.equipment_type as string ?? null}, equipment_type),
            manufacturer     = COALESCE(${d.manufacturer as string ?? null}, manufacturer),
            model            = COALESCE(${d.model as string ?? null}, model),
            serial_number    = COALESCE(${d.serial_number as string ?? null}, serial_number),
            status           = COALESCE(${d.status as string ?? null}, status),
            criticality      = COALESCE(${d.criticality as string ?? null}, criticality),
            updated_at       = now()
          WHERE id = ${id}
          RETURNING *
        `;
        if (!row) return json({ error: "NOT_FOUND" }, 404);
        return json({ data: row });
      }

      // ── DELETE ────────────────────────────────────────────────────────────
      if (action === "delete") {
        const { id } = body as { id: string };
        if (!id) return json({ error: "MISSING_ID" }, 400);
        await sql`DELETE FROM equipment WHERE id = ${id}`;
        return json({ ok: true });
      }

      // ── Detalle + historial ────────────────────────────────────────────────
      if (action === "detail") {
        const { id } = body as { id: string };
        if (!id) return json({ error: "MISSING_ID" }, 400);

        const [equipment] = await sql`
          SELECT e.*, fl.name AS location_name, fl.code AS location_code
          FROM equipment e
          LEFT JOIN functional_locations fl ON fl.id = e.functional_location_id
          WHERE e.id = ${id}
        `;
        if (!equipment) return json({ error: "NOT_FOUND" }, 404);

        const workOrders = await sql`
          SELECT id, COALESCE(wo_number, code) AS wo_number, title,
                 COALESCE(work_order_type, type) AS work_order_type,
                 priority, status,
                 COALESCE(planned_start, scheduled_start) AS planned_start,
                 actual_hours, assigned_to_name, created_at
          FROM work_orders
          WHERE equipment_id = ${id}
          ORDER BY created_at DESC
          LIMIT 50
        `;

        const plans = await sql`
          SELECT id, code, name, frequency_value, frequency_unit,
                 next_execution, last_execution, is_active
          FROM maintenance_plans
          WHERE equipment_id = ${id}
          ORDER BY is_active DESC, next_execution ASC NULLS LAST
        `;

        // métricas agregadas
        const [stats] = await sql`
          SELECT
            COUNT(*)::int AS total_wo,
            COUNT(*) FILTER (WHERE status IN ('completed','closed'))::int AS completed_wo,
            COALESCE(SUM(actual_hours) FILTER (WHERE status IN ('completed','closed')), 0)::numeric AS total_hours
          FROM work_orders WHERE equipment_id = ${id}
        `;

        return json({ equipment, work_orders: workOrders, plans, stats });
      }

      return json({ error: "UNKNOWN_ACTION" }, 400);
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "USER_HAS_NO_TENANT") return json({ error: "NO_TENANT" }, 403);
    if (msg.includes("duplicate key") && msg.includes("code"))
      return json({ error: "CODE_ALREADY_EXISTS" }, 409);
    return json({ error: "INTERNAL_ERROR", detail: msg }, 500);
  }
});
