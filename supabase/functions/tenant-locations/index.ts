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
          SELECT fl.id, fl.code, fl.name, fl.description,
                 fl.parent_id, fl.level, fl.is_active,
                 fl.sap_key, fl.created_at, fl.updated_at,
                 p.name AS parent_name, p.code AS parent_code
          FROM functional_locations fl
          LEFT JOIN functional_locations p ON p.id = fl.parent_id
          ORDER BY fl.level ASC, fl.code ASC
        `;
        return json({ data: rows });
      }

      if (action === "create") {
        const d = body.data as Record<string, unknown>;
        if (!d?.code || !d?.name) return json({ error: "MISSING_FIELDS", required: ["code", "name"] }, 400);

        // calcular nivel automáticamente según el padre
        let level = 1;
        if (d.parent_id) {
          const [parent] = await sql`SELECT level FROM functional_locations WHERE id = ${d.parent_id as string}`;
          if (parent) level = (parent.level as number) + 1;
        }

        const [row] = await sql`
          INSERT INTO functional_locations (code, name, description, parent_id, level, sap_key, is_active)
          VALUES (
            ${d.code as string}, ${d.name as string},
            ${d.description as string ?? null},
            ${d.parent_id as string ?? null},
            ${level},
            ${d.sap_key as string ?? null},
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
          UPDATE functional_locations SET
            name        = COALESCE(${d.name as string ?? null}, name),
            description = COALESCE(${d.description as string ?? null}, description),
            sap_key     = COALESCE(${d.sap_key as string ?? null}, sap_key),
            is_active   = COALESCE(${d.is_active as boolean ?? null}, is_active),
            updated_at  = now()
          WHERE id = ${id}
          RETURNING *
        `;
        if (!row) return json({ error: "NOT_FOUND" }, 404);
        return json({ data: row });
      }

      if (action === "delete") {
        const { id } = body as { id: string };
        if (!id) return json({ error: "MISSING_ID" }, 400);
        // verificar que no tenga hijos ni equipos asociados
        const [{ cnt }] = await sql`
          SELECT COUNT(*)::int AS cnt FROM functional_locations WHERE parent_id = ${id}
        `;
        if (cnt > 0) return json({ error: "HAS_CHILDREN" }, 409);
        const [{ eq_cnt }] = await sql`
          SELECT COUNT(*)::int AS eq_cnt FROM equipment WHERE functional_location_id = ${id}
        `;
        if (eq_cnt > 0) return json({ error: "HAS_EQUIPMENT" }, 409);
        await sql`DELETE FROM functional_locations WHERE id = ${id}`;
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
