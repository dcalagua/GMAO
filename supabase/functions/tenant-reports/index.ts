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

      if (action === "summary") {
        const [
          woByStatus,
          woByType,
          eqByStatus,
          eqByCrit,
          totals,
          plansDue,
          plansOverdue,
        ] = await Promise.all([
          sql`
            SELECT status, COUNT(*)::int AS count
            FROM work_orders
            GROUP BY status
            ORDER BY count DESC
          `,
          sql`
            SELECT COALESCE(work_order_type, type, 'corrective') AS type,
                   COUNT(*)::int AS count
            FROM work_orders
            GROUP BY 1
            ORDER BY count DESC
          `,
          sql`
            SELECT status, COUNT(*)::int AS count
            FROM equipment
            GROUP BY status
          `,
          sql`
            SELECT criticality, COUNT(*)::int AS count
            FROM equipment
            GROUP BY criticality
            ORDER BY count DESC
          `,
          sql`
            SELECT
              (SELECT COUNT(*)::int FROM equipment WHERE status = 'active')          AS active_equipment,
              (SELECT COUNT(*)::int FROM work_orders)                                AS total_wo,
              (SELECT COUNT(*)::int FROM work_orders
                WHERE status NOT IN ('completed','cancelled'))                       AS open_wo,
              (SELECT COUNT(*)::int FROM work_orders WHERE status = 'completed')     AS completed_wo,
              (SELECT COUNT(*)::int FROM maintenance_plans WHERE is_active = true)   AS active_plans,
              (SELECT COUNT(*)::int FROM maintenance_plans
                WHERE is_active = true AND next_execution < now())                  AS overdue_plans
          `,
          sql`
            SELECT mp.id, mp.code, mp.name, mp.next_execution, mp.frequency_value,
                   mp.frequency_unit, mp.estimated_hours,
                   e.code AS equipment_code, e.name AS equipment_name,
                   EXTRACT(DAY FROM (mp.next_execution - now()))::int AS days_until
            FROM maintenance_plans mp
            LEFT JOIN equipment e ON e.id = mp.equipment_id
            WHERE mp.is_active = true
              AND mp.next_execution BETWEEN now() AND now() + interval '60 days'
            ORDER BY mp.next_execution ASC
            LIMIT 10
          `,
          sql`
            SELECT mp.id, mp.code, mp.name, mp.next_execution,
                   e.code AS equipment_code, e.name AS equipment_name,
                   EXTRACT(DAY FROM (now() - mp.next_execution))::int AS days_overdue
            FROM maintenance_plans mp
            LEFT JOIN equipment e ON e.id = mp.equipment_id
            WHERE mp.is_active = true AND mp.next_execution < now()
            ORDER BY mp.next_execution ASC
            LIMIT 10
          `,
        ]);

        const t = totals[0];
        const completionRate = t.total_wo > 0
          ? Math.round((t.completed_wo / t.total_wo) * 100)
          : 0;

        return json({
          totals: { ...t, completion_rate: completionRate },
          wo_by_status: woByStatus,
          wo_by_type: woByType,
          equipment_by_status: eqByStatus,
          equipment_by_criticality: eqByCrit,
          plans_due_soon: plansDue,
          plans_overdue: plansOverdue,
        });
      }

      return json({ error: "UNKNOWN_ACTION" }, 400);
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "USER_HAS_NO_TENANT") return json({ error: "NO_TENANT" }, 403);
    return json({ error: "INTERNAL_ERROR", detail: msg }, 500);
  }
});
