import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";
import { corsHeaders, json } from "../_shared/tenant.ts";

const DB_URL = Deno.env.get("SUPABASE_DB_URL")!;
const sql = postgres(DB_URL, { prepare: false, max: 5 });

interface ProvisionRequest {
  slug:            string;
  name:            string;
  ownerAuthUserId: string;
  ownerEmail:      string;
  ownerName?:      string;
  countryCode?:    string;
  timezone?:       string;
  planCode?:       string;
  fiscalId?:       string;
  fiscalData?:     Record<string, unknown>;
}

function toSchemaName(slug: string): string {
  const norm = slug.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `tenant_${norm}`.slice(0, 57);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  let body: ProvisionRequest;
  try { body = await req.json(); }
  catch { return json({ error: "INVALID_JSON" }, 400); }

  const { slug, name, ownerAuthUserId, ownerEmail } = body;
  if (!slug || !name || !ownerAuthUserId || !ownerEmail) {
    return json({ error: "MISSING_FIELDS",
                  required: ["slug", "name", "ownerAuthUserId", "ownerEmail"] }, 400);
  }

  const schemaName = toSchemaName(slug);

  try {
    const result = await sql.begin(async (tx) => {
      // 1) Plan
      const planCode = body.planCode ?? "free";
      const [plan] = await tx`
        SELECT id FROM platform.plans WHERE code = ${planCode} AND is_active = true LIMIT 1`;
      if (!plan) throw new Error(`PLAN_NOT_FOUND:${planCode}`);

      // 2) Tenant con datos fiscales opcionales
      const [tenant] = await tx`
        INSERT INTO platform.tenants
          (slug, name, schema_name, status, country_code, timezone, fiscal_id, fiscal_data)
        VALUES (
          ${slug}, ${name}, ${schemaName}, 'provisioning',
          ${body.countryCode ?? null},
          ${body.timezone ?? "America/Lima"},
          ${body.fiscalId ?? null},
          ${tx.json(body.fiscalData ?? {})}
        )
        RETURNING id`;

      // 3) Schema físico GMAO
      await tx`SELECT platform.provision_tenant_schema(${schemaName})`;

      // 4) Suscripción trial 14 días
      await tx`
        INSERT INTO platform.subscriptions
          (tenant_id, plan_id, status, trial_ends_at, current_period_start, current_period_end)
        VALUES (${tenant.id}, ${plan.id}, 'trialing',
                now() + interval '14 days', now(), now() + interval '14 days')`;

      // 5) Owner
      await tx`
        INSERT INTO platform.tenant_users
          (tenant_id, auth_user_id, email, full_name, role, is_active, accepted_at)
        VALUES (${tenant.id}, ${ownerAuthUserId}, ${ownerEmail},
                ${body.ownerName ?? null}, 'owner', true, now())`;

      // 6) Activar
      await tx`
        UPDATE platform.tenants
        SET status = 'active', provisioned_at = now()
        WHERE id = ${tenant.id}`;

      // 7) Auditoría
      await tx`
        INSERT INTO platform.audit_log (tenant_id, actor, action, target, detail)
        VALUES (${tenant.id}, ${ownerAuthUserId}, 'tenant.provisioned', ${schemaName},
                ${tx.json({ slug, planCode, fiscalId: body.fiscalId ?? null })})`;

      return { tenantId: tenant.id, schemaName };
    });

    return json({ ok: true, ...result }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("duplicate key") && msg.includes("slug"))
      return json({ error: "SLUG_ALREADY_EXISTS", slug }, 409);
    if (msg.includes("duplicate key") && msg.includes("fiscal_id"))
      return json({ error: "FISCAL_ID_ALREADY_EXISTS", fiscalId: body.fiscalId }, 409);
    return json({ error: "PROVISION_FAILED", detail: msg }, 500);
  }
});
