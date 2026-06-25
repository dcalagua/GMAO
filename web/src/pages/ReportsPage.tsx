import { useState, useEffect } from "react";
import {
  Box, Typography, Card, CardContent, Grid, Alert, Chip,
  CircularProgress, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Divider, Skeleton, Tooltip,
} from "@mui/material";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Assessment, Download, Warning, CheckCircle,
  PrecisionManufacturing, Assignment, CalendarMonth,
} from "@mui/icons-material";
import { callFn, callFnCached } from "../lib/api";
import { exportCsv } from "../lib/csv";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Summary {
  totals: {
    active_equipment: number; total_wo: number; open_wo: number;
    completed_wo: number; active_plans: number; overdue_plans: number;
    completion_rate: number;
  };
  wo_by_status: { status: string; count: number }[];
  wo_by_type: { type: string; count: number }[];
  equipment_by_criticality: { criticality: string; count: number }[];
  plans_due_soon: PlanDue[];
  plans_overdue: PlanOverdue[];
}

interface PlanDue {
  id: string; code: string; name: string;
  next_execution: string; days_until: number;
  equipment_code: string | null; equipment_name: string | null;
  estimated_hours: number | null;
}
interface PlanOverdue {
  id: string; code: string; name: string;
  next_execution: string; days_overdue: number;
  equipment_code: string | null; equipment_name: string | null;
}

// ─── Paletas ──────────────────────────────────────────────────────────────────

