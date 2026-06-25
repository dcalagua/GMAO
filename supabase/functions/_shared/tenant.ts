// ============================================================================
// GMAO SaaS – _shared/tenant.ts
// ============================================================================
// Núcleo de la estrategia multi-schema sobre Supabase. Como PostgREST no puede
// exponer dinámicamente un schema por tenant, el acceso a datos operativos NO
// usa el cliente supabase-js contra tablas, sino una conexión postgres.js que
// fija el search_path al schema del tenant resuelto desde el JWT.
//
// Flujo:
//   1) El usuario llega con un JWT de Supabase Auth.
//   2) Resolvemos su tenant vía platform.tenant_users (auth_user_id).
//   3) Validamos que el tenant esté 'active'.
//   4) Abrimos conexión con search_path = tenant_<slug>, platform, public.
// ============================================================================

import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

const DB_URL = Deno.env.get("SUPABASE_DB_URL")!;

export interface TenantContext {
  tenantId: string;
  schemaName: string;
  authUserId: string;
  role: string;
  status: string;
}

// Conexión administrativa (sin search_path de tenant) para resolver contexto.
const adminSql = postgres(DB_URL, { prepare: false, max: 5 });

/**
 * Resuelve el tenant de un usuario autenticado a partir de su auth_user_id.
 * Lanza si el usuario no pertenece a ningún tenant o el tenant no está activo.
 */
export async function resolveTenant(authUserId: string): Promise<TenantContext> {
  const rows = await adminSql`
    SELECT t.id            AS tenant_id,
           t.schema_name   AS schema_name,
           t.status        AS status,
           tu.role         AS role
    FROM platform.tenant_users tu
    JOIN platform.tenants t ON t.id = tu.tenant_id
    WHERE tu.auth_user_id = ${authUserId}
      AND tu.is_active = true
    LIMIT 1
  `;

  if (rows.length === 0) throw new Error("USER_HAS_NO_TENANT");
  const r = rows[0];
  if (r.status !== "active") throw new Error(`TENANT_NOT_ACTIVE:${r.status}`);

  return {
    tenantId: r.tenant_id,
    schemaName: r.schema_name,
    authUserId,
    role: r.role,
    status: r.status,
  };
}

/**
 * Ejecuta una función de trabajo con una conexión cuyo search_path apunta al
 * schema del tenant. Garantiza aislamiento: ninguna query puede ver otro schema.
 */
export async function withTenantConnection<T>(
  ctx: TenantContext,
  work: (sql: ReturnType<typeof postgres>) => Promise<T>,
): Promise<T> {
  if (!/^tenant_[a-z0-9_]{1,50}$/.test(ctx.schemaName)) {
    throw new Error("INVALID_SCHEMA_NAME");
  }

  const sql = postgres(DB_URL, {
    prepare: false,
    max: 3,
    connection: {
      search_path: `${ctx.schemaName}, platform, public`,
    },
  });

  try {
    return await work(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Extrae el auth_user_id (sub) del JWT de Supabase sin verificar firma aquí;
 *  la verificación la hace el gateway de Supabase antes de invocar la función. */
export function getAuthUserId(req: Request): string {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("MISSING_AUTH");
  const payload = JSON.parse(atob(token.split(".")[1]));
  if (!payload.sub) throw new Error("INVALID_JWT");
  return payload.sub as string;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
