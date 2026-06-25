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
