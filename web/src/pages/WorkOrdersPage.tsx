import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, Alert, Tooltip, CircularProgress, Skeleton,
} from "@mui/material";
import { Add, Refresh, Assignment, Edit, Delete } from "@mui/icons-material";
import { callFn } from "../lib/api";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface WorkOrder {
  id: string;
  wo_number: string;
  title: string;
  description: string | null;
  work_order_type: string;
  priority: string;
  status: string;
  equipment_id: string | null;
  equipment_code: string | null;
  equipment_name: string | null;
  planned_start: string | null;
  planned_end: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  notes: string | null;
  created_at: string;
}

interface Equipment { id: string; code: string; name: string; }

interface WoForm {
  title: string; description: string;
  work_order_type: string; priority: string; status: string;
  equipment_id: string;
  planned_start: string; planned_end: string;
  estimated_hours: string; notes: string;
}

const EMPTY: WoForm = {
  title: "", description: "", work_order_type: "corrective",
  priority: "medium", status: "created", equipment_id: "",
  planned_start: "", planned_end: "", estimated_hours: "", notes: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, "default" | "info" | "warning" | "success" | "error"> = {
  created: "default", planned: "info", in_progress: "warning",
  completed: "success", cancelled: "error",
};
const STATUS_LABEL: Record<string, string> = {
  created: "Creada", planned: "Planificada", in_progress: "En progreso",
  completed: "Completada", cancelled: "Cancelada",
};
const PRIO_COLOR: Record<string, "default" | "info" | "warning" | "error"> = {
  low: "default", medium: "info", high: "warning", critical: "error",
};
const PRIO_LABEL: Record<string, string> = {
  low: "Baja", medium: "Media", high: "Alta", critical: "Crítica",
};
const TYPE_LABEL: Record<string, string> = {
  corrective: "Correctivo", preventive: "Preventivo",
  predictive: "Predictivo", improvement: "Mejora",
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function WorkOrdersPage() {
  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<WoForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [woRes, eqRes] = await Promise.all([
        callFn<{ data: WorkOrder[] }>("tenant-work-orders", { action: "list" }),
        callFn<{ data: Equipment[] }>("tenant-equipment", { action: "list" }),
      ]);
      setRows(woRes.data ?? []);
      setEquipment(eqRes.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditId(null);
    setForm(EMPTY);
    setSaveError(null);
    setDialogOpen(true);
  }

  function openEdit(wo: WorkOrder) {
    setEditId(wo.id);
    setForm({
      title: wo.title, description: wo.description ?? "",
      work_order_type: wo.work_order_type, priority: wo.priority,
      status: wo.status, equipment_id: wo.equipment_id ?? "",
      planned_start: wo.planned_start?.slice(0, 16) ?? "",
      planned_end: wo.planned_end?.slice(0, 16) ?? "",
      estimated_hours: wo.estimated_hours?.toString() ?? "",
      notes: wo.notes ?? "",
    });
    setSaveError(null);
    setDialogOpen(true);
  }

  function handleClose() {
    setDialogOpen(false);
    setEditId(null);
    setForm(EMPTY);
    setSaveError(null);
  }

  function set<K extends keyof WoForm>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const data = {
        ...form,
        description:     form.description || undefined,
        equipment_id:    form.equipment_id || undefined,
        planned_start:   form.planned_start || undefined,
        planned_end:     form.planned_end || undefined,
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : undefined,
        notes:           form.notes || undefined,
      };
      if (editId) {
        await callFn("tenant-work-orders", { action: "update", id: editId, data });
      } else {
        await callFn("tenant-work-orders", { action: "create", data });
      }
      await load();
      handleClose();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta orden de trabajo?")) return;
    setDeleting(id);
    try {
      await callFn("tenant-work-orders", { action: "delete", id });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Assignment color="primary" />
          <Typography variant="h5">Órdenes de Trabajo</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Tooltip title="Recargar">
            <IconButton onClick={load} disabled={loading}><Refresh /></IconButton>
          </Tooltip>
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}>
            Nueva OT
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>OT #</TableCell>
                <TableCell>Título</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Prioridad</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Equipo</TableCell>
                <TableCell>Fecha planif.</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <TableCell key={j}><Skeleton /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">
                      No hay órdenes de trabajo. Crea la primera.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((wo) => (
                  <TableRow key={wo.id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600 }}>
                        {wo.wo_number}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{wo.title}</Typography>
                      {wo.description && (
                        <Typography variant="caption" color="text.secondary"
                          sx={{ display: "block", maxWidth: 220, overflow: "hidden",
                                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {wo.description}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{TYPE_LABEL[wo.work_order_type] ?? wo.work_order_type}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={PRIO_LABEL[wo.priority] ?? wo.priority}
                        color={PRIO_COLOR[wo.priority] ?? "default"} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Chip label={STATUS_LABEL[wo.status] ?? wo.status}
                        color={STATUS_COLOR[wo.status] ?? "default"} size="small" />
                    </TableCell>
                    <TableCell>
                      {wo.equipment_code ? (
                        <>
                          <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 12 }}>
                            {wo.equipment_code}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">{wo.equipment_name}</Typography>
                        </>
                      ) : "—"}
                    </TableCell>
                    <TableCell>{fmt(wo.planned_start)}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Editar">
                        <IconButton size="small" onClick={() => openEdit(wo)}><Edit fontSize="small" /></IconButton>
                      </Tooltip>
                      <Tooltip title="Eliminar">
                        <IconButton size="small" color="error"
                          disabled={deleting === wo.id}
                          onClick={() => handleDelete(wo.id)}>
                          {deleting === wo.id
                            ? <CircularProgress size={14} />
                            : <Delete fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* ── Diálogo ─────────────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? "Editar OT" : "Nueva orden de trabajo"}</DialogTitle>
        <Box component="form" onSubmit={handleSave}>
          <DialogContent>
            {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 0.5 }}>
              <TextField label="Título *" value={form.title}
                onChange={(e) => set("title", e.target.value)} required fullWidth />
              <TextField label="Descripción" value={form.description}
                onChange={(e) => set("description", e.target.value)} multiline rows={2} fullWidth />
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField label="Tipo" select value={form.work_order_type}
                  onChange={(e) => set("work_order_type", e.target.value)} fullWidth>
                  <MenuItem value="corrective">Correctivo</MenuItem>
                  <MenuItem value="preventive">Preventivo</MenuItem>
                  <MenuItem value="predictive">Predictivo</MenuItem>
                  <MenuItem value="improvement">Mejora</MenuItem>
                </TextField>
                <TextField label="Prioridad" select value={form.priority}
                  onChange={(e) => set("priority", e.target.value)} fullWidth>
                  <MenuItem value="low">Baja</MenuItem>
                  <MenuItem value="medium">Media</MenuItem>
                  <MenuItem value="high">Alta</MenuItem>
                  <MenuItem value="critical">Crítica</MenuItem>
                </TextField>
              </Box>
              <TextField label="Estado" select value={form.status}
                onChange={(e) => set("status", e.target.value)} fullWidth>
                <MenuItem value="created">Creada</MenuItem>
                <MenuItem value="planned">Planificada</MenuItem>
                <MenuItem value="in_progress">En progreso</MenuItem>
                <MenuItem value="completed">Completada</MenuItem>
                <MenuItem value="cancelled">Cancelada</MenuItem>
              </TextField>
              <TextField label="Equipo" select value={form.equipment_id}
                onChange={(e) => set("equipment_id", e.target.value)} fullWidth>
                <MenuItem value="">— Sin equipo —</MenuItem>
                {equipment.map((eq) => (
                  <MenuItem key={eq.id} value={eq.id}>{eq.code} — {eq.name}</MenuItem>
                ))}
              </TextField>
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField label="Inicio planificado" type="datetime-local" value={form.planned_start}
                  onChange={(e) => set("planned_start", e.target.value)}
                  fullWidth slotProps={{ inputLabel: { shrink: true } }} />
                <TextField label="Fin planificado" type="datetime-local" value={form.planned_end}
                  onChange={(e) => set("planned_end", e.target.value)}
                  fullWidth slotProps={{ inputLabel: { shrink: true } }} />
              </Box>
              <TextField label="Horas estimadas" type="number" value={form.estimated_hours}
                onChange={(e) => set("estimated_hours", e.target.value)}
                slotProps={{ htmlInput: { min: 0, step: 0.5 } }} fullWidth />
              <TextField label="Notas" value={form.notes}
                onChange={(e) => set("notes", e.target.value)} multiline rows={2} fullWidth />
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={handleClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={saving}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Add />}>
              {saving ? "Guardando…" : editId ? "Guardar cambios" : "Crear OT"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}
