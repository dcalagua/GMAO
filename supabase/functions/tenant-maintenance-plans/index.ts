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
          SELECT mp.id, mp.code, mp.name, mp.description,
                 mp.frequency_type, mp.frequency_value, mp.frequency_unit,
                 mp.estimated_hours, mp.last_execution, mp.next_execution,
                 mp.is_active, mp.created_at, mp.updated_at,
                 e.code AS equipment_code, e.name AS equipment_name,
                 mp.equipment_id
          FROM maintenance_plans mp
          LEFT JOIN equipment e ON e.id = mp.equipment_id
          ORDER BY mp.is_active DESC, mp.next_execution ASC NULLS LAST
        `;
        return json({ data: rows });
      }

      if (action === "create") {
        const d = body.data as Record<string, unknown>;
        if (!d?.code || !d?.name) return json({ error: "MISSING_FIELDS", required: ["code", "name"] }, 400);
        const [row] = await sql`
          INSERT INTO maintenance_plans
            (code, name, description, equipment_id, functional_location_id,
             frequency_type, frequency_value, frequency_unit,
             estimated_hours, next_execution, is_active)
          VALUES (
            ${d.code as string}, ${d.name as string},
            ${d.description as string ?? null},
            ${d.equipment_id as string ?? null},
            ${d.functional_location_id as string ?? null},
            ${d.frequency_type as string ?? "calendar"},
            ${d.frequency_value as number ?? null},
            ${d.frequency_unit as string ?? null},
            ${d.estimated_hours as number ?? null},
            ${d.next_execution as string ?? null},
            ${d.is_active !== false}
          )
          RETURNING *
        `;
        return json({ data: row }, 201);
      }

      if (action === "update") {
        const { id, data: d } = body as { id: string; data: Record<string, unknown> };
        if (!id) return json({ error: "MISSING_ID" }, 400);
        const [row] = await sql`
          UPDATE maintenance_plans SET
            name             = COALESCE(${d.name as string ?? null}, name),
            description      = COALESCE(${d.description as string ?? null}, description),
            equipment_id     = COALESCE(${d.equipment_id as string ?? null}, equipment_id),
            frequency_type   = COALESCE(${d.frequency_type as string ?? null}, frequency_type),
            frequency_value  = COALESCE(${d.frequency_value as number ?? null}, frequency_value),
            frequency_unit   = COALESCE(${d.frequency_unit as string ?? null}, frequency_unit),
            estimated_hours  = COALESCE(${d.estimated_hours as number ?? null}, estimated_hours),
            next_execution   = COALESCE(${d.next_execution as string ?? null}, next_execution),
            is_active        = COALESCE(${d.is_active as boolean ?? null}, is_active),
            updated_at       = now()
          WHERE id = ${id}
          RETURNING *
        `;
        if (!row) return json({ error: "NOT_FOUND" }, 404);
        return json({ data: row });
      }

      if (action === "delete") {
        const { id } = body as { id: string };
        if (!id) return json({ error: "MISSING_ID" }, 400);
        await sql`DELETE FROM maintenance_plans WHERE id = ${id}`;
        return json({ ok: true });
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
