import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";
import { sendEmail, emailConfigured } from "../_shared/email.ts";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 4 });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Guardado por secreto compartido (no usa JWT)
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== Deno.env.get("CRON_SECRET")) return json({ error: "UNAUTHORIZED" }, 401);

  try {
    const tenants = await sql`
      SELECT t.id AS tenant_id, t.schema_name,
             COALESCE(s.notify_overdue, true)   AS notify_overdue,
             COALESCE(s.notify_email, true)     AS notify_email,
             COALESCE(s.overdue_alert_days, 7)  AS alert_days,
             COALESCE(s.low_stock_alerts, true) AS low_stock_alerts
      FROM platform.tenants t
      LEFT JOIN platform.tenant_settings s ON s.tenant_id = t.id
      WHERE t.status = 'active'
    `;

    let processed = 0;
    const canEmail = emailConfigured();

    for (const t of tenants) {
      if (!t.notify_overdue) continue;
      if (!/^tenant_[a-z0-9_]{1,50}$/.test(t.schema_name)) continue;

      // Evitar duplicar: ¿ya se notificó hoy a este tenant?
      const [{ exists: alreadyToday }] = await sql`
        SELECT EXISTS(
          SELECT 1 FROM platform.notifications
          WHERE tenant_id = ${t.tenant_id} AND type = 'plan_overdue'
            AND created_at::date = now()::date
        ) AS exists
      `;
      if (alreadyToday) continue;

      // Planes vencidos o por vencer dentro de la ventana de alerta
      const plans = await sql.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL search_path TO "${t.schema_name}", platform, public`);
        return await tx`
          SELECT mp.name, mp.next_execution,
                 e.name AS equipment_name,
                 (mp.next_execution < now()) AS is_overdue
          FROM maintenance_plans mp
          LEFT JOIN equipment e ON e.id = mp.equipment_id
          WHERE mp.is_active = true
            AND mp.next_execution IS NOT NULL
            AND mp.next_execution <= now() + (${t.alert_days}::text || ' days')::interval
          ORDER BY mp.next_execution ASC
        ` as unknown as Array<{ name: string; next_execution: string; equipment_name: string | null; is_overdue: boolean }>;
      }) as unknown as Array<{ name: string; next_execution: string; equipment_name: string | null; is_overdue: boolean }>;

      if (plans.length === 0) continue;

      const overdue = plans.filter((p) => p.is_overdue).length;
      const upcoming = plans.length - overdue;
      const title = `${plans.length} plan(es) requieren atención`;
      const bodyParts: string[] = [];
      if (overdue > 0) bodyParts.push(`${overdue} vencido(s)`);
      if (upcoming > 0) bodyParts.push(`${upcoming} por vencer en ${t.alert_days} días`);
      const body = bodyParts.join(" · ");

      // Notificación in-app para todo el tenant
      await sql`
        INSERT INTO platform.notifications (tenant_id, auth_user_id, type, title, body, link)
        VALUES (${t.tenant_id}, NULL, 'plan_overdue', ${title}, ${body}, '/maintenance-plans')
      `;
      processed++;

      // Email a owners/admins del tenant
      if (t.notify_email && canEmail) {
        const recipients = await sql`
          SELECT u.email
          FROM platform.tenant_users tu
          JOIN auth.users u ON u.id = tu.auth_user_id
          WHERE tu.tenant_id = ${t.tenant_id} AND tu.is_active = true
            AND tu.role IN ('owner','admin')
        ` as unknown as Array<{ email: string }>;

        const rows = plans.slice(0, 15).map((p) => {
          const d = new Date(p.next_execution).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
          const tag = p.is_overdue ? "<span style='color:#d32f2f;font-weight:bold'>VENCIDO</span>" : d;
          return `<tr><td style='padding:4px 8px'>${p.name}</td><td style='padding:4px 8px'>${p.equipment_name ?? "—"}</td><td style='padding:4px 8px'>${tag}</td></tr>`;
        }).join("");

        const html = `<div style="font-family:Arial,sans-serif">
          <h2 style="color:#e65100">Planes de mantenimiento que requieren atención</h2>
          <p>${body}</p>
          <table style="border-collapse:collapse;font-size:14px">
            <tr style='background:#f5f5f5'><th style='padding:4px 8px;text-align:left'>Plan</th><th style='padding:4px 8px;text-align:left'>Equipo</th><th style='padding:4px 8px;text-align:left'>Vence</th></tr>
            ${rows}
          </table>
          <p style="color:#666;margin-top:16px">Ingresa al GMAO para programar las órdenes de trabajo.</p>
        </div>`;

        for (const r of recipients) {
          await sendEmail(r.email, `GMAO: ${title}`, html);
        }
      }
    }

    // ── Alertas de stock bajo ──────────────────────────────────────────────
    let lowStockNotified = 0;
    for (const t of tenants) {
      if (!t.low_stock_alerts) continue;
      if (!/^tenant_[a-z0-9_]{1,50}$/.test(t.schema_name)) continue;

      const [{ exists: alreadyToday }] = await sql`
        SELECT EXISTS(
          SELECT 1 FROM platform.notifications
          WHERE tenant_id = ${t.tenant_id} AND type = 'low_stock'
            AND created_at::date = now()::date
        ) AS exists
      `;
      if (alreadyToday) continue;

      const mats = await sql.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL search_path TO "${t.schema_name}", platform, public`);
        return await tx`
          SELECT code, name, stock_qty, min_stock, unit, (stock_qty <= 0) AS out_of_stock
          FROM materials
          WHERE stock_qty <= min_stock
          ORDER BY (stock_qty <= 0) DESC, name ASC
        ` as unknown as Array<{ code: string; name: string; stock_qty: number; min_stock: number; unit: string; out_of_stock: boolean }>;
      }) as unknown as Array<{ code: string; name: string; stock_qty: number; min_stock: number; unit: string; out_of_stock: boolean }>;

      if (mats.length === 0) continue;

      const outCount = mats.filter((m) => m.out_of_stock).length;
      const title = `${mats.length} repuesto(s) con stock bajo`;
      const body = outCount > 0 ? `${outCount} agotado(s) · ${mats.length - outCount} bajo mínimo` : `${mats.length} bajo el mínimo`;

      await sql`
        INSERT INTO platform.notifications (tenant_id, auth_user_id, type, title, body, link)
        VALUES (${t.tenant_id}, NULL, 'low_stock', ${title}, ${body}, '/inventory')
      `;
      lowStockNotified++;

      if (t.notify_email && canEmail) {
        const recipients = await sql`
          SELECT u.email FROM platform.tenant_users tu
          JOIN auth.users u ON u.id = tu.auth_user_id
          WHERE tu.tenant_id = ${t.tenant_id} AND tu.is_active = true AND tu.role IN ('owner','admin')
        ` as unknown as Array<{ email: string }>;
        const rows = mats.slice(0, 20).map((m) => {
          const tag = m.out_of_stock ? "<span style='color:#d32f2f;font-weight:bold'>AGOTADO</span>" : `${m.stock_qty} ${m.unit}`;
          return `<tr><td style='padding:4px 8px'>${m.code}</td><td style='padding:4px 8px'>${m.name}</td><td style='padding:4px 8px'>${tag}</td><td style='padding:4px 8px'>${m.min_stock} ${m.unit}</td></tr>`;
        }).join("");
        const html = `<div style="font-family:Arial,sans-serif">
          <h2 style="color:#e65100">Repuestos con stock bajo</h2>
          <p>${body}</p>
          <table style="border-collapse:collapse;font-size:14px">
            <tr style='background:#f5f5f5'><th style='padding:4px 8px;text-align:left'>Código</th><th style='padding:4px 8px;text-align:left'>Repuesto</th><th style='padding:4px 8px;text-align:left'>Stock</th><th style='padding:4px 8px;text-align:left'>Mínimo</th></tr>
            ${rows}
          </table>
          <p style="color:#666;margin-top:16px">Ingresa al GMAO para reponer el inventario.</p>
        </div>`;
        for (const r of recipients) await sendEmail(r.email, `GMAO: ${title}`, html);
      }
    }

    return json({ ok: true, tenants_notified: processed, low_stock_notified: lowStockNotified });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("cron-notify-plans error:", msg);
    return json({ error: "INTERNAL_ERROR", detail: msg }, 500);
  }
});
