import { useEffect, useState } from "react";
import {
  Drawer, Box, Typography, IconButton, Chip, Skeleton,
  Table, TableBody, TableCell, TableHead, TableRow, Grid, Card, CardContent,
  Tab, Tabs, Tooltip,
} from "@mui/material";
import { Close, Build, CalendarMonth, History, Info } from "@mui/icons-material";
import { callFn } from "../lib/api";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Detail {
  equipment: Record<string, unknown>;
  work_orders: WO[];
  plans: Plan[];
  stats: { total_wo: number; completed_wo: number; total_hours: number };
}
interface WO {
  id: string; wo_number: string; title: string; work_order_type: string;
  priority: string; status: string; planned_start: string | null;
  actual_hours: number | null; assigned_to_name: string | null; created_at: string;
}
interface Plan {
  id: string; code: string; name: string; frequency_value: number | null;
  frequency_unit: string | null; next_execution: string | null;
  last_execution: string | null; is_active: boolean;
}

// ─── Etiquetas ────────────────────────────────────────────────────────────────

const WO_STATUS_LABEL: Record<string, string> = {
  draft: "Borrador", planned: "Planificada", released: "Liberada",
  in_progress: "En progreso", completed: "Completada", closed: "Cerrada", canceled: "Cancelada",
};
const WO_STATUS_COLOR: Record<string, "default" | "info" | "warning" | "success" | "error" | "secondary"> = {
  draft: "default", planned: "info", released: "secondary", in_progress: "warning",
  completed: "success", closed: "success", canceled: "error",
};
const WO_TYPE_LABEL: Record<string, string> = {
  corrective: "Correctivo", preventive: "Preventivo", predictive: "Predictivo", inspection: "Inspección",
};
const EQ_STATUS_LABEL: Record<string, string> = {
  operational: "Operativo", down: "Fuera de servicio",
  maintenance: "En mantenimiento", decommissioned: "Dado de baja",
};
const CRIT_LABEL: Record<string, string> = {
  critical: "Crítico", high: "Alto", medium: "Medio", low: "Bajo",
};
const FREQ_UNIT: Record<string, string> = {
  days: "días", weeks: "semanas", months: "meses", years: "años",
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso as string).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function EquipmentDetailDrawer({ equipmentId, onClose }: {
  equipmentId: string | null; onClose: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    if (!equipmentId) { setDetail(null); return; }
    setLoading(true); setTab(0);
    callFn<Detail>("tenant-equipment", { action: "detail", id: equipmentId })
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [equipmentId]);

  const e = detail?.equipment ?? {};
  const s = (k: string) => (e[k] as string | null) ?? null;

  return (
    <Drawer anchor="right" open={!!equipmentId} onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: "100%", sm: 560 }, p: 0 } } }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  px: 3, py: 2, borderBottom: "1px solid", borderColor: "divider" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Build color="primary" />
          <Box>
            {loading ? <Skeleton width={180} /> : (
              <>
                <Typography variant="h6" sx={{ lineHeight: 1.2 }}>{s("name") ?? "Equipo"}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                  {s("code")}
                </Typography>
              </>
            )}
          </Box>
        </Box>
        <IconButton onClick={onClose}><Close /></IconButton>
      </Box>

      {loading ? (
        <Box sx={{ p: 3 }}><Skeleton variant="rectangular" height={300} /></Box>
      ) : !detail ? (
        <Box sx={{ p: 3 }}><Typography color="text.secondary">No se pudo cargar el detalle.</Typography></Box>
      ) : (
        <Box>
          {/* Métricas rápidas */}
          <Grid container spacing={1.5} sx={{ p: 2 }}>
            <Grid size={4}>
              <Card variant="outlined"><CardContent sx={{ textAlign: "center", py: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>{detail.stats.total_wo}</Typography>
                <Typography variant="caption" color="text.secondary">OTs totales</Typography>
              </CardContent></Card>
            </Grid>
            <Grid size={4}>
              <Card variant="outlined"><CardContent sx={{ textAlign: "center", py: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Typography variant="h5" sx={{ fontWeight: 700, color: "success.main" }}>{detail.stats.completed_wo}</Typography>
                <Typography variant="caption" color="text.secondary">Completadas</Typography>
              </CardContent></Card>
            </Grid>
            <Grid size={4}>
              <Card variant="outlined"><CardContent sx={{ textAlign: "center", py: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>{Number(detail.stats.total_hours).toFixed(1)}h</Typography>
                <Typography variant="caption" color="text.secondary">Horas mant.</Typography>
              </CardContent></Card>
            </Grid>
          </Grid>

          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth"
            sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
            <Tab icon={<Info fontSize="small" />} iconPosition="start" label="Información" sx={{ minHeight: 48 }} />
            <Tab icon={<History fontSize="small" />} iconPosition="start" label={`OTs (${detail.work_orders.length})`} sx={{ minHeight: 48 }} />
            <Tab icon={<CalendarMonth fontSize="small" />} iconPosition="start" label={`Planes (${detail.plans.length})`} sx={{ minHeight: 48 }} />
          </Tabs>

          {/* Tab Información */}
          {tab === 0 && (
            <Box sx={{ p: 3 }}>
              <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
                <Chip size="small" label={EQ_STATUS_LABEL[s("status") ?? ""] ?? s("status")}
                  color={s("status") === "operational" ? "success" : s("status") === "down" ? "error" : "warning"} />
                <Chip size="small" variant="outlined" label={`Criticidad: ${CRIT_LABEL[s("criticality") ?? ""] ?? s("criticality")}`} />
              </Box>
              <InfoRow label="Descripción" value={s("description")} />
              <InfoRow label="Ubicación" value={s("location_name") ? `${s("location_code")} — ${s("location_name")}` : null} />
              <InfoRow label="Tipo" value={s("equipment_type")} />
              <InfoRow label="Fabricante" value={s("manufacturer")} />
              <InfoRow label="Modelo" value={s("model")} />
              <InfoRow label="N° de serie" value={s("serial_number")} />
              <InfoRow label="Fecha instalación" value={fmtDate(s("install_date"))} />
              <InfoRow label="Clave SAP" value={s("sap_key")} />
            </Box>
          )}

          {/* Tab OTs */}
          {tab === 1 && (
            <Box sx={{ px: 1, py: 1 }}>
              {detail.work_orders.length === 0 ? (
                <Typography color="text.secondary" sx={{ p: 3, textAlign: "center" }}>
                  Sin órdenes de trabajo registradas.
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>OT</TableCell>
                      <TableCell>Estado</TableCell>
                      <TableCell>Fecha</TableCell>
                      <TableCell align="right">Horas</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detail.work_orders.map((wo) => (
                      <TableRow key={wo.id}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{wo.title}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                            {wo.wo_number} · {WO_TYPE_LABEL[wo.work_order_type] ?? wo.work_order_type}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={WO_STATUS_LABEL[wo.status] ?? wo.status}
                            color={WO_STATUS_COLOR[wo.status] ?? "default"} />
                        </TableCell>
                        <TableCell>
                          <Tooltip title={wo.assigned_to_name ?? "Sin asignar"}>
                            <Typography variant="body2">{fmtDate(wo.planned_start ?? wo.created_at)}</Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="right">{wo.actual_hours ? `${wo.actual_hours}h` : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Box>
          )}

          {/* Tab Planes */}
          {tab === 2 && (
            <Box sx={{ px: 1, py: 1 }}>
              {detail.plans.length === 0 ? (
                <Typography color="text.secondary" sx={{ p: 3, textAlign: "center" }}>
                  Sin planes de mantenimiento asociados.
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Plan</TableCell>
                      <TableCell>Frecuencia</TableCell>
                      <TableCell>Próxima</TableCell>
                      <TableCell>Estado</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detail.plans.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{p.name}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>{p.code}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {p.frequency_value ? `Cada ${p.frequency_value} ${FREQ_UNIT[p.frequency_unit ?? ""] ?? p.frequency_unit}` : "—"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2"
                            sx={{ color: p.next_execution && new Date(p.next_execution) < new Date() ? "error.main" : "inherit" }}>
                            {fmtDate(p.next_execution)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={p.is_active ? "Activo" : "Inactivo"}
                            color={p.is_active ? "success" : "default"} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Box>
          )}
        </Box>
      )}
    </Drawer>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <Box sx={{ display: "flex", py: 0.75, borderBottom: "1px solid", borderColor: "divider" }}>
      <Typography variant="body2" color="text.secondary" sx={{ width: 150, flexShrink: 0 }}>{label}</Typography>
      <Typography variant="body2">{value ?? "—"}</Typography>
    </Box>
  );
}
