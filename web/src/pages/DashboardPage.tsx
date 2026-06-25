import { useEffect, useState } from "react";
import {
  Box, Grid, Card, CardContent, Typography, CircularProgress,
  Chip, Divider, Button, Skeleton,
} from "@mui/material";
import {
  Business, CheckCircle, Warning, PrecisionManufacturing,
  Assignment, ArrowForward,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { callFn } from "../lib/api";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Summary {
  totals: {
    active_equipment: number; total_wo: number; open_wo: number;
    completed_wo: number; active_plans: number; overdue_plans: number;
    completion_rate: number;
  };
  plans_overdue: { id: string; code: string; name: string; next_execution: string;
                   equipment_name: string | null; days_overdue: number }[];
}

interface KpiProps {
  title: string; value: string | number; icon: React.ReactNode;
  color: string; sub?: string; loading: boolean; onClick?: () => void;
}

function KpiCard({ title, value, icon, color, sub, loading, onClick }: KpiProps) {
  return (
    <Card sx={{ height: "100%", cursor: onClick ? "pointer" : "default",
                transition: "box-shadow .2s", "&:hover": onClick ? { boxShadow: 4 } : {} }}
          onClick={onClick}>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Box>
            <Typography variant="body2" color="text.secondary">{title}</Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, mt: 0.5 }}>
              {loading ? <CircularProgress size={26} /> : value}
            </Typography>
            {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
          </Box>
          <Box sx={{ bgcolor: color, borderRadius: 2, p: 1.2, opacity: 0.9 }}>{icon}</Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [tenantCount, setTenantCount] = useState<number | null>(null);

  useEffect(() => {
    callFn<Summary>("tenant-reports", { action: "summary" })
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));

    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id;
      if (!uid) return;
      supabase.schema("platform").from("admin_users")
        .select("auth_user_id").eq("auth_user_id", uid).maybeSingle()
        .then(({ data: admin }) => {
          if (admin) {
            setIsPlatformAdmin(true);
            supabase.schema("platform").from("tenants").select("id")
              .then(({ data: t }) => setTenantCount(t?.length ?? 0));
          }
        });
    });
  }, []);

  const t = summary?.totals;

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 0.5 }}>Panel de control</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Resumen operativo de mantenimiento
      </Typography>

      {/* ── KPIs GMAO ─────────────────────────────────────────────────────── */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard title="Equipos operativos" value={t?.active_equipment ?? 0}
            icon={<PrecisionManufacturing sx={{ color: "white", fontSize: 22 }} />}
            color="#1976D2" loading={loading} onClick={() => navigate("/equipment")} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard title="OTs abiertas" value={t?.open_wo ?? 0}
            icon={<Assignment sx={{ color: "white", fontSize: 22 }} />}
            color="#F57C00" sub={`de ${t?.total_wo ?? 0} totales`}
            loading={loading} onClick={() => navigate("/work-orders")} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard title="Cumplimiento" value={`${t?.completion_rate ?? 0}%`}
            icon={<CheckCircle sx={{ color: "white", fontSize: 22 }} />}
            color="#388E3C" sub={`${t?.completed_wo ?? 0} completadas`}
            loading={loading} onClick={() => navigate("/reports")} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard title="Planes vencidos" value={t?.overdue_plans ?? 0}
            icon={<Warning sx={{ color: "white", fontSize: 22 }} />}
            color={t?.overdue_plans ? "#D32F2F" : "#388E3C"}
            sub={`de ${t?.active_plans ?? 0} activos`}
            loading={loading} onClick={() => navigate("/maintenance-plans")} />
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        {/* ── Planes vencidos ─────────────────────────────────────────────── */}
        <Grid size={{ xs: 12, md: isPlatformAdmin ? 8 : 12 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Warning color="error" fontSize="small" />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Mantenimientos vencidos
                  </Typography>
                </Box>
                <Button size="small" endIcon={<ArrowForward />} onClick={() => navigate("/maintenance-plans")}>
                  Ver planes
                </Button>
              </Box>
              <Divider sx={{ mb: 1.5 }} />
              {loading ? <Skeleton variant="rectangular" height={120} /> : (
                (summary?.plans_overdue?.length ?? 0) === 0 ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 3, justifyContent: "center" }}>
                    <CheckCircle color="success" fontSize="small" />
                    <Typography color="text.secondary">Todo al día. No hay mantenimientos vencidos.</Typography>
                  </Box>
                ) : (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {summary?.plans_overdue.slice(0, 6).map((p) => (
                      <Box key={p.id} sx={{ display: "flex", alignItems: "center",
                            justifyContent: "space-between", py: 0.75,
                            borderBottom: "1px solid", borderColor: "divider" }}>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{p.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {p.equipment_name ?? "Sin equipo"} · venció {fmtDate(p.next_execution)}
                          </Typography>
                        </Box>
                        <Chip label={`${p.days_overdue}d`} color="error" size="small" />
                      </Box>
                    ))}
                  </Box>
                )
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* ── Sección plataforma (solo admins) ────────────────────────────── */}
        {isPlatformAdmin && (
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ height: "100%" }}>
              <CardContent>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                  <Business color="primary" fontSize="small" />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Plataforma</Typography>
                </Box>
                <Divider sx={{ mb: 2 }} />
                <Box sx={{ textAlign: "center", py: 2 }}>
                  <Typography variant="h2" sx={{ fontWeight: 700, color: "primary.main" }}>
                    {tenantCount ?? <CircularProgress size={32} />}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">Tenants registrados</Typography>
                </Box>
                <Button fullWidth variant="outlined" endIcon={<ArrowForward />}
                  onClick={() => navigate("/tenants")} sx={{ mt: 1 }}>
                  Administrar tenants
                </Button>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