const WO_STATUS_COLORS: Record<string, string> = {
  draft:       "#90CAF9",
  planned:     "#FFB74D",
  released:    "#BA68C8",
  in_progress: "#66BB6A",
  completed:   "#42A5F5",
  closed:      "#26A69A",
  canceled:    "#BDBDBD",
};
const WO_STATUS_LABELS: Record<string, string> = {
  draft: "Borrador", planned: "Planificada", released: "Liberada",
  in_progress: "En progreso", completed: "Completada", closed: "Cerrada", canceled: "Cancelada",
};
const WO_TYPE_COLORS: Record<string, string> = {
  corrective: "#EF5350", preventive: "#66BB6A", predictive: "#42A5F5",
  inspection: "#FFB74D", other: "#BDBDBD",
};
const WO_TYPE_LABELS: Record<string, string> = {
  corrective: "Correctivo", preventive: "Preventivo",
  predictive: "Predictivo", inspection: "Inspección", other: "Otro",
};
const CRIT_COLORS: Record<string, string> = {
  critical: "#D32F2F", high: "#F57C00", medium: "#1976D2", low: "#388E3C",
};
const CRIT_LABELS: Record<string, string> = {
  critical: "Crítico", high: "Alto", medium: "Medio", low: "Bajo",
};

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function KpiCard({ title, value, icon, color, sub }: {
  title: string; value: string | number; icon: React.ReactNode; color: string; sub?: string;
}) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Box>
            <Typography variant="body2" color="text.secondary">{title}</Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, mt: 0.5 }}>{value}</Typography>
            {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
          </Box>
          <Box sx={{ bgcolor: color, borderRadius: 2, p: 1.2, opacity: 0.9 }}>{icon}</Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>{title}</Typography>
        {children}
      </CardContent>
    </Card>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ReportsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    callFn<Summary>("tenant-reports", { action: "summary" })
      .then(setSummary)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  async function handleExport(entity: "equipment" | "work-orders" | "plans") {
    setExporting(entity);
    try {
      if (entity === "equipment") {
        const res = await callFnCached<{ data: Record<string, unknown>[] }>(
          "tenant-equipment", { action: "list" }, "equipment:list"
        );
        exportCsv(`equipos_${today()}.csv`, res.data, [
          { key: "code", label: "Código" },
          { key: "name", label: "Nombre" },
          { key: "equipment_type", label: "Tipo" },
          { key: "manufacturer", label: "Fabricante" },
          { key: "model", label: "Modelo" },
          { key: "serial_number", label: "N° Serie" },
          { key: "status", label: "Estado" },
          { key: "criticality", label: "Criticidad" },
          { key: "location_name", label: "Ubicación" },
          { key: "install_date", label: "Fecha instalación" },
        ]);
      } else if (entity === "work-orders") {
        const res = await callFnCached<{ data: Record<string, unknown>[] }>(
          "tenant-work-orders", { action: "list" }, "work-orders:list"
        );
        exportCsv(`ordenes_trabajo_${today()}.csv`, res.data, [
          { key: "wo_number", label: "N° OT" },
          { key: "title", label: "Título" },
          { key: "work_order_type", label: "Tipo" },
          { key: "priority", label: "Prioridad" },
          { key: "status", label: "Estado" },
          { key: "equipment_name", label: "Equipo" },
          { key: "planned_start", label: "Inicio planificado" },
          { key: "planned_end", label: "Fin planificado" },
          { key: "estimated_hours", label: "Horas estimadas" },
          { key: "actual_hours", label: "Horas reales" },
        ]);
      } else {
        const res = await callFnCached<{ data: Record<string, unknown>[] }>(
          "tenant-maintenance-plans", { action: "list" }, "plans:list"
        );
        exportCsv(`planes_mantenimiento_${today()}.csv`, res.data, [
          { key: "code", label: "Código" },
          { key: "name", label: "Nombre" },
          { key: "equipment_name", label: "Equipo" },
          { key: "frequency_value", label: "Frecuencia" },
          { key: "frequency_unit", label: "Unidad" },
          { key: "estimated_hours", label: "Horas estimadas" },
          { key: "last_execution", label: "Última ejecución" },
          { key: "next_execution", label: "Próxima ejecución" },
          { key: "is_active", label: "Activo" },
        ]);
      }
    } finally { setExporting(null); }
  }

  const t = summary?.totals;

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Assessment color="primary" />
          <Typography variant="h5">Reportes</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {[
            { id: "equipment" as const, label: "Equipos CSV" },
            { id: "work-orders" as const, label: "OTs CSV" },
            { id: "plans" as const, label: "Planes CSV" },
          ].map(({ id, label }) => (
            <Button key={id} size="small" variant="outlined" startIcon={
              exporting === id ? <CircularProgress size={14} /> : <Download />
            } disabled={!!exporting} onClick={() => handleExport(id)}>
              {label}
            </Button>
          ))}
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          {loading ? <Skeleton variant="rectangular" height={100} /> : (
            <KpiCard title="Equipos activos" value={t?.active_equipment ?? 0}
              icon={<PrecisionManufacturing sx={{ color: "white", fontSize: 22 }} />}
              color="#1976D2" />
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          {loading ? <Skeleton variant="rectangular" height={100} /> : (
            <KpiCard title="OTs abiertas" value={t?.open_wo ?? 0}
              icon={<Assignment sx={{ color: "white", fontSize: 22 }} />}
              color="#F57C00"
              sub={`de ${t?.total_wo ?? 0} totales`} />
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          {loading ? <Skeleton variant="rectangular" height={100} /> : (
            <KpiCard title="Cumplimiento OTs" value={`${t?.completion_rate ?? 0}%`}
              icon={<CheckCircle sx={{ color: "white", fontSize: 22 }} />}
              color="#388E3C"
              sub={`${t?.completed_wo ?? 0} completadas`} />
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          {loading ? <Skeleton variant="rectangular" height={100} /> : (
            <KpiCard title="Planes vencidos" value={t?.overdue_plans ?? 0}
              icon={<Warning sx={{ color: "white", fontSize: 22 }} />}
              color={t?.overdue_plans ? "#D32F2F" : "#388E3C"}
              sub={`de ${t?.active_plans ?? 0} activos`} />
          )}
        </Grid>
      </Grid>

      {/* ── Gráficos ──────────────────────────────────────────────────────── */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 7 }}>
          <ChartCard title="Órdenes de Trabajo por Estado">
            {loading ? <Skeleton variant="rectangular" height={220} /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={(summary?.wo_by_status ?? []).map((d) => ({
                  name: WO_STATUS_LABELS[d.status] ?? d.status,
                  Cantidad: d.count,
                  color: WO_STATUS_COLORS[d.status] ?? "#90CAF9",
                }))}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <RTooltip />
                  <Bar dataKey="Cantidad" radius={[4, 4, 0, 0]}>
                    {(summary?.wo_by_status ?? []).map((d, i) => (
                      <Cell key={i} fill={WO_STATUS_COLORS[d.status] ?? "#90CAF9"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <ChartCard title="OTs por Tipo">
            {loading ? <Skeleton variant="rectangular" height={220} /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={(summary?.wo_by_type ?? []).map((d) => ({
                      name: WO_TYPE_LABELS[d.type] ?? d.type,
                      value: d.count,
                      color: WO_TYPE_COLORS[d.type] ?? "#BDBDBD",
                    }))}
                    cx="50%" cy="50%" outerRadius={75}
                    dataKey="value" label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {(summary?.wo_by_type ?? []).map((d, i) => (
                      <Cell key={i} fill={WO_TYPE_COLORS[d.type] ?? "#BDBDBD"} />
                    ))}
                  </Pie>
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <ChartCard title="Equipos por Criticidad">
            {loading ? <Skeleton variant="rectangular" height={200} /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  layout="vertical"
                  data={(summary?.equipment_by_criticality ?? []).map((d) => ({
                    name: CRIT_LABELS[d.criticality] ?? d.criticality,
                    Equipos: d.count,
                    color: CRIT_COLORS[d.criticality] ?? "#90CAF9",
                  }))}
                >
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={70} />
                  <RTooltip />
                  <Bar dataKey="Equipos" radius={[0, 4, 4, 0]}>
                    {(summary?.equipment_by_criticality ?? []).map((d, i) => (
                      <Cell key={i} fill={CRIT_COLORS[d.criticality] ?? "#90CAF9"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </Grid>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                <Warning color="error" fontSize="small" />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Planes Vencidos
                </Typography>
                {(summary?.plans_overdue?.length ?? 0) === 0 && !loading && (
                  <Chip label="Al día" color="success" size="small" sx={{ ml: 1 }} />
                )}
              </Box>
              {loading ? <Skeleton variant="rectangular" height={140} /> : (
                (summary?.plans_overdue?.length ?? 0) === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No hay planes vencidos. ¡Buen trabajo!
                  </Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Plan</TableCell>
                          <TableCell>Equipo</TableCell>
                          <TableCell align="right">Vencido hace</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {summary?.plans_overdue.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>{p.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{fmtDate(p.next_execution)}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">{p.equipment_name ?? "—"}</Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Chip label={`${p.days_overdue}d`} color="error" size="small" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Planes próximos ───────────────────────────────────────────────── */}
      <Card>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <CalendarMonth color="primary" fontSize="small" />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Planes próximos a vencer (60 días)
            </Typography>
          </Box>
          <Divider sx={{ mb: 2 }} />
          {loading ? <Skeleton variant="rectangular" height={120} /> : (
            (summary?.plans_due_soon?.length ?? 0) === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No hay planes programados en los próximos 60 días.
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Código</TableCell>
                      <TableCell>Plan</TableCell>
                      <TableCell>Equipo</TableCell>
                      <TableCell>Fecha programada</TableCell>
                      <TableCell>Horas est.</TableCell>
                      <TableCell align="right">Días restantes</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {summary?.plans_due_soon.map((p) => (
                      <TableRow key={p.id} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600 }}>
                            {p.code}
                          </Typography>
                        </TableCell>
                        <TableCell><Typography variant="body2">{p.name}</Typography></TableCell>
                        <TableCell>
                          <Typography variant="body2">{p.equipment_name ?? "—"}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{fmtDate(p.next_execution)}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{p.estimated_hours ? `${p.estimated_hours}h` : "—"}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title={fmtDate(p.next_execution)}>
                            <Chip
                              label={`${p.days_until}d`}
                              size="small"
                              color={p.days_until <= 7 ? "error" : p.days_until <= 15 ? "warning" : "default"}
                            />
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}
