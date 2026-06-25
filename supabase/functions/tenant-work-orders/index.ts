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

      if (action === "list") {
        const rows = await sql`
          SELECT wo.id,
                 COALESCE(wo.wo_number, wo.code)      AS wo_number,
                 wo.title, wo.description,
                 COALESCE(wo.work_order_type, wo.type) AS work_order_type,
                 wo.priority, wo.status,
                 COALESCE(wo.planned_start, wo.scheduled_start) AS planned_start,
                 COALESCE(wo.planned_end,   wo.scheduled_end)   AS planned_end,
                 wo.actual_start, wo.actual_end,
                 wo.estimated_hours, wo.actual_hours,
                 wo.notes, wo.sap_key,
                 wo.created_at, wo.updated_at,
                 e.code AS equipment_code, e.name AS equipment_name,
                 wo.equipment_id
          FROM work_orders wo
          LEFT JOIN equipment e ON e.id = wo.equipment_id
          ORDER BY wo.created_at DESC
        `;
        return json({ data: rows });
      }

      if (action === "create") {
        const d = body.data as Record<string, unknown>;
        if (!d?.title) return json({ error: "MISSING_FIELDS", required: ["title"] }, 400);

        const [{ wo_number }] = await sql`
          SELECT 'WO-' || TO_CHAR(now(), 'YYYYMMDD') || '-' ||
                 LPAD((COALESCE(
                   (SELECT MAX(CAST(SPLIT_PART(wo_number,'-',3) AS INT))
                      FROM work_orders
                     WHERE wo_number LIKE 'WO-' || TO_CHAR(now(),'YYYYMMDD') || '-%'),
                   0) + 1)::TEXT, 4, '0') AS wo_number
        `;

        const [row] = await sql`
          INSERT INTO work_orders
            (wo_number, code, title, description,
             work_order_type, type,
             priority, status, equipment_id,
             planned_start, scheduled_start,
             planned_end,   scheduled_end,
             estimated_hours, notes)
          VALUES (
            ${wo_number}, ${wo_number},
            ${d.title as string},
            ${d.description as string ?? null},
            ${d.work_order_type as string ?? "corrective"},
            ${d.work_order_type as string ?? "corrective"},
            ${d.priority as string ?? "medium"},
            ${d.status as string ?? "created"},
            ${d.equipment_id as string ?? null},
            ${d.planned_start as string ?? null},
            ${d.planned_start as string ?? null},
            ${d.planned_end as string ?? null},
            ${d.planned_end as string ?? null},
            ${d.estimated_hours as number ?? null},
            ${d.notes as string ?? null}
          )
          RETURNING *,
            COALESCE(wo_number, code)                AS wo_number,
            COALESCE(work_order_type, type)          AS work_order_type,
            COALESCE(planned_start, scheduled_start) AS planned_start,
            COALESCE(planned_end,   scheduled_end)   AS planned_end
        `;
        return json({ data: row }, 201);
      }

      if (action === "update") {
        const { id, data: d } = body as { id: string; data: Record<string, unknown> };
        if (!id) return json({ error: "MISSING_ID" }, 400);
        const [row] = await sql`
          UPDATE work_orders SET
            title           = COALESCE(${d.title as string ?? null}, title),
            description     = COALESCE(${d.description as string ?? null}, description),
            work_order_type = COALESCE(${d.work_order_type as string ?? null}, work_order_type),
            type            = COALESCE(${d.work_order_type as string ?? null}, type),
            priority        = COALESCE(${d.priority as string ?? null}, priority),
            status          = COALESCE(${d.status as string ?? null}, status),
            equipment_id    = COALESCE(${d.equipment_id as string ?? null}, equipment_id),
            planned_start   = COALESCE(${d.planned_start as string ?? null}, planned_start),
            scheduled_start = COALESCE(${d.planned_start as string ?? null}, scheduled_start),
            planned_end     = COALESCE(${d.planned_end as string ?? null}, planned_end),
            scheduled_end   = COALESCE(${d.planned_end as string ?? null}, scheduled_end),
            actual_start    = COALESCE(${d.actual_start as string ?? null}, actual_start),
            actual_end      = COALESCE(${d.actual_end as string ?? null}, actual_end),
            estimated_hours = COALESCE(${d.estimated_hours as number ?? null}, estimated_hours),
            actual_hours    = COALESCE(${d.actual_hours as number ?? null}, actual_hours),
            notes           = COALESCE(${d.notes as string ?? null}, notes),
            updated_at      = now()
          WHERE id = ${id}
          RETURNING *
        `;
        if (!row) return json({ error: "NOT_FOUND" }, 404);
        return json({ data: row });
      }

      if (action === "delete") {
        const { id } = body as { id: string };
        if (!id) return json({ error: "MISSING_ID" }, 400);
        await sql`DELETE FROM work_orders WHERE id = ${id}`;
        return json({ ok: true });
      }

      return json({ error: "UNKNOWN_ACTION" }, 400);
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "USER_HAS_NO_TENANT") return json({ error: "NO_TENANT" }, 403);
    return json({ error: "INTERNAL_ERROR", detail: msg }, 500);
  }
});
